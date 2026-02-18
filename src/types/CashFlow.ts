export type CashFlowType = 'deposit' | 'dividend' | 'capgain' | 'interest';

export interface CashFlow {
  id: string;
  date: string;
  amount: number;
  type: CashFlowType;
  ticker?: string; // For dividends, which stock paid it
}
