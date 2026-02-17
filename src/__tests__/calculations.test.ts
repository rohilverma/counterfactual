import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculatePortfolioTimeSeries,
  calculateStockBreakdown,
  calculateSummary,
  getDateRange,
} from '../utils/calculations';
import type { Trade, StockPrice, StockBreakdownData, CashFlow, StockSplit } from '../types';

// Mock the logger to avoid fetch calls in tests
vi.mock('../utils/logger', () => ({
  perf: {
    start: vi.fn(),
    end: vi.fn(),
    measure: vi.fn(),
    measureSync: vi.fn(),
  },
}));

// Mock stockApi helpers used by calculations
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

// --- Test data factories ---

function makePrice(date: string, price: number): StockPrice {
  return { date, price };
}

function makeTrade(overrides: Partial<Trade> & { ticker: string; date: string; shares: number }): Trade {
  return {
    id: `${overrides.ticker}-${overrides.date}`,
    type: 'buy',
    ...overrides,
  };
}

// --- Tests ---

describe('getDateRange', () => {
  it('returns start date from earliest trade', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-03-01', shares: 10, price: 150 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-15', shares: 5, price: 100 }),
      makeTrade({ ticker: 'MSFT', date: '2023-06-20', shares: 8, price: 300 }),
    ];

    const { startDate } = getDateRange(trades);
    expect(startDate).toBe('2023-01-15');
  });

  it('returns a default range when no trades', () => {
    const { startDate, endDate } = getDateRange([]);
    expect(startDate).toBeDefined();
    expect(endDate).toBeDefined();
    expect(startDate < endDate).toBe(true);
  });

  it('handles single trade', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2024-06-01', shares: 10, price: 200 }),
    ];
    const { startDate } = getDateRange(trades);
    expect(startDate).toBe('2024-06-01');
  });
});

