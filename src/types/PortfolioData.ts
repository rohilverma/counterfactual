import type { Trade } from './Trade';
import type { CashFlow } from './CashFlow';

export type CsvFormat = 'robinhood' | 'fidelity' | 'schwab' | 'simple';

export interface PortfolioData {
  trades: Trade[];
  cashFlows: CashFlow[];
  format: CsvFormat;
}
