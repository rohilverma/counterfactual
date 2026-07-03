export interface SummaryData {
  totalCostBasis: number;
  totalContributions: number; // Gross deposits/vests paid in (excludes withdrawals)
  netContributions: number; // Deposits/vests net of withdrawals
  totalPortfolioValue: number;
  totalCounterfactualValue: number;
  portfolioReturn: number;
  counterfactualReturn: number;
  totalDifference: number;
  percentageDifference: number;
  bestPerformer: { ticker: string; difference: number } | null;
  worstPerformer: { ticker: string; difference: number } | null;
}
