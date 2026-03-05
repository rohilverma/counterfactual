import { useState, useCallback, useEffect } from 'react';
import type { Trade } from '../types/Trade';
import type { PortfolioData } from '../types/PortfolioData';
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
  const [portfolioData, setPortfolioData] = useState<PortfolioData>({ trades: [], cashFlows: [], format: 'simple' });
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
    setPortfolioData({ trades: [], cashFlows: [], format: 'simple' });
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
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-7">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Counterfactual</h1>
          <p className="text-sm text-slate-500 mt-1">
            Compare your stock portfolio against investing in the S&P 500
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-6 mb-10">
          <div className="flex border-b mb-6">
            <button
              onClick={() => setInputMode('upload')}
              className={`px-4 py-2 font-medium transition-all duration-150 ${
                inputMode === 'upload'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Upload CSV
            </button>
            <button
              onClick={() => setInputMode('manual')}
              className={`px-4 py-2 font-medium transition-all duration-150 ${
                inputMode === 'manual'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Manual Entry
            </button>
            <button
              onClick={() => setInputMode('csv-builder')}
              className={`px-4 py-2 font-medium transition-all duration-150 ${
                inputMode === 'csv-builder'
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-slate-500 hover:text-slate-700'
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
                    className="flex-1 py-2.5 px-5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-400 text-white rounded-xl font-medium shadow-sm hover:shadow transition-all duration-150"
                  >
                    {loading ? 'Analyzing...' : 'Analyze Portfolio'}
                  </button>
                  <button
                    onClick={handleClear}
                    className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 rounded-xl transition-all duration-150"
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
            <div className="relative h-12 w-12">
              <div className="absolute inset-0 rounded-full border-4 border-slate-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
            <span className="ml-3 text-slate-600">Fetching stock data...</span>
          </div>
        )}

        {hasResults && !loading && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-slate-900">Portfolio Analysis</h2>
              <button
                onClick={() => {
                  setPortfolioData({ trades: [], cashFlows: [], format: 'simple' });
                  window.location.reload();
                }}
                className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] text-slate-700 rounded-xl transition-all duration-150"
              >
                New Analysis
              </button>
            </div>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">Summary</h3>
              <SummaryStats data={summaryData} />
            </section>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Portfolio Value Over Time
              </h3>
              <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-4">
                <ComparisonChart data={timeSeriesData} />
              </div>
            </section>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Dollar-Weighted Return Over Time
              </h3>
              <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-4">
                <ReturnChart data={timeSeriesData} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Per-Stock Breakdown
              </h3>
              <StockBreakdown data={breakdownData} />
            </section>
          </>
        )}
      </main>

      <footer className="bg-white border-t mt-12">
        <div className="max-w-7xl mx-auto px-6 py-6 text-center text-slate-500 text-sm">
          <p>
            Stock data provided by Yahoo Finance.
          </p>
        </div>
      </footer>
    </div>
  );
}
