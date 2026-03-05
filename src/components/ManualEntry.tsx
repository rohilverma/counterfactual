import { useState, useCallback } from 'react';
import type { Trade, TradeType } from '../types/Trade';

interface ManualEntryProps {
  onTradeAdded: (trade: Trade) => void;
  existingTrades: Trade[];
}

export function ManualEntry({ onTradeAdded, existingTrades }: ManualEntryProps) {
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [shares, setShares] = useState('');
  const [price, setPrice] = useState('');
  const [tradeType, setTradeType] = useState<TradeType>('buy');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const tickerValue = ticker.trim().toUpperCase();
    const sharesValue = parseFloat(shares);
    const priceValue = price.trim() ? parseFloat(price) : undefined;

    if (!tickerValue) {
      setError('Ticker symbol is required');
      return;
    }
    if (!date) {
      setError('Date is required');
      return;
    }
    if (isNaN(sharesValue) || sharesValue <= 0) {
      setError('Shares must be a positive number');
      return;
    }
    if (priceValue !== undefined && (isNaN(priceValue) || priceValue <= 0)) {
      setError('Price must be a positive number (or leave blank for day high)');
      return;
    }

    const trade: Trade = {
      id: `${tickerValue}-${date}-${Date.now()}`,
      ticker: tickerValue,
      date,
      shares: sharesValue,
      type: tradeType,
      ...(priceValue !== undefined ? { price: priceValue } : {}),
    };

    onTradeAdded(trade);

    // Reset form
    setTicker('');
    setDate('');
    setShares('');
    setPrice('');
    setTradeType('buy');
  }, [ticker, date, shares, price, tradeType, onTradeAdded]);

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setTradeType('buy')}
            className={`flex-1 py-2.5 px-5 rounded-xl font-medium transition-all duration-150 active:scale-[0.98] ${
              tradeType === 'buy'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setTradeType('sell')}
            className={`flex-1 py-2.5 px-5 rounded-xl font-medium transition-all duration-150 active:scale-[0.98] ${
              tradeType === 'sell'
                ? 'bg-red-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Sell
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Ticker
            </label>
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              placeholder="AAPL"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Shares
            </label>
            <input
              type="number"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="10"
              step="any"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Price <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Day high if blank"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="w-full py-2.5 px-5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-xl font-medium shadow-sm hover:shadow transition-all duration-150"
        >
          Add Trade
        </button>
      </form>

      {existingTrades.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-slate-700 mb-2">
            Trades ({existingTrades.length})
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {existingTrades.map((trade) => (
              <div
                key={trade.id}
                className="text-sm bg-slate-50 px-3 py-2 rounded flex justify-between"
              >
                <span className="font-medium">
                  <span className={trade.type === 'sell' ? 'text-red-600' : 'text-green-600'}>
                    {trade.type === 'sell' ? 'SELL' : 'BUY'}
                  </span>
                  {' '}{trade.ticker}
                </span>
                <span className="text-slate-500">
                  {trade.shares} shares @ {trade.price ? `$${trade.price.toFixed(2)}` : 'day high'} on {trade.date}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
