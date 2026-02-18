export type TradeType = 'buy' | 'sell';

export interface Trade {
  id: string;
  ticker: string;
  date: string;
  shares: number;
  price?: number;
  type: TradeType;
}
