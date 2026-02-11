/**
 * Manual split overrides for tickers where Yahoo Finance doesn't provide split data.
 * This is common for delisted securities like TVIX.
 *
 * Format:
 *   TICKER: [
 *     { date: 'YYYY-MM-DD', splitFactor: X },
 *     ...
 *   ]
 *
 * splitFactor:
 *   - For reverse splits (e.g., 1:10), use 0.1
 *   - For forward splits (e.g., 4:1), use 4
 *
 * Example: A 1:10 reverse split means 10 old shares become 1 new share.
 * Yahoo's split-adjusted prices are multiplied by 10 for dates before the split.
 * We need to un-adjust by multiplying by 0.1 (the splitFactor).
 */

import type { StockSplit } from '../types';

export const historicalSplits: Record<string, Omit<StockSplit, 'ticker'>[]> = {
  // TVIX - VelocityShares Daily 2x VIX Short Term ETN (delisted July 2020)
  // Had multiple reverse splits due to value decay from contango
  TVIX: [
    { date: '2012-08-22', splitFactor: 0.04 },  // 1:25 reverse split
    { date: '2016-08-09', splitFactor: 0.1 },   // 1:10 reverse split
    { date: '2017-08-24', splitFactor: 0.1 },   // 1:10 reverse split
    { date: '2018-12-11', splitFactor: 0.1 },   // 1:10 reverse split
    { date: '2019-05-01', splitFactor: 0.1 },   // 1:10 reverse split
    { date: '2020-05-19', splitFactor: 0.1 },   // 1:10 reverse split
  ],

  // Add other delisted or problematic tickers here as needed
  // Example:
  // UVXY: [
  //   { date: '2021-05-24', splitFactor: 0.1 },  // 1:10 reverse split
  // ],
};

/**
 * Get manual splits for a ticker, converted to the StockSplit format
 */
export function getHistoricalSplits(ticker: string): StockSplit[] {
  const splits = historicalSplits[ticker.toUpperCase()];
  if (!splits) return [];

  return splits.map(s => ({
    ...s,
    ticker: ticker.toUpperCase(),
  }));
}

/**
 * Merge API-provided splits with manual historical splits.
 * Manual splits take precedence for the same date.
 */
export function mergeWithHistoricalSplits(
  ticker: string,
  apiSplits: StockSplit[]
): StockSplit[] {
  const manualSplits = getHistoricalSplits(ticker);
  if (manualSplits.length === 0) return apiSplits;

  // Create a map of manual split dates for quick lookup
  const manualDates = new Set(manualSplits.map(s => s.date));

  // Filter out API splits that conflict with manual splits
  const filteredApiSplits = apiSplits.filter(s => !manualDates.has(s.date));

  // Combine and sort by date
  return [...filteredApiSplits, ...manualSplits].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}
