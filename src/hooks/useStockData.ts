import { useState, useCallback } from 'react';
import type { Trade, StockPrice, StockSplit, PortfolioDataPoint, StockBreakdownData, SummaryData, PortfolioData } from '../types';
import { fetchMultipleStocks, getHighPriceOnDate } from '../utils/stockApi';
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

      // Calculate all data
      perf.start('loadData:calculateTimeSeries');
      const timeSeries = calculatePortfolioTimeSeries(tradesWithPrices, stockPrices, spyPrices, cashFlows, stockSplits);
      perf.end('loadData:calculateTimeSeries');

      perf.start('loadData:calculateBreakdown');
      const breakdown = calculateStockBreakdown(tradesWithPrices, stockPrices, spyPrices);
      perf.end('loadData:calculateBreakdown');

      perf.start('loadData:calculateSummary');
      const summary = calculateSummary(breakdown, cashFlows, tradesWithPrices);
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
