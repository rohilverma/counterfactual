import { useState, useCallback, useEffect } from 'react';
import type { Trade, CashFlow, PortfolioData } from '../types';
import { useStockData } from '../hooks/useStockData';
import { FileUpload } from './FileUpload';
import { ManualEntry } from './ManualEntry';
import { ComparisonChart } from './ComparisonChart';
import { ReturnChart } from './ReturnChart';
import { StockBreakdown } from './StockBreakdown';
import { SummaryStats } from './SummaryStats';
import { CsvBuilder } from './CsvBuilder';

type InputMode = 'upload' | 'manual' | 'csv-builder';

export function Dashboard() {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [portfolioData, setPortfolioData] = useState<PortfolioData>({ trades: [], cashFlows: [] });
  const { loading, error, timeSeriesData, breakdownData, summaryData, loadData } = useStockData();

  const handleDataLoaded = useCallback((data: PortfolioData) => {
    setPortfolioData(data);
  }, []);

  const handleTradeAdded = useCallback((trade: Trade) => {
    setPortfolioData(prev => ({
      ...prev,
      trades: [...prev.trades, trade],
    }));
  }, []);

  const handleAnalyze = useCallback(() => {
    if (portfolioData.trades.length > 0) {
      loadData(portfolioData);
    }
  }, [portfolioData, loadData]);

  const handleClear = useCallback(() => {
    setPortfolioData({ trades: [], cashFlows: [] });
  }, []);

  // Debounce auto-analyze to wait for all files to be processed
  useEffect(() => {
    if (portfolioData.trades.length === 0 || inputMode !== 'upload') {
      return;
    }

    const timer = setTimeout(() => {
      loadData(portfolioData);
    }, 100); // Wait 100ms for additional files

    return () => clearTimeout(timer);
  }, [portfolioData, inputMode, loadData]);

  const hasResults = timeSeriesData.length > 0 && summaryData !== null;

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Counterfactual</h1>
          <p className="text-gray-600 mt-1">
            Compare your stock portfolio against investing in the S&P 500
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex border-b mb-6">
            <button
              onClick={() => setInputMode('upload')}
              className={`px-4 py-2 font-medium transition-colors ${
                inputMode === 'upload'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={`px-4 py-2 font-medium transition-colors ${
                inputMode === 'manual'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setInputMode('csv-builder')}
              className={`px-4 py-2 font-medium transition-colors ${
                inputMode === 'csv-builder'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              CSV Builder
            </button>
          </div>

          {inputMode === 'upload' ? (
            <FileUpload onDataLoaded={handleDataLoaded} />
          ) : inputMode === 'csv-builder' ? (
            <CsvBuilder />
          ) : (
            <>
              <ManualEntry onTradeAdded={handleTradeAdded} existingTrades={portfolioData.trades} />
              {portfolioData.trades.length > 0 && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleAnalyze}
                    disabled={loading}
                    className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors font-medium"
                  >
                    {loading ? 'Analyzing...' : 'Analyze Portfolio'}
                  </button>
                  <button
                    onClick={handleClear}
                    className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-4 text-red-600 bg-red-50 p-3 rounded">
              {error}
            </div>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Fetching stock data...</span>
          </div>
        )}

        {hasResults && !loading && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Portfolio Analysis</h2>
              <button
                onClick={() => {
                  setPortfolioData({ trades: [], cashFlows: [] });
                  window.location.reload();
                }}
                className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
              >
                New Analysis
              </button>
            </div>

            <section className="mb-8">
              <h3 className="text-lg font-medium text-gray-800 mb-4">Summary</h3>
              <SummaryStats data={summaryData} />
            </section>

            <section className="mb-8">
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                Portfolio Value Over Time
              </h3>
              <div className="bg-white rounded-lg shadow p-4">
                <ComparisonChart data={timeSeriesData} />
              </div>
            </section>

            <section className="mb-8">
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                Dollar-Weighted Return Over Time
              </h3>
              <div className="bg-white rounded-lg shadow p-4">
                <ReturnChart data={timeSeriesData} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-medium text-gray-800 mb-4">
                Per-Stock Breakdown
              </h3>
              <StockBreakdown data={breakdownData} />
            </section>
          </>
        )}
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
          <p>
            Stock data provided by Yahoo Finance.
          </p>
        </div>
      </footer>
    </div>
  );
}
