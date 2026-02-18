import type { StockPrice } from '../types/StockPrice';
import type { PriceCache } from '../types/PriceCache';
import type { StockSplit } from '../types/StockSplit';
import { perf } from './logger';

const priceCache: PriceCache = {};
const splitsCache: Record<string, StockSplit[]> = {};

interface ApiResponse {
  prices?: StockPrice[];
  splits?: StockSplit[];
  error?: string;
}

export interface StockDataResult {
  prices: StockPrice[];
  splits: StockSplit[];
}

export async function fetchStockData(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<StockDataResult> {
  const cacheKey = `${ticker}-${startDate}-${endDate}`;

  if (priceCache[cacheKey] && splitsCache[cacheKey]) {
    return { prices: priceCache[cacheKey], splits: splitsCache[cacheKey] };
  }

  perf.start(`fetch:${ticker}`);
  const url = `/api/stock/${ticker}?start=${startDate}&end=${endDate}`;
  const response = await fetch(url);
  const data: ApiResponse = await response.json();
  perf.end(`fetch:${ticker}`);

  if (!response.ok || data.error) {
    throw new Error(data.error || `Failed to fetch ${ticker}`);
  }

  const prices = data.prices || [];
  const splits = data.splits || [];
  priceCache[cacheKey] = prices;
  splitsCache[cacheKey] = splits;
  return { prices, splits };
}

export async function fetchStockPrices(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<StockPrice[]> {
  const result = await fetchStockData(ticker, startDate, endDate);
  return result.prices;
}

export interface MultipleStocksResult {
  prices: Record<string, StockPrice[]>;
  splits: Record<string, StockSplit[]>;
}

export async function fetchMultipleStocks(
  tickers: string[],
  startDate: string,
  endDate: string
): Promise<MultipleStocksResult> {
  const prices: Record<string, StockPrice[]> = {};
  const splits: Record<string, StockSplit[]> = {};

  const results = await Promise.allSettled(
    tickers.map((ticker) => fetchStockData(ticker, startDate, endDate))
  );

  for (let i = 0; i < tickers.length; i++) {
    const result = results[i];
    if (result.status === 'fulfilled') {
      prices[tickers[i]] = result.value.prices;
      splits[tickers[i]] = result.value.splits;
    } else {
      console.error(`Failed to fetch ${tickers[i]}:`, result.reason);
      prices[tickers[i]] = [];
      splits[tickers[i]] = [];
    }
  }

  return { prices, splits };
}

export function getLatestPrice(prices: StockPrice[]): number {
  return prices.length > 0 ? prices[prices.length - 1].price : 0;
}

function findPriceOnDate(prices: StockPrice[], date: string): StockPrice | null {
  const targetDate = new Date(date);
  for (let i = prices.length - 1; i >= 0; i--) {
    if (new Date(prices[i].date) <= targetDate) {
      return prices[i];
    }
  }
  return prices.length > 0 ? prices[0] : null;
}

export function getPriceOnDate(prices: StockPrice[], date: string): number | null {
  const entry = findPriceOnDate(prices, date);
  return entry?.price ?? null;
}

export function getHighPriceOnDate(prices: StockPrice[], date: string): number | null {
  const entry = findPriceOnDate(prices, date);
  return entry ? (entry.high ?? entry.price) : null;
}
