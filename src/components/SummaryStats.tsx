import type { SummaryData } from '../types';

interface SummaryStatsProps {
  data: SummaryData;
}

export function SummaryStats({ data }: SummaryStatsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const isOutperforming = data.totalDifference > 0;

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Total Invested</p>
        <p className="text-2xl font-bold text-gray-800">
          {formatCurrency(data.totalCostBasis)}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Portfolio Value</p>
        <p className="text-2xl font-bold text-blue-600">
          {formatCurrency(data.totalPortfolioValue)}
        </p>
        <p className={`text-sm ${data.portfolioReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {formatPercent(data.portfolioReturn)} return
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Deposits in S&P 500</p>
        <p className="text-2xl font-bold text-green-600">
          {formatCurrency(data.totalCounterfactualValue)}
        </p>
        <p className={`text-sm ${data.counterfactualReturn >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {formatPercent(data.counterfactualReturn)} return
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Difference vs S&P 500</p>
        <p
          className={`text-2xl font-bold ${
            isOutperforming ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {data.totalDifference >= 0 ? '+' : ''}
          {formatCurrency(data.totalDifference)}
        </p>
        <p
          className={`text-sm ${
            isOutperforming ? 'text-green-500' : 'text-red-500'
          }`}
        >
          ({data.percentageDifference >= 0 ? '+' : ''}
          {data.percentageDifference.toFixed(2)}%)
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Best vs S&P</p>
        {data.bestPerformer ? (
          <p className="text-xl font-bold text-green-600">
            {data.bestPerformer.ticker}{' '}
            <span className="text-sm font-normal">
              (+{formatCurrency(data.bestPerformer.difference)})
            </span>
          </p>
        ) : (
          <p className="text-gray-400">-</p>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
        <p className="text-sm text-gray-500 mb-1">Worst vs S&P</p>
        {data.worstPerformer ? (
          <p className="text-xl font-bold text-red-600">
            {data.worstPerformer.ticker}{' '}
            <span className="text-sm font-normal">
              ({formatCurrency(data.worstPerformer.difference)})
            </span>
          </p>
        ) : (
          <p className="text-gray-400">-</p>
        )}
      </div>
    </div>
  );
}
