import type { Trade } from './Trade';
import type { CashFlow } from './CashFlow';
import type { StockPrice } from './StockPrice';
import type { StockSplit } from './StockSplit';

// The priced/resolved inputs kept around after an analysis run so views can
// recompute metrics for a selected sub-range (e.g. per-stock performance and
// decisions within a window) without re-fetching from the price API.
export interface AnalysisSource {
  trades: Trade[];
  cashFlows: CashFlow[];
  stockPrices: Record<string, StockPrice[]>;
  spyPrices: StockPrice[];
  splits: Record<string, StockSplit[]>;
}
