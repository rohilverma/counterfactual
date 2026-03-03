import { useState, useCallback } from 'react';
import type { Trade } from '../types/Trade';
import type { PortfolioData } from '../types/PortfolioData';
import type { StockPrice } from '../types/StockPrice';
import type { StockSplit } from '../types/StockSplit';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';
import type { StockBreakdownData } from '../types/StockBreakdownData';
import type { SummaryData } from '../types/SummaryData';
import { fetchMultipleStocks, fetchStockData, getHighPriceOnDate } from '../utils/stockApi';
import {
  calculatePortfolioTimeSeries,
  calculateStockBreakdown,
  calculateSummary,
  getDateRange,
} from '../utils/calculations';
import { mergeWithHistoricalSplits } from '../config/historicalSplits';
import { perf } from '../utils/logger';

interface UseStockDataReturn {
  loading: boolean;
  error: string | null;
  timeSeriesData: PortfolioDataPoint[];
  breakdownData: StockBreakdownData[];
  summaryData: SummaryData | null;
  loadData: (data: PortfolioData) => Promise<void>;
}

export function useStockData(): UseStockDataReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<PortfolioDataPoint[]>([]);
  const [breakdownData, setBreakdownData] = useState<StockBreakdownData[]>([]);
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null);

  const loadData = useCallback(async (data: PortfolioData) => {
    const { trades, cashFlows } = data;
    if (trades.length === 0) {
      setError('No trades provided');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      perf.start('loadData:total');

      // Get unique tickers
      const tickers = [...new Set(trades.map(t => t.ticker))];
      const allTickers = [...tickers, 'SPY'];

      // Get date range
      const { startDate, endDate } = getDateRange(trades);

      // Fetch all stock prices and splits
      perf.start('loadData:fetchStocks');
      const { prices: allPrices, splits: allSplits } = await fetchMultipleStocks(allTickers, startDate, endDate);
      perf.end('loadData:fetchStocks');

      const spyPrices = allPrices['SPY'] || [];
      const stockPrices: Record<string, StockPrice[]> = {};
      const stockSplits: Record<string, StockSplit[]> = {};
      for (const ticker of tickers) {
        stockPrices[ticker] = allPrices[ticker] || [];
        // Merge API splits with manual historical splits for delisted/problematic tickers
        const apiSplits = allSplits[ticker] || [];
        stockSplits[ticker] = mergeWithHistoricalSplits(ticker, apiSplits);
        if (ticker === 'TVIX') {
          console.log(`[DEBUG] TVIX API splits:`, apiSplits);
          console.log(`[DEBUG] TVIX merged splits:`, stockSplits[ticker]);
        }
      }

      // Fill in missing prices with day high
      perf.start('loadData:fillPrices');
      const tradesWithPrices: Trade[] = trades.map(trade => {
        if (trade.price !== undefined) {
          return trade;
        }
        const tickerPrices = stockPrices[trade.ticker] || [];
        const highPrice = getHighPriceOnDate(tickerPrices, trade.date);
        return {
          ...trade,
          price: highPrice ?? 0,
        };
      });
      perf.end('loadData:fillPrices');

      // Resolve vest cashflows: the Schwab parser emits type:'vest' placeholders
      // (amount 0) for vests without a price in the CSV.  Now that we have Yahoo
      // prices, fill in the actual vest value from the matching trade.
      // If the price is still missing (not in the bulk fetch), fetch individually.
      const resolvedCashFlows = await Promise.all(cashFlows.map(async cf => {
        if (cf.type !== 'vest' || cf.amount > 0) return cf;
        const tradeId = cf.id.replace(/^vest-/, '');
        const trade = tradesWithPrices.find(t => t.id === tradeId);
        if (trade?.price) {
          return { ...cf, amount: trade.shares * trade.price };
        }
        // Fallback: fetch price directly for this ticker/date
        if (trade && cf.ticker) {
          try {
            const vestDate = new Date(cf.date + 'T12:00:00Z');
            const start = new Date(vestDate);
            start.setDate(start.getDate() - 7);
            const end = new Date(vestDate);
            end.setDate(end.getDate() + 1);
            const { prices } = await fetchStockData(
              cf.ticker,
              start.toISOString().split('T')[0],
              end.toISOString().split('T')[0],
            );
            const price = getHighPriceOnDate(prices, cf.date);
            if (price) {
              trade.price = price;
              return { ...cf, amount: trade.shares * price };
            }
          } catch {
            // Leave vest unresolved
          }
        }
        return cf;
      }));

      // Calculate all data
      perf.start('loadData:calculateTimeSeries');
      const timeSeries = calculatePortfolioTimeSeries(tradesWithPrices, stockPrices, spyPrices, resolvedCashFlows, stockSplits);
      perf.end('loadData:calculateTimeSeries');

      perf.start('loadData:calculateBreakdown');
      const breakdown = calculateStockBreakdown(tradesWithPrices, stockPrices, spyPrices);
      perf.end('loadData:calculateBreakdown');

      perf.start('loadData:calculateSummary');
      const summary = calculateSummary(breakdown, resolvedCashFlows, tradesWithPrices);
      perf.end('loadData:calculateSummary');

      perf.end('loadData:total');

      setTimeSeriesData(timeSeries);
      setBreakdownData(breakdown);
      setSummaryData(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock data');
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    timeSeriesData,
    breakdownData,
    summaryData,
    loadData,
  };
}
