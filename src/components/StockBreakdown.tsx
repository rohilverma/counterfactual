import { memo, useState } from 'react';
import type { StockBreakdownData } from '../types/StockBreakdownData';

interface StockBreakdownProps {
  data: StockBreakdownData[];
  excludedTickers?: Set<string>;
  onToggleExclude?: (ticker: string) => void;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (current: number, original: number) => {
  if (original === 0) return '0%';
  const percent = ((current - original) / original) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
};

function StockCard({
  stock,
  excluded,
  onToggleExclude,
}: {
  stock: StockBreakdownData;
  excluded: boolean;
  onToggleExclude?: (ticker: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const originalInvestment = stock.costBasis;
  const outperformed = stock.difference > 0;

  return (
    <div
      className={`bg-white rounded-xl p-5 shadow-sm ring-1 transition-opacity ${
        excluded ? 'ring-slate-200 opacity-55' : 'ring-slate-100'
      }`}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-start gap-2.5">
          {onToggleExclude && (
            <input
              type="checkbox"
              checked={!excluded}
              onChange={() => onToggleExclude(stock.ticker)}
              aria-label={`Include ${stock.ticker} in totals`}
              title={excluded ? 'Excluded from totals — click to include' : 'Included in totals — click to exclude'}
              className="mt-1.5 h-4 w-4 shrink-0 cursor-pointer accent-blue-600"
            />
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-900">{stock.ticker}</h3>
            <p className="text-sm text-slate-500">
              {stock.shares.toLocaleString()} shares @ {formatCurrency(stock.buyPrice)} avg
            </p>
            <p className="text-xs text-slate-400">First bought {stock.buyDate}</p>
          </div>
        </div>
        <div
          className={`px-2 py-1 rounded text-sm font-medium ${
            outperformed
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {outperformed ? 'Beat SPY' : 'Underperformed'}
        </div>
      </div>

      <div className="space-y-2">
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="w-full flex justify-between items-center text-sm text-left hover:text-slate-900"
          >
            <span className="flex items-center gap-1 text-slate-600">
              <svg
                className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                  clipRule="evenodd"
                />
              </svg>
              Your investment:
            </span>
            <span className="font-medium">
              {formatCurrency(stock.currentValue)}
              <span className={`ml-1 ${stock.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ({formatPercent(stock.currentValue, originalInvestment)})
              </span>
            </span>
          </button>

          {expanded && (
            <div className="mt-2 ml-4 rounded-lg bg-slate-50 ring-1 ring-slate-100 px-3 py-2 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cost basis</span>
                <span className="font-medium text-slate-700">{formatCurrency(stock.costBasis)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Your gain</span>
                <span className={`font-medium ${stock.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {stock.gain >= 0 ? '+' : ''}{formatCurrency(stock.gain)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-slate-600">If SPY instead:</span>
          <span className="font-medium">
            {formatCurrency(stock.spyCurrentValue)}
            <span className={`ml-1 ${stock.spyGain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ({formatPercent(stock.spyCurrentValue, originalInvestment)})
            </span>
          </span>
        </div>

        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Difference:</span>
            <span
              className={`font-bold ${
                stock.difference >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {stock.difference >= 0 ? '+' : ''}{formatCurrency(stock.difference)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export const StockBreakdown = memo(function StockBreakdown({ data, excludedTickers, onToggleExclude }: StockBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No stock data to display
      </div>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {data.map((stock) => (
        <StockCard
          key={`${stock.ticker}-${stock.buyDate}`}
          stock={stock}
          excluded={excludedTickers?.has(stock.ticker) ?? false}
          onToggleExclude={onToggleExclude}
        />
      ))}
    </div>
  );
});
