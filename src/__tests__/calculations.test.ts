import { describe, it, expect, vi } from 'vitest';
import {
  calculatePortfolioTimeSeries,
  calculateStockBreakdown,
  calculateSummary,
} from '../utils/calculations';
import type { Trade } from '../types/Trade';
import type { CashFlow } from '../types/CashFlow';
import type { StockPrice } from '../types/StockPrice';
import type { StockBreakdownData } from '../types/StockBreakdownData';
import type { StockSplit } from '../types/StockSplit';

// Mock the logger to avoid fetch calls
vi.mock('../utils/logger', () => ({
  perf: { start: vi.fn(), end: vi.fn() },
}));

// Mock stockApi helpers used by calculateStockBreakdown
vi.mock('../utils/stockApi', () => ({
  getPriceOnDate: (prices: StockPrice[], date: string): number | null => {
    for (let i = prices.length - 1; i >= 0; i--) {
      if (prices[i].date <= date) return prices[i].price;
    }
    return prices.length > 0 ? prices[0].price : null;
  },
  getLatestPrice: (prices: StockPrice[]): number => {
    return prices.length > 0 ? prices[prices.length - 1].price : 0;
  },
}));

// --- test data ---

const spyPrices: StockPrice[] = [
  { date: '2023-01-02', price: 380 },
  { date: '2023-01-03', price: 382 },
  { date: '2023-01-04', price: 385 },
  { date: '2023-01-05', price: 383 },
  { date: '2023-01-06', price: 388 },
];

const aaplPrices: StockPrice[] = [
  { date: '2023-01-02', price: 130 },
  { date: '2023-01-03', price: 132 },
  { date: '2023-01-04', price: 135 },
  { date: '2023-01-05', price: 133 },
  { date: '2023-01-06', price: 138 },
];

function makeTrade(overrides: Partial<Trade> & { ticker: string; date: string; shares: number }): Trade {
  return {
    id: overrides.id ?? `${overrides.ticker}-${overrides.date}`,
    type: 'buy',
    ...overrides,
  };
}

// ============================================================
// Total deposit value (cost basis from cash flows)
// ============================================================

describe('total deposit value', () => {
  it('cost basis equals the single deposit amount', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const cashFlows: CashFlow[] = [
      { id: 'cf1', date: '2023-01-02', amount: 2000, type: 'deposit' },
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices, cashFlows);
    const point = result.find(p => p.date === '2023-01-02');
    expect(point!.totalDeposits).toBe(2000);
  });

  it('cost basis accumulates across multiple deposits', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 5, price: 135, id: 'a2' }),
    ];
    const cashFlows: CashFlow[] = [
      { id: 'cf1', date: '2023-01-02', amount: 1500, type: 'deposit' },
      { id: 'cf2', date: '2023-01-04', amount: 800, type: 'deposit' },
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices, cashFlows);

    const beforeSecond = result.find(p => p.date === '2023-01-03');
    expect(beforeSecond!.totalDeposits).toBe(1500);

    const afterSecond = result.find(p => p.date === '2023-01-04');
    expect(afterSecond!.totalDeposits).toBe(2300);
  });

  it('cost basis falls back to trade cost when no cash flows', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);
    const point = result.find(p => p.date === '2023-01-02');
    expect(point!.totalDeposits).toBe(1300);
  });

  it('sell reduces the trade-based cost basis', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 5, price: 135, type: 'sell', id: 'a2' }),
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);
    const afterSell = result.find(p => p.date === '2023-01-04');
    // Trade cost basis: 10*130 - 5*135 = 1300 - 675 = 625
    expect(afterSell!.totalDeposits).toBe(625);
  });
});

// ============================================================
// Total portfolio value
// ============================================================

describe('total portfolio value', () => {
  it('equals shares times price for a single holding', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const point = result.find(p => p.date === '2023-01-02');
    expect(point!.portfolioValue).toBe(1300);
  });

  it('updates with changing stock price', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const later = result.find(p => p.date === '2023-01-06');
    expect(later!.portfolioValue).toBe(1380); // 10 * 138
  });

  it('sums holdings across multiple tickers', () => {
    const googPrices: StockPrice[] = [
      { date: '2023-01-02', price: 90 },
      { date: '2023-01-03', price: 92 },
    ];
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-02', shares: 5, price: 90, id: 'g1' }),
    ];
    const result = calculatePortfolioTimeSeries(
      trades,
      { AAPL: aaplPrices, GOOG: googPrices },
      spyPrices.slice(0, 2),
    );

    const point = result.find(p => p.date === '2023-01-02');
    expect(point!.portfolioValue).toBe(1750); // 10*130 + 5*90
  });

  it('reduces value after a sell', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 5, price: 135, type: 'sell', id: 'a2' }),
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const afterSell = result.find(p => p.date === '2023-01-06');
    expect(afterSell!.portfolioValue).toBe(690); // 5 * 138
  });

  it('returns empty when no trades', () => {
    expect(calculatePortfolioTimeSeries([], {}, spyPrices)).toEqual([]);
  });

  it('returns empty when no SPY prices', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    expect(calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, [])).toEqual([]);
  });
});