describe('calculatePortfolioTimeSeries', () => {
  const spyPrices: StockPrice[] = [
    makePrice('2023-01-02', 380),
    makePrice('2023-01-03', 382),
    makePrice('2023-01-04', 385),
    makePrice('2023-01-05', 383),
    makePrice('2023-01-06', 388),
  ];

  it('returns empty array when no trades', () => {
    const result = calculatePortfolioTimeSeries([], {}, spyPrices);
    expect(result).toEqual([]);
  });

  it('returns empty array when no SPY prices', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
    ];
    const result = calculatePortfolioTimeSeries(trades, { AAPL: [makePrice('2023-01-02', 130)] }, []);
    expect(result).toEqual([]);
  });

  it('computes time series for a single buy', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
    ];
    const stockPrices = {
      AAPL: [
        makePrice('2023-01-02', 130),
        makePrice('2023-01-03', 132),
        makePrice('2023-01-04', 135),
        makePrice('2023-01-05', 133),
        makePrice('2023-01-06', 138),
      ],
    };

    const result = calculatePortfolioTimeSeries(trades, stockPrices, spyPrices);

    expect(result.length).toBeGreaterThan(0);

    // Each data point should have expected shape
    for (const point of result) {
      expect(point).toHaveProperty('date');
      expect(point).toHaveProperty('portfolioValue');
      expect(point).toHaveProperty('counterfactualValue');
      expect(point).toHaveProperty('costBasis');
      expect(point).toHaveProperty('portfolioReturn');
      expect(point).toHaveProperty('counterfactualReturn');
    }

    // On the buy date, portfolio value should be shares * price
    const buyDayPoint = result.find(p => p.date === '2023-01-02');
    expect(buyDayPoint).toBeDefined();
    expect(buyDayPoint!.portfolioValue).toBe(1300); // 10 * 130
    expect(buyDayPoint!.costBasis).toBe(1300);

    // On a later date, portfolio value should reflect the new price
    const laterPoint = result.find(p => p.date === '2023-01-06');
    expect(laterPoint).toBeDefined();
    expect(laterPoint!.portfolioValue).toBe(1380); // 10 * 138
  });

  it('handles buy and sell trades', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-04', shares: 5, price: 135, type: 'sell' }),
    ];
    const stockPrices = {
      AAPL: [
        makePrice('2023-01-02', 130),
        makePrice('2023-01-03', 132),
        makePrice('2023-01-04', 135),
        makePrice('2023-01-05', 133),
        makePrice('2023-01-06', 138),
      ],
    };

    const result = calculatePortfolioTimeSeries(trades, stockPrices, spyPrices);

    // After selling 5 shares on Jan 4, only 5 remain
    const afterSell = result.find(p => p.date === '2023-01-06');
    expect(afterSell).toBeDefined();
    expect(afterSell!.portfolioValue).toBe(690); // 5 * 138
  });

  it('handles multiple tickers', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-02', shares: 5, price: 90 }),
    ];
    const stockPrices = {
      AAPL: [
        makePrice('2023-01-02', 130),
        makePrice('2023-01-03', 132),
      ],
      GOOG: [
        makePrice('2023-01-02', 90),
        makePrice('2023-01-03', 92),
      ],
    };
    const shortSpyPrices = spyPrices.slice(0, 2);

    const result = calculatePortfolioTimeSeries(trades, stockPrices, shortSpyPrices);
    const day1 = result.find(p => p.date === '2023-01-02');
    expect(day1).toBeDefined();
    // 10*130 + 5*90 = 1750
    expect(day1!.portfolioValue).toBe(1750);
  });

  it('uses cash flows for cost basis when provided', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
    ];
    const stockPrices = {
      AAPL: [makePrice('2023-01-02', 130), makePrice('2023-01-03', 132)],
    };
    const cashFlows: CashFlow[] = [
      { id: 'cf1', date: '2023-01-02', amount: 2000, type: 'deposit' },
    ];
    const shortSpyPrices = spyPrices.slice(0, 2);

    const result = calculatePortfolioTimeSeries(trades, stockPrices, shortSpyPrices, cashFlows);
    const day1 = result.find(p => p.date === '2023-01-02');
    expect(day1).toBeDefined();
    // Cost basis should come from cash flows: 2000
    expect(day1!.costBasis).toBe(2000);
  });

  it('handles stock splits by unadjusting prices', () => {
    // Simulate: stock had a 2:1 split on 2023-01-04
    // Yahoo would return split-adjusted prices (halved for pre-split dates)
    const trades: Trade[] = [
      makeTrade({ ticker: 'XYZ', date: '2023-01-02', shares: 10, price: 100 }),
    ];
    const stockPrices = {
      // Yahoo's split-adjusted prices (pre-split prices halved)
      XYZ: [
        makePrice('2023-01-02', 50),  // adjusted: was 100 pre-split
        makePrice('2023-01-03', 51),  // adjusted: was 102 pre-split
        makePrice('2023-01-04', 52),  // post-split: actual price
        makePrice('2023-01-05', 53),
      ],
    };
    const splits: Record<string, StockSplit[]> = {
      XYZ: [{ date: '2023-01-04', ticker: 'XYZ', splitFactor: 2 }],
    };
    const shortSpyPrices = spyPrices.slice(0, 4);

    const result = calculatePortfolioTimeSeries(trades, stockPrices, shortSpyPrices, [], splits);

    // On 2023-01-02, unadjusted price = 50 * 2 (split factor for splits after this date) = 100
    // Portfolio value = 10 * 100 = 1000
    const day1 = result.find(p => p.date === '2023-01-02');
    expect(day1).toBeDefined();
    expect(day1!.portfolioValue).toBe(1000);

    // On 2023-01-05, no future splits, unadjusted price = 53 * 1 = 53
    // Portfolio value = 10 * 53 = 530
    const day4 = result.find(p => p.date === '2023-01-05');
    expect(day4).toBeDefined();
    expect(day4!.portfolioValue).toBe(530);
  });
});

describe('calculateStockBreakdown', () => {
  const spyPrices: StockPrice[] = [
    makePrice('2023-01-02', 380),
    makePrice('2023-01-10', 390),
    makePrice('2023-06-01', 420),
  ];

  it('returns empty array for no trades', () => {
    const result = calculateStockBreakdown([], {}, spyPrices);
    expect(result).toEqual([]);
  });

  it('calculates breakdown for a single stock', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
    ];
    const stockPrices = {
      AAPL: [
        makePrice('2023-01-02', 130),
        makePrice('2023-06-01', 150),
      ],
    };

    const result = calculateStockBreakdown(trades, stockPrices, spyPrices);

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('AAPL');
    expect(result[0].shares).toBe(10);
    expect(result[0].currentPrice).toBe(150);
    expect(result[0].currentValue).toBe(1500); // 10 * 150
    expect(result[0].buyDate).toBe('2023-01-02');
  });

  it('excludes sold-out positions', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-10', shares: 10, price: 140, type: 'sell' }),
    ];
    const stockPrices = {
      AAPL: [makePrice('2023-01-02', 130), makePrice('2023-06-01', 150)],
    };

    const result = calculateStockBreakdown(trades, stockPrices, spyPrices);
    expect(result).toHaveLength(0);
  });

  it('aggregates multiple buys of same stock', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130, id: 'a1' }),
      makeTrade({ ticker: 'AAPL', date: '2023-01-10', shares: 5, price: 140, id: 'a2' }),
    ];
    const stockPrices = {
      AAPL: [
        makePrice('2023-01-02', 130),
        makePrice('2023-01-10', 140),
        makePrice('2023-06-01', 150),
      ],
    };

    const result = calculateStockBreakdown(trades, stockPrices, spyPrices);
    expect(result).toHaveLength(1);
    expect(result[0].shares).toBe(15);
    expect(result[0].buyDate).toBe('2023-01-02'); // earliest date
  });

  it('sorts by difference (best performer first)', () => {
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-02', shares: 10, price: 90, id: 'g1' }),
    ];
    const stockPrices = {
      AAPL: [makePrice('2023-01-02', 130), makePrice('2023-06-01', 150)],
      GOOG: [makePrice('2023-01-02', 90), makePrice('2023-06-01', 200)],
    };

    const result = calculateStockBreakdown(trades, stockPrices, spyPrices);
    expect(result).toHaveLength(2);
    // GOOG gained more relative to SPY, should be first
    expect(result[0].difference).toBeGreaterThanOrEqual(result[1].difference);
  });
});

