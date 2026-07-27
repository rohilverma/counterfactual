export interface StockBreakdownData {
  ticker: string;
  shares: number;
  buyDate: string;
  buyPrice: number;
  costBasis: number;
  currentPrice: number;
  currentValue: number;
  spyShares: number;
  spyCurrentValue: number;
  gain: number;
  spyGain: number;
  difference: number;
}