// ============================================================
// SP500 counterfactual projections
// ============================================================

describe('SP500 counterfactual projections', () => {
  it('invests the same dollar amount in SPY on the trade date', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const buyDay = result.find(p => p.date === '2023-01-02');
    // Trade cost = 10*130 = 1300. SPY price on Jan 2 = 380.
    // SPY shares = 1300/380 ≈ 3.4211. Counterfactual value = 3.4211 * 380 = 1300.
    expect(buyDay!.counterfactualValue).toBeCloseTo(1300, 0);
  });

  it('counterfactual value tracks SPY price changes', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const later = result.find(p => p.date === '2023-01-06');
    // SPY shares = 1300/380 ≈ 3.4211. SPY on Jan 6 = 388.
    // Counterfactual = 3.4211 * 388 ≈ 1327.37
    expect(later!.counterfactualValue).toBeCloseTo(3.4211 * 388, 0);
  });

  it('uses deposit-based SPY shares when cash flows are provided', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const cashFlows: CashFlow[] = [
      { id: 'cf1', date: '2023-01-02', amount: 2000, type: 'deposit' },
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices, cashFlows);

    const buyDay = result.find(p => p.date === '2023-01-02');
    // Deposit $2000 at SPY=380 => 2000/380 ≈ 5.2632 SPY shares
    // Counterfactual = 5.2632 * 380 ≈ 2000
    expect(buyDay!.counterfactualValue).toBeCloseTo(2000, 0);
  });

  it('accumulates SPY shares from multiple deposits', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 5, price: 135, id: 'a2' }),
    ];
    const cashFlows: CashFlow[] = [
      { id: 'cf1', date: '2023-01-02', amount: 1500, type: 'deposit' },
      { id: 'cf2', date: '2023-01-04', amount: 800, type: 'deposit' },
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices, cashFlows);

    const afterBoth = result.find(p => p.date === '2023-01-06');
    // Deposit 1: 1500/380 ≈ 3.9474 SPY shares
    // Deposit 2: 800/385 ≈ 2.0779 SPY shares (SPY=385 on Jan 4)
    // Total SPY shares ≈ 6.0253. At SPY=388: 6.0253 * 388 ≈ 2337.82
    const expectedSpyShares = 1500 / 380 + 800 / 385;
    expect(afterBoth!.counterfactualValue).toBeCloseTo(expectedSpyShares * 388, 0);
  });

  it('counterfactual return is calculated relative to cost basis', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: aaplPrices }, spyPrices);

    const later = result.find(p => p.date === '2023-01-06');
    // Cost basis = 1300. Counterfactual = 3.4211 * 388 ≈ 1327.37
    // Return = (1327.37 - 1300) / 1300 * 100 ≈ 2.11%
    const expectedReturn = ((3.4211 * 388 - 1300) / 1300) * 100;
    expect(later!.counterfactualReturn).toBeCloseTo(expectedReturn, 0);
  });
});

// ============================================================
// Stock split handling in time series
// ============================================================

describe('stock split handling in portfolio value', () => {
  it('unadjusts split-adjusted prices so raw share count stays correct', () => {
    // Stock XYZ had a 2:1 split on Jan 4.
    // Yahoo returns split-adjusted prices (pre-split halved).
    const xyzPrices: StockPrice[] = [
      { date: '2023-01-02', price: 50 },  // adjusted: actual was 100
      { date: '2023-01-03', price: 51 },  // adjusted: actual was 102
      { date: '2023-01-04', price: 52 },  // post-split: actual 52
      { date: '2023-01-05', price: 53 },
    ];
    const splits: Record<string, StockSplit[]> = {
      XYZ: [{ date: '2023-01-04', ticker: 'XYZ', splitFactor: 2 }],
    };
    const trades = [makeTrade({ ticker: 'XYZ', date: '2023-01-02', shares: 10, price: 100 })];

    const result = calculatePortfolioTimeSeries(
      trades, { XYZ: xyzPrices }, spyPrices.slice(0, 4), [], splits,
    );

    // Pre-split: unadjusted price = 50 * 2 = 100. Value = 10 * 100 = 1000.
    const preSplit = result.find(p => p.date === '2023-01-02');
    expect(preSplit!.portfolioValue).toBe(1000);

    // Post-split: unadjusted price = 53 * 1 = 53. Value = 10 * 53 = 530.
    const postSplit = result.find(p => p.date === '2023-01-05');
    expect(postSplit!.portfolioValue).toBe(530);
  });
});

