import type { Trade, StockPrice, StockSplit, PortfolioDataPoint, StockBreakdownData, SummaryData, CashFlow } from '../types';
import { getPriceOnDate, getLatestPrice } from './stockApi';

// Build a date-indexed price map for O(1) lookups
function buildPriceMap(prices: StockPrice[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of prices) {
    map.set(p.date, p.price);
  }
  return map;
}

// Get price on or before date using sorted array (binary search approach)
function getPriceOnOrBefore(prices: StockPrice[], targetDate: string): number | null {
  if (prices.length === 0) return null;

  // Binary search for the largest date <= targetDate
  let left = 0;
  let right = prices.length - 1;
  let result: number | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (prices[mid].date <= targetDate) {
      result = prices[mid].price;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result ?? (prices.length > 0 ? prices[0].price : null);
}

// Calculate cumulative split factor for all splits AFTER a given date
// This is used to un-adjust Yahoo's split-adjusted prices back to actual historical prices
function getSplitAdjustmentFactor(splits: StockSplit[], priceDate: string): number {
  let factor = 1;
  for (const split of splits) {
    // If the split happened AFTER the price date, we need to adjust
    if (split.date > priceDate) {
      factor *= split.splitFactor;
    }
  }
  return factor;
}

// Build unadjusted price map - convert Yahoo's split-adjusted prices back to actual historical prices
function buildUnadjustedPriceMap(prices: StockPrice[], splits: StockSplit[]): Map<string, number> {
  const map = new Map<string, number>();
  const sortedSplits = [...splits].sort((a, b) => a.date.localeCompare(b.date));

  for (const p of prices) {
    // Multiply by split factor to un-adjust the price
    const factor = getSplitAdjustmentFactor(sortedSplits, p.date);
    map.set(p.date, p.price * factor);
  }
  return map;
}

// Get unadjusted price on or before a date
function getUnadjustedPriceOnOrBefore(prices: StockPrice[], splits: StockSplit[], targetDate: string): number | null {
  if (prices.length === 0) return null;

  const sortedSplits = [...splits].sort((a, b) => a.date.localeCompare(b.date));

  // Binary search for the largest date <= targetDate
  let left = 0;
  let right = prices.length - 1;
  let resultPrice: number | null = null;
  let resultDate: string | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (prices[mid].date <= targetDate) {
      resultPrice = prices[mid].price;
      resultDate = prices[mid].date;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (resultPrice === null) {
    resultPrice = prices.length > 0 ? prices[0].price : null;
    resultDate = prices.length > 0 ? prices[0].date : null;
  }

  if (resultPrice === null || resultDate === null) return null;

  // Apply split adjustment
  const factor = getSplitAdjustmentFactor(sortedSplits, resultDate);
  return resultPrice * factor;
}

export function calculatePortfolioTimeSeries(
  trades: Trade[],
  stockPrices: Record<string, StockPrice[]>,
  spyPrices: StockPrice[],
  cashFlows: CashFlow[] = [],
  splits: Record<string, StockSplit[]> = {}
): PortfolioDataPoint[] {
  if (trades.length === 0 || spyPrices.length === 0) {
    return [];
  }

  // Sort trades by date (string comparison works for YYYY-MM-DD)
  const sortedTrades = [...trades].sort((a, b) => a.date.localeCompare(b.date));

  // Pre-build UNADJUSTED price maps - convert Yahoo's split-adjusted prices back to actual historical prices
  // This allows us to use raw share counts from the CSV directly
  const priceMaps: Record<string, Map<string, number>> = {};
  for (const [ticker, prices] of Object.entries(stockPrices)) {
    const tickerSplits = splits[ticker] || [];
    priceMaps[ticker] = buildUnadjustedPriceMap(prices, tickerSplits);
    if (ticker === 'TVIX') {
      console.log(`[DEBUG] TVIX splits passed to buildUnadjustedPriceMap:`, tickerSplits);
      const dec27Price = priceMaps[ticker].get('2018-12-27');
      const dec10Price = priceMaps[ticker].get('2018-12-10');
      console.log(`[DEBUG] TVIX unadjusted price on 2018-12-27: $${dec27Price}`);
      console.log(`[DEBUG] TVIX unadjusted price on 2018-12-10: $${dec10Price}`);
    }
  }

  // Calculate cost basis from cash flows if available, otherwise from trades
  const totalCashInflows = cashFlows.reduce((sum, cf) => sum + cf.amount, 0);
  const useCashFlowBasis = totalCashInflows > 0;

  // Pre-calculate cumulative cash inflows by date for time series
  const sortedCashFlows = [...cashFlows].sort((a, b) => a.date.localeCompare(b.date));

  // Build deposit-based SPY shares (what if each deposit was invested in SPY?)
  // Filter to only deposits (not dividends, cap gains, etc.)
  const deposits = cashFlows.filter(cf => cf.type === 'deposit');
  const sortedDeposits = [...deposits].sort((a, b) => a.date.localeCompare(b.date));

  // Pre-calculate cumulative SPY shares from deposits by date
  const depositSpySharesByDate = new Map<string, number>();
  let cumulativeDepositSpyShares = 0;

  for (const deposit of sortedDeposits) {
    const spyPriceAtDeposit = getPriceOnOrBefore(spyPrices, deposit.date);
    if (spyPriceAtDeposit) {
      cumulativeDepositSpyShares += deposit.amount / spyPriceAtDeposit;
      depositSpySharesByDate.set(deposit.date, cumulativeDepositSpyShares);
    }
  }

  // If no deposits available, fall back to trade-based calculation
  const useDepositBasis = deposits.length > 0;

  // Pre-calculate SPY shares change for each trade (fallback for when no deposits)
  const tradeSpySharesChange: number[] = sortedTrades.map(trade => {
    const tradeAmount = trade.shares * (trade.price ?? 0);
    const spyPriceAtTrade = getPriceOnOrBefore(spyPrices, trade.date);
    if (!spyPriceAtTrade) return 0;
    const spyShares = tradeAmount / spyPriceAtTrade;
    return trade.type === 'sell' ? -spyShares : spyShares;
  });

  const dataPoints: PortfolioDataPoint[] = [];

  // Track raw shares per ticker - no split adjustment needed since we use unadjusted prices
  const sharesPerTicker: Record<string, number> = {};
  let tradeIndex = 0;
  let tradeBasedSpyShares = 0;
  let tradeCostBasis = 0;

  for (const spyPrice of spyPrices) {
    const currentDate = spyPrice.date;

    // Process all trades up to and including current date
    while (tradeIndex < sortedTrades.length && sortedTrades[tradeIndex].date <= currentDate) {
      const trade = sortedTrades[tradeIndex];
      const tradeAmount = trade.shares * (trade.price ?? 0);

      if (trade.type === 'sell') {
        sharesPerTicker[trade.ticker] = (sharesPerTicker[trade.ticker] || 0) - trade.shares;
        tradeCostBasis -= tradeAmount;
      } else {
        sharesPerTicker[trade.ticker] = (sharesPerTicker[trade.ticker] || 0) + trade.shares;
        tradeCostBasis += tradeAmount;
      }

      tradeBasedSpyShares += tradeSpySharesChange[tradeIndex];
      tradeIndex++;
    }

    // Calculate current portfolio value using unadjusted prices
    let portfolioValue = 0;
    const debugDate = '2020-04-06';
    if (currentDate === debugDate) {
      console.log(`[${debugDate}] All holdings:`, JSON.stringify(sharesPerTicker));
    }
    for (const [ticker, shares] of Object.entries(sharesPerTicker)) {
      if (currentDate === debugDate) {
        console.log(`[${debugDate}] ${ticker}: ${shares} shares (skipping: ${shares <= 0})`);
      }
      if (shares <= 0) continue;
      const priceMap = priceMaps[ticker];
      let currentStockPrice = priceMap?.get(currentDate);
      if (currentStockPrice === undefined) {
        // Fallback: get unadjusted price on or before current date
        currentStockPrice = getUnadjustedPriceOnOrBefore(
          stockPrices[ticker] || [],
          splits[ticker] || [],
          currentDate
        ) ?? 0;
      }
      const tickerValue = shares * currentStockPrice;
      if (currentDate === debugDate) {
        console.log(`[${debugDate}] ${ticker}: ${shares} shares @ $${currentStockPrice.toFixed(2)} = $${tickerValue.toFixed(2)}`);
      }
      portfolioValue += tickerValue;
    }
    if (currentDate === debugDate) {
      console.log(`[${debugDate}] TOTAL PORTFOLIO VALUE: $${portfolioValue.toFixed(2)}`);
    }

    // Calculate counterfactual value using deposit-based SPY shares if available
    let counterfactualSpyShares: number;
    if (useDepositBasis) {
      // Find the cumulative SPY shares from deposits as of current date
      counterfactualSpyShares = 0;
      for (const deposit of sortedDeposits) {
        if (deposit.date > currentDate) break;
        const spySharesAtDate = depositSpySharesByDate.get(deposit.date);
        if (spySharesAtDate !== undefined) {
          counterfactualSpyShares = spySharesAtDate;
        }
      }
    } else {
      // Fall back to trade-based calculation
      counterfactualSpyShares = tradeBasedSpyShares;
    }

    const counterfactualValue = Math.max(0, counterfactualSpyShares) * spyPrice.price;

    // Use cash flow basis if available, otherwise trade basis
    let costBasis: number;
    if (useCashFlowBasis) {
      costBasis = sortedCashFlows
        .filter(cf => cf.date <= currentDate)
        .reduce((sum, cf) => sum + cf.amount, 0);
    } else {
      costBasis = Math.max(0, tradeCostBasis);
    }

    if (costBasis > 0) {
      const portfolioReturn = ((portfolioValue - costBasis) / costBasis) * 100;
      const counterfactualReturn = ((counterfactualValue - costBasis) / costBasis) * 100;

      dataPoints.push({
        date: currentDate,
        portfolioValue: Math.round(portfolioValue * 100) / 100,
        counterfactualValue: Math.round(counterfactualValue * 100) / 100,
        costBasis: Math.round(costBasis * 100) / 100,
        portfolioReturn: Math.round(portfolioReturn * 100) / 100,
        counterfactualReturn: Math.round(counterfactualReturn * 100) / 100,
      });
    }
  }

  return dataPoints;
}

export function calculateStockBreakdown(
  trades: Trade[],
  stockPrices: Record<string, StockPrice[]>,
  spyPrices: StockPrice[]
): StockBreakdownData[] {
  // Aggregate trades by ticker, handling buys and sells
  const aggregated: Record<string, {
    totalShares: number;
    totalCost: number;  // Net cost (buys - sells)
    totalSpyShares: number;
    firstBuyDate: string;
  }> = {};

  const currentSpyPrice = getLatestPrice(spyPrices);

  for (const trade of trades) {
    const tradePrice = trade.price ?? 0;
    const tradeAmount = trade.shares * tradePrice;
    const spyPriceAtTrade = getPriceOnDate(spyPrices, trade.date);
    const spySharesChange = spyPriceAtTrade ? tradeAmount / spyPriceAtTrade : 0;

    // Use raw shares directly - SPL entries in the CSV already account for splits
    // No split adjustment needed here
    const shares = trade.shares;

    if (!aggregated[trade.ticker]) {
      aggregated[trade.ticker] = {
        totalShares: 0,
        totalCost: 0,
        totalSpyShares: 0,
        firstBuyDate: trade.date,
      };
    }

    if (trade.type === 'sell') {
      aggregated[trade.ticker].totalShares -= shares;
      aggregated[trade.ticker].totalCost -= tradeAmount;
      aggregated[trade.ticker].totalSpyShares -= spySharesChange;
    } else {
      aggregated[trade.ticker].totalShares += shares;
      aggregated[trade.ticker].totalCost += tradeAmount;
      aggregated[trade.ticker].totalSpyShares += spySharesChange;

      // Track earliest buy date
      if (trade.date < aggregated[trade.ticker].firstBuyDate) {
        aggregated[trade.ticker].firstBuyDate = trade.date;
      }
    }
  }

  const breakdown: StockBreakdownData[] = [];

  for (const [ticker, data] of Object.entries(aggregated)) {
    // Skip if no shares remaining
    if (data.totalShares <= 0) continue;

    const tickerPrices = stockPrices[ticker];
    if (!tickerPrices || tickerPrices.length === 0) continue;

    const currentPrice = getLatestPrice(tickerPrices);
    const currentValue = data.totalShares * currentPrice;
    const spyCurrentValue = Math.max(0, data.totalSpyShares) * currentSpyPrice;
    const avgBuyPrice = data.totalShares > 0 ? Math.max(0, data.totalCost) / data.totalShares : 0;

    const netInvestment = Math.max(0, data.totalCost);
    const gain = currentValue - netInvestment;
    const spyGain = spyCurrentValue - netInvestment;
    const difference = gain - spyGain;

    breakdown.push({
      ticker,
      shares: Math.round(data.totalShares * 1000000) / 1000000,
      buyDate: data.firstBuyDate,
      buyPrice: Math.round(avgBuyPrice * 100) / 100,
      currentPrice,
      currentValue: Math.round(currentValue * 100) / 100,
      spyShares: Math.round(Math.max(0, data.totalSpyShares) * 100) / 100,
      spyCurrentValue: Math.round(spyCurrentValue * 100) / 100,
      gain: Math.round(gain * 100) / 100,
      spyGain: Math.round(spyGain * 100) / 100,
      difference: Math.round(difference * 100) / 100,
    });
  }

  // Sort by difference (best performers first)
  breakdown.sort((a, b) => b.difference - a.difference);

  return breakdown;
}

export function calculateSummary(
  breakdown: StockBreakdownData[],
  cashFlows: CashFlow[] = [],
  trades: Trade[] = []
): SummaryData {
  if (breakdown.length === 0) {
    return {
      totalCostBasis: 0,
      totalPortfolioValue: 0,
      totalCounterfactualValue: 0,
      portfolioReturn: 0,
      counterfactualReturn: 0,
      totalDifference: 0,
      percentageDifference: 0,
      bestPerformer: null,
      worstPerformer: null,
    };
  }

  // Calculate total invested from trades (net of buys and sells)
  let totalCostBasis = trades.reduce((sum, t) => {
    const amount = t.shares * (t.price ?? 0);
    return sum + (t.type === 'sell' ? -amount : amount);
  }, 0);
  totalCostBasis = Math.max(0, totalCostBasis);

  const totalPortfolioValue = breakdown.reduce((sum, b) => sum + b.currentValue, 0);
  const totalCounterfactualValue = breakdown.reduce((sum, b) => sum + b.spyCurrentValue, 0);
  const portfolioReturn = totalCostBasis > 0
    ? ((totalPortfolioValue - totalCostBasis) / totalCostBasis) * 100
    : 0;
  const counterfactualReturn = totalCostBasis > 0
    ? ((totalCounterfactualValue - totalCostBasis) / totalCostBasis) * 100
    : 0;
  const totalDifference = totalPortfolioValue - totalCounterfactualValue;
  const percentageDifference = totalCostBasis > 0
    ? ((totalDifference / totalCostBasis) * 100)
    : 0;

  // Find best and worst performers (by difference vs SPY)
  let bestPerformer = breakdown[0];
  let worstPerformer = breakdown[0];

  for (const stock of breakdown) {
    if (stock.difference > bestPerformer.difference) {
      bestPerformer = stock;
    }
    if (stock.difference < worstPerformer.difference) {
      worstPerformer = stock;
    }
  }

  return {
    totalCostBasis: Math.round(totalCostBasis * 100) / 100,
    totalPortfolioValue: Math.round(totalPortfolioValue * 100) / 100,
    totalCounterfactualValue: Math.round(totalCounterfactualValue * 100) / 100,
    portfolioReturn: Math.round(portfolioReturn * 100) / 100,
    counterfactualReturn: Math.round(counterfactualReturn * 100) / 100,
    totalDifference: Math.round(totalDifference * 100) / 100,
    percentageDifference: Math.round(percentageDifference * 100) / 100,
    bestPerformer: { ticker: bestPerformer.ticker, difference: bestPerformer.difference },
    worstPerformer: { ticker: worstPerformer.ticker, difference: worstPerformer.difference },
  };
}

// Get the end date for API requests (exclusive, so add 1 day after market close)
function getEndDateForApi(): string {
  const etNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  if (etNow.getHours() >= 16) {
    etNow.setDate(etNow.getDate() + 1);
  }
  const year = etNow.getFullYear();
  const month = String(etNow.getMonth() + 1).padStart(2, '0');
  const day = String(etNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRange(trades: Trade[]): { startDate: string; endDate: string } {
  const endDate = getEndDateForApi();

  if (trades.length === 0) {
    const oneYearAgo = new Date(endDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return {
      startDate: oneYearAgo.toISOString().split('T')[0],
      endDate,
    };
  }

  const dates = trades.map(t => new Date(t.date).getTime());
  const minDate = new Date(Math.min(...dates));

  return {
    startDate: minDate.toISOString().split('T')[0],
    endDate,
  };
}