describe('calculateSummary', () => {
  it('returns zeros for empty breakdown', () => {
    const result = calculateSummary([]);
    expect(result.totalCostBasis).toBe(0);
    expect(result.totalPortfolioValue).toBe(0);
    expect(result.totalCounterfactualValue).toBe(0);
    expect(result.bestPerformer).toBeNull();
    expect(result.worstPerformer).toBeNull();
  });

  it('computes totals from breakdown data', () => {
    const breakdown: StockBreakdownData[] = [
      {
        ticker: 'AAPL',
        shares: 10,
        buyDate: '2023-01-02',
        buyPrice: 130,
        currentPrice: 150,
        currentValue: 1500,
        spyShares: 3.42,
        spyCurrentValue: 1400,
        gain: 200,
        spyGain: 100,
        difference: 100,
      },
      {
        ticker: 'GOOG',
        shares: 5,
        buyDate: '2023-01-02',
        buyPrice: 90,
        currentPrice: 80,
        currentValue: 400,
        spyShares: 1.18,
        spyCurrentValue: 500,
        gain: -50,
        spyGain: 50,
        difference: -100,
      },
    ];

    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-02', shares: 10, price: 130 }),
      makeTrade({ ticker: 'GOOG', date: '2023-01-02', shares: 5, price: 90, id: 'g1' }),
    ];

    const result = calculateSummary(breakdown, [], trades);

    expect(result.totalPortfolioValue).toBe(1900); // 1500 + 400
    expect(result.totalCounterfactualValue).toBe(1900); // 1400 + 500
    expect(result.totalCostBasis).toBe(1750); // 10*130 + 5*90
    expect(result.bestPerformer?.ticker).toBe('AAPL');
    expect(result.worstPerformer?.ticker).toBe('GOOG');
  });

  it('identifies best and worst performers', () => {
    const breakdown: StockBreakdownData[] = [
      {
        ticker: 'A', shares: 1, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 200, currentValue: 200, spyShares: 1, spyCurrentValue: 150,
        gain: 100, spyGain: 50, difference: 50,
      },
      {
        ticker: 'B', shares: 1, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 300, currentValue: 300, spyShares: 1, spyCurrentValue: 150,
        gain: 200, spyGain: 50, difference: 150,
      },
      {
        ticker: 'C', shares: 1, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 50, currentValue: 50, spyShares: 1, spyCurrentValue: 150,
        gain: -50, spyGain: 50, difference: -100,
      },
    ];

    const result = calculateSummary(breakdown);
    expect(result.bestPerformer?.ticker).toBe('B');
    expect(result.bestPerformer?.difference).toBe(150);
    expect(result.worstPerformer?.ticker).toBe('C');
    expect(result.worstPerformer?.difference).toBe(-100);
  });

  it('computes return percentages correctly', () => {
    const breakdown: StockBreakdownData[] = [
      {
        ticker: 'AAPL', shares: 10, buyDate: '2023-01-01', buyPrice: 100,
        currentPrice: 120, currentValue: 1200, spyShares: 5, spyCurrentValue: 1100,
        gain: 200, spyGain: 100, difference: 100,
      },
    ];
    const trades: Trade[] = [
      makeTrade({ ticker: 'AAPL', date: '2023-01-01', shares: 10, price: 100 }),
    ];

    const result = calculateSummary(breakdown, [], trades);

    // Portfolio return: (1200 - 1000) / 1000 * 100 = 20%
    expect(result.portfolioReturn).toBe(20);
    // Counterfactual return: (1100 - 1000) / 1000 * 100 = 10%
    expect(result.counterfactualReturn).toBe(10);
  });
});
