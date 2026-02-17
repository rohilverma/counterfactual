import { describe, it, expect } from 'vitest';
import { getLatestPrice, getPriceOnDate, getHighPriceOnDate } from '../utils/stockApi';
import type { StockPrice } from '../types';

function makePrice(date: string, price: number, high?: number): StockPrice {
  return high !== undefined ? { date, price, high } : { date, price };
}

describe('getLatestPrice', () => {
  it('returns 0 for empty array', () => {
    expect(getLatestPrice([])).toBe(0);
  });

  it('returns the last price in the array', () => {
    const prices = [
      makePrice('2023-01-02', 100),
      makePrice('2023-01-03', 105),
      makePrice('2023-01-04', 110),
    ];
    expect(getLatestPrice(prices)).toBe(110);
  });

  it('works with single element', () => {
    expect(getLatestPrice([makePrice('2023-01-02', 42)])).toBe(42);
  });
});

describe('getPriceOnDate', () => {
  const prices = [
    makePrice('2023-01-02', 100),
    makePrice('2023-01-03', 105),
    makePrice('2023-01-04', 110),
    makePrice('2023-01-05', 108),
  ];

  it('returns null for empty array', () => {
    expect(getPriceOnDate([], '2023-01-02')).toBeNull();
  });

  it('returns exact match price', () => {
    expect(getPriceOnDate(prices, '2023-01-03')).toBe(105);
  });

  it('returns price on or before date when exact date missing (weekend/holiday)', () => {
    // Jan 6 is a weekend day, should return Jan 5 price
    expect(getPriceOnDate(prices, '2023-01-06')).toBe(108);
  });

  it('returns first price when date is before all prices', () => {
    expect(getPriceOnDate(prices, '2022-12-30')).toBe(100);
  });

  it('handles date at the boundary', () => {
    expect(getPriceOnDate(prices, '2023-01-02')).toBe(100);
    expect(getPriceOnDate(prices, '2023-01-05')).toBe(108);
  });
});

describe('getHighPriceOnDate', () => {
  it('returns null for empty array', () => {
    expect(getHighPriceOnDate([], '2023-01-02')).toBeNull();
  });

  it('returns high price when available', () => {
    const prices = [
      makePrice('2023-01-02', 100, 105),
      makePrice('2023-01-03', 110, 115),
    ];
    expect(getHighPriceOnDate(prices, '2023-01-03')).toBe(115);
  });

  it('falls back to close price when high is not available', () => {
    const prices = [
      makePrice('2023-01-02', 100),
      makePrice('2023-01-03', 110),
    ];
    expect(getHighPriceOnDate(prices, '2023-01-03')).toBe(110);
  });

  it('returns price on or before target date', () => {
    const prices = [
      makePrice('2023-01-02', 100, 105),
      makePrice('2023-01-04', 110, 115),
    ];
    // Jan 3 is missing, should get Jan 4 or before? Actually the logic searches backwards
    // from end for date <= target. Jan 3 target: Jan 2 matches.
    expect(getHighPriceOnDate(prices, '2023-01-03')).toBe(105);
  });
});
