export type TradeType = 'buy' | 'sell';

export interface Trade {
  id: string;
  ticker: string;
  date: string;
  shares: number;
  price?: number;
  type: TradeType;
}

export type CashFlowType = 'deposit' | 'dividend' | 'capgain' | 'interest';

export interface CashFlow {
  id: string;
  date: string;
  amount: number;
  type: CashFlowType;
  ticker?: string; // For dividends, which stock paid it
}

export type CsvFormat = 'robinhood' | 'fidelity' | 'schwab' | 'simple';

export interface PortfolioData {
  trades: Trade[];
  cashFlows: CashFlow[];
  format: CsvFormat;
}

export interface StockPrice {
  date: string;
  price: number;
  high?: number;
}

export interface PortfolioDataPoint {
  date: string;
  portfolioValue: number;
  counterfactualValue: number;
  costBasis: number;
  portfolioReturn: number;
  counterfactualReturn: number;
}

export interface StockBreakdownData {
  ticker: string;
  shares: number;
  buyDate: string;
  buyPrice: number;
  currentPrice: number;
  currentValue: number;
  spyShares: number;
  spyCurrentValue: number;
  gain: number;
  spyGain: number;
  difference: number;
}

export interface SummaryData {
  totalCostBasis: number;
  totalPortfolioValue: number;
  totalCounterfactualValue: number;
  portfolioReturn: number;
  counterfactualReturn: number;
  totalDifference: number;
  percentageDifference: number;
  bestPerformer: { ticker: string; difference: number } | null;
  worstPerformer: { ticker: string; difference: number } | null;
}

export interface PriceCache {
  [ticker: string]: StockPrice[];
}

export interface StockSplit {
  date: string;
  ticker: string;
  splitFactor: number; // e.g., 0.1 for 1:10 reverse split, 2 for 2:1 split
}
