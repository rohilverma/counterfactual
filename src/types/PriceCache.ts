import type { StockPrice } from './StockPrice';

export interface PriceCache {
  [ticker: string]: StockPrice[];
}
