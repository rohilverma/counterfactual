import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { StockPrice } from '../types';

// Mock the logger to avoid fetch calls
vi.mock('../utils/logger', () => ({
  perf: { start: vi.fn(), end: vi.fn() },
}));

// ============================================================
// Pure price-lookup utilities (no network)
// ============================================================

// These are imported directly since they don't depend on fetch.
import { getLatestPrice, getPriceOnDate, getHighPriceOnDate } from '../utils/stockApi';

// Realistic AAPL prices for the first week of Jan 2024.
// Values approximate real closing prices.
const aaplJan2024: StockPrice[] = [
  { date: '2024-01-02', price: 185.64, high: 187.05 },
  { date: '2024-01-03', price: 184.25, high: 185.88 },
  { date: '2024-01-04', price: 181.91, high: 183.09 },
  { date: '2024-01-05', price: 181.18, high: 182.00 },
];

describe('getLatestPrice', () => {
  it('returns 0 for empty prices', () => {
    expect(getLatestPrice([])).toBe(0);
  });

  it('returns the last closing price', () => {
    expect(getLatestPrice(aaplJan2024)).toBe(181.18);
  });
});

describe('getPriceOnDate', () => {
  it('returns null for empty prices', () => {
    expect(getPriceOnDate([], '2024-01-02')).toBeNull();
  });

  it('returns the exact closing price on a trading day', () => {
    expect(getPriceOnDate(aaplJan2024, '2024-01-03')).toBe(184.25);
  });

  it('returns the most recent price for a weekend date', () => {
    // Jan 6, 2024 was a Saturday — should return Friday Jan 5 price
    expect(getPriceOnDate(aaplJan2024, '2024-01-06')).toBe(181.18);
  });

  it('returns the first price when date is before all data', () => {
    expect(getPriceOnDate(aaplJan2024, '2023-12-29')).toBe(185.64);
  });
});

describe('getHighPriceOnDate', () => {
  it('returns null for empty prices', () => {
    expect(getHighPriceOnDate([], '2024-01-02')).toBeNull();
  });

  it('returns the day high when available', () => {
    expect(getHighPriceOnDate(aaplJan2024, '2024-01-02')).toBe(187.05);
  });

  it('falls back to close when high is undefined', () => {
    const noHigh: StockPrice[] = [{ date: '2024-01-02', price: 185.64 }];
    expect(getHighPriceOnDate(noHigh, '2024-01-02')).toBe(185.64);
  });
});

// ============================================================
// fetchStockData / fetchMultipleStocks (mocked fetch)
// ============================================================

// We need a fresh module import per test to clear the internal price cache.
// Use vi.resetModules() + dynamic import.

describe('fetchStockData', () => {
  const mockApiResponse = {
    prices: [
      { date: '2024-01-02', price: 185.64, high: 187.05 },
      { date: '2024-01-03', price: 184.25, high: 185.88 },
    ],
    splits: [],
  };

  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns prices and splits from the API response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const { fetchStockData } = await import('../utils/stockApi');
    const result = await fetchStockData('AAPL', '2024-01-02', '2024-01-06');

    expect(result.prices).toHaveLength(2);
    expect(result.prices[0].date).toBe('2024-01-02');
    expect(result.splits).toHaveLength(0);
  });

  it('throws on API error response', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Ticker not found' }),
    } as Response);

    const { fetchStockData } = await import('../utils/stockApi');
    await expect(fetchStockData('INVALID', '2024-01-02', '2024-01-06'))
      .rejects.toThrow('Ticker not found');
  });

  it('constructs the correct API URL with start and end params', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);

    const { fetchStockData } = await import('../utils/stockApi');
    await fetchStockData('SPY', '2023-06-01', '2024-01-01');

    expect(fetchMock).toHaveBeenCalledWith('/api/stock/SPY?start=2023-06-01&end=2024-01-01');
  });
});

describe('fetchMultipleStocks', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches all tickers in parallel', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ prices: [{ date: '2024-01-02', price: 100 }], splits: [] }),
    } as Response);

    const { fetchMultipleStocks } = await import('../utils/stockApi');
    const result = await fetchMultipleStocks(['AAPL', 'GOOG', 'SPY'], '2024-01-02', '2024-01-06');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.prices['AAPL']).toHaveLength(1);
    expect(result.prices['GOOG']).toHaveLength(1);
    expect(result.prices['SPY']).toHaveLength(1);
  });

  it('returns empty arrays for failed tickers without throwing', async () => {
    const fetchMock = vi.mocked(fetch);

    // AAPL succeeds, INVALID fails
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ prices: [{ date: '2024-01-02', price: 185 }], splits: [] }),
      } as Response)
      .mockRejectedValueOnce(new Error('Network error'));

    const { fetchMultipleStocks } = await import('../utils/stockApi');
    const result = await fetchMultipleStocks(['AAPL', 'INVALID'], '2024-01-02', '2024-01-06');

    expect(result.prices['AAPL']).toHaveLength(1);
    expect(result.prices['INVALID']).toEqual([]);
    expect(result.splits['INVALID']).toEqual([]);
  });
});

// ============================================================
// Stock split data in API responses
// ============================================================

describe('stock splits in API responses', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through split events from the API', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        prices: [
          { date: '2020-08-28', price: 124.81 },
          { date: '2020-08-31', price: 129.04 },
        ],
        splits: [
          { date: '2020-08-31', ticker: 'AAPL', splitFactor: 4 },
        ],
      }),
    } as Response);

    const { fetchStockData } = await import('../utils/stockApi');
    const result = await fetchStockData('AAPL', '2020-08-01', '2020-09-01');

    expect(result.splits).toHaveLength(1);
    expect(result.splits[0].date).toBe('2020-08-31');
    expect(result.splits[0].splitFactor).toBe(4);
  });
});

// ============================================================
// getDateRange (date range calculation for API calls)
// ============================================================

import { getDateRange } from '../utils/calculations';
import type { Trade } from '../types';

function makeTrade(ticker: string, date: string): Trade {
  return { id: `${ticker}-${date}`, ticker, date, shares: 10, price: 100, type: 'buy' };
}

describe('getDateRange', () => {
  it('uses the earliest trade date as startDate', () => {
    const trades = [
      makeTrade('AAPL', '2023-06-15'),
      makeTrade('GOOG', '2022-01-10'),
      makeTrade('MSFT', '2024-03-01'),
    ];
    const { startDate } = getDateRange(trades);
    expect(startDate).toBe('2022-01-10');
  });

  it('returns endDate as today or tomorrow (after market close)', () => {
    const { endDate } = getDateRange([makeTrade('AAPL', '2023-01-01')]);
    // endDate should be a valid YYYY-MM-DD string and not in the past
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const endMs = new Date(endDate).getTime();
    const nowMs = Date.now();
    // endDate should be within the last 2 days from now (accounting for timezone)
    expect(endMs).toBeGreaterThan(nowMs - 2 * 86400000);
  });

  it('defaults to one year range when no trades provided', () => {
    const { startDate, endDate } = getDateRange([]);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = (end.getTime() - start.getTime()) / 86400000;
    // Should be approximately 365 days
    expect(diffDays).toBeGreaterThan(360);
    expect(diffDays).toBeLessThan(370);
  });
});