// ============================================================
// calculateStockBreakdown
// ============================================================

describe('calculateStockBreakdown', () => {
  it('computes current value from latest price', () => {
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 })];
    const result = calculateStockBreakdown(trades, { AAPL: aaplPrices }, spyPrices);

    expect(result).toHaveLength(1);
    expect(result[0].currentPrice).toBe(138); // latest AAPL price
    expect(result[0].currentValue).toBe(1380); // 10 * 138
  });

  it('excludes fully sold positions', () => {
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 10, price: 135, type: 'sell', id: 'a2' }),
    ];
    const result = calculateStockBreakdown(trades, { AAPL: aaplPrices }, spyPrices);
    expect(result).toHaveLength(0);
  });

  it('sorts by difference descending (best performer first)', () => {
    const googPrices: StockPrice[] = [
      { date: '2023-01-02', price: 90 },
      { date: '2023-01-06', price: 200 },
    ];
    const trades = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-02', shares: 10, price: 90, id: 'g1' }),
    ];
    const result = calculateStockBreakdown(
      trades, { AAPL: aaplPrices, GOOG: googPrices }, spyPrices,
    );
    expect(result[0].difference).toBeGreaterThanOrEqual(result[1].difference);
  });
});

// ============================================================
// calculateSummary
// ============================================================

describe('calculateSummary', () => {
  it('returns zeros for empty breakdown', () => {
    const result = calculateSummary([]);
    expect(result.totalPortfolioValue).toBe(0);
    expect(result.totalCounterfactualValue).toBe(0);
    expect(result.bestPerformer).toBeNull();
    expect(result.worstPerformer).toBeNull();
  });

  it('computes total portfolio value from breakdown', () => {
    const breakdown: StockBreakdownData[] = [
      {
        ticker: 'AAPL', shares: 10, buyDate: '2023-01-02', buyPrice: 130,
        currentPrice: 150, currentValue: 1500, spyShares: 3, spyCurrentValue: 1200,
        gain: 200, spyGain: -100, difference: 300,
      },
      {
        ticker: 'GOOG', shares: 5, buyDate: '2023-01-02', buyPrice: 90,
        currentPrice: 100, currentValue: 500, spyShares: 1, spyCurrentValue: 400,
        gain: 50, spyGain: -50, difference: 100,
      },
    ];
    const result = calculateSummary(breakdown);
    expect(result.totalPortfolioValue).toBe(2000);
    expect(result.totalCounterfactualValue).toBe(1600);
  });

  it('identifies best and worst performers', () => {
    const breakdown: StockBreakdownData[] = [
      {
        ticker: 'WINNER', shares: 1, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 200, currentValue: 200, spyShares: 1, spyCurrentValue: 120,
        gain: 100, spyGain: 20, difference: 80,
      },
      {
        ticker: 'LOSER', shares: 1, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 50, currentValue: 50, spyShares: 1, spyCurrentValue: 120,
        gain: -50, spyGain: 20, difference: -70,
      },
    ];
    const result = calculateSummary(breakdown);
    expect(result.bestPerformer!.ticker).toBe('WINNER');
    expect(result.worstPerformer!.ticker).toBe('LOSER');
  });

  it('computes portfolio return percentage from trades', () => {
    const breakdown: StockBreakdownData[] = [{
      ticker: 'AAPL', shares: 10, buyDate: '2023-01-01', buyPrice: 100,
      currentPrice: 120, currentValue: 1200, spyShares: 5, spyCurrentValue: 1100,
      gain: 200, spyGain: 100, difference: 100,
    }];
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-01', shares: 10, price: 100 })];

    const result = calculateSummary(breakdown, [], trades);
    // (1200 - 1000) / 1000 * 100 = 20%
    expect(result.portfolioReturn).toBe(20);
  });

  it('computes counterfactual return percentage from trades', () => {
    const breakdown: StockBreakdownData[] = [{
      ticker: 'AAPL', shares: 10, buyDate: '2023-01-01', buyPrice: 100,
      currentPrice: 120, currentValue: 1200, spyShares: 5, spyCurrentValue: 1100,
      gain: 200, spyGain: 100, difference: 100,
    }];
    const trades = [makeTrade({ ticker: 'AAPL', date: '2023-01-01', shares: 10, price: 100 })];

    const result = calculateSummary(breakdown, [], trades);
    // (1100 - 1000) / 1000 * 100 = 10%
    expect(result.counterfactualReturn).toBe(10);
  });
});
