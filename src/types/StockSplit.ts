export interface StockSplit {
  date: string;
  ticker: string;
  splitFactor: number; // e.g., 0.1 for 1:10 reverse split, 2 for 2:1 split
}
