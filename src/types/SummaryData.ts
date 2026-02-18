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
