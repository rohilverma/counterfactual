import type { StockBreakdownData } from '../types/StockBreakdownData';

interface StockBreakdownProps {
  data: StockBreakdownData[];
}

export function StockBreakdown({ data }: StockBreakdownProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        No stock data to display
      </div>
    );
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

  return (
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
      {data.map((stock) => {
        const originalInvestment = stock.shares * stock.buyPrice;
        const outperformed = stock.difference > 0;

        return (
          <div
            key={`${stock.ticker}-${stock.buyDate}`}
            className="bg-white rounded-xl p-5 shadow-sm ring-1 ring-slate-100"
          >
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{stock.ticker}</h3>
                <p className="text-sm text-slate-500">
                  {stock.shares.toLocaleString()} shares @ {formatCurrency(stock.buyPrice)} avg
                </p>
                <p className="text-xs text-slate-400">First bought {stock.buyDate}</p>
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
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Your investment:</span>
                <span className="font-medium">
                  {formatCurrency(stock.currentValue)}
                  <span className={`ml-1 ${stock.gain >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ({formatPercent(stock.currentValue, originalInvestment)})
                  </span>
                </span>
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
      })}
    </div>
  );
}
