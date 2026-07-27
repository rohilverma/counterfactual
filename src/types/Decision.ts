export type DecisionKind = 'deposit' | 'withdrawal' | 'buy' | 'sell';

export interface Decision {
  kind: DecisionKind;
  date: string;
  ticker?: string;
  shares?: number;
  price?: number;
  amount?: number;
}

export interface DecisionsResult {
  deposits: Decision[];
  withdrawals: Decision[];
  buys: Decision[];
  sells: Decision[];
}
