import { useState, useCallback, useEffect, useRef } from 'react';
import { Tab, Tabs, TabList, TabPanel } from 'react-tabs';
import type { Trade } from '../types/Trade';
import type { PortfolioData } from '../types/PortfolioData';
import type { PortfolioDataPoint } from '../types/PortfolioDataPoint';
import type { StockBreakdownData } from '../types/StockBreakdownData';
import type { SummaryData } from '../types/SummaryData';
import { useStockData } from '../hooks/useStockData';
import { FileUpload } from './FileUpload';
import { ManualEntry } from './ManualEntry';
import { ComparisonChart } from './ComparisonChart';
import { ReturnChart } from './ReturnChart';
import { StockBreakdown } from './StockBreakdown';
import { SummaryStats } from './SummaryStats';
import { CsvBuilder } from './CsvBuilder';

type InputMode = 'upload' | 'manual' | 'csv-builder';

const INPUT_MODES: InputMode[] = ['upload', 'manual', 'csv-builder'];

const emptyPortfolio: PortfolioData = { trades: [], cashFlows: [], format: 'simple' };

interface TabResults {
  timeSeriesData: PortfolioDataPoint[];
  breakdownData: StockBreakdownData[];
  summaryData: SummaryData | null;
}

const emptyResults: TabResults = { timeSeriesData: [], breakdownData: [], summaryData: null };

export function Dashboard() {
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [tabPortfolioData, setTabPortfolioData] = useState<Record<InputMode, PortfolioData>>({
    upload: { ...emptyPortfolio },
    manual: { ...emptyPortfolio },
    'csv-builder': { ...emptyPortfolio },
  });
  const [tabResults, setTabResults] = useState<Record<InputMode, TabResults>>({
    upload: { ...emptyResults },
    manual: { ...emptyResults },
    'csv-builder': { ...emptyResults },
  });

  const { loading, error, timeSeriesData, breakdownData, summaryData, loadData, reset } = useStockData();

  // Track which tab triggered the current load so we store results in the right tab
  const loadingTabRef = useRef<InputMode>(inputMode);

  // Sync useStockData results into the tab that triggered them
  useEffect(() => {
    if (loading) return;
    const tab = loadingTabRef.current;
    if (timeSeriesData.length > 0 && summaryData !== null) {
      setTabResults(prev => ({
        ...prev,
        [tab]: { timeSeriesData, breakdownData, summaryData },
      }));
    }
  }, [loading, timeSeriesData, breakdownData, summaryData]);

  const handleDataLoaded = useCallback((data: PortfolioData) => {
    setTabPortfolioData(prev => ({ ...prev, upload: data }));
    if (data.trades.length === 0) {
      setTabResults(prev => ({ ...prev, upload: { ...emptyResults } }));
      reset();
    }
  }, [reset]);

  const handleTradeAdded = useCallback((trade: Trade) => {
    setTabPortfolioData(prev => ({
      ...prev,
      manual: {
        ...prev.manual,
        trades: [...prev.manual.trades, trade],
      },
    }));
  }, []);

  const handleAnalyze = useCallback(() => {
    const data = tabPortfolioData.manual;
    if (data.trades.length > 0) {
      loadingTabRef.current = 'manual';
      loadData(data);
    }
  }, [tabPortfolioData, loadData]);

  const handleClear = useCallback(() => {
    setTabPortfolioData(prev => ({ ...prev, manual: { ...emptyPortfolio } }));
    setTabResults(prev => ({ ...prev, manual: { ...emptyResults } }));
    reset();
  }, [reset]);

  // Auto-analyze for upload tab
  useEffect(() => {
    const uploadData = tabPortfolioData.upload;
    if (uploadData.trades.length === 0 || inputMode !== 'upload') {
      return;
    }

    const timer = setTimeout(() => {
      loadingTabRef.current = 'upload';
      loadData(uploadData);
    }, 100);

    return () => clearTimeout(timer);
  }, [tabPortfolioData.upload, inputMode, loadData]);

  const activeResults = tabResults[inputMode];
  const hasResults = activeResults.timeSeriesData.length > 0 && activeResults.summaryData !== null;

  const tabIndex = INPUT_MODES.indexOf(inputMode);

  const tabBaseClass = 'px-4 py-2 font-medium transition-all duration-150 cursor-pointer text-slate-500 hover:text-slate-700 outline-none';
  const tabSelectedClass = 'border-b-2 border-blue-500 !text-blue-600';

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
          <Tabs
            selectedIndex={tabIndex}
            onSelect={(index: number) => setInputMode(INPUT_MODES[index])}
            forceRenderTabPanel={true}
          >
            <TabList className="flex border-b mb-6 list-none p-0 m-0">
              <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>Upload CSV</Tab>
              <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>Manual Entry</Tab>
              <Tab className={tabBaseClass} selectedClassName={tabSelectedClass}>CSV Builder</Tab>
            </TabList>

            <TabPanel className="hidden" selectedClassName="!block">
              <FileUpload onDataLoaded={handleDataLoaded} />
            </TabPanel>

            <TabPanel className="hidden" selectedClassName="!block">
              <ManualEntry onTradeAdded={handleTradeAdded} existingTrades={tabPortfolioData.manual.trades} />
              {tabPortfolioData.manual.trades.length > 0 && (
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
            </TabPanel>

            <TabPanel className="hidden" selectedClassName="!block">
              <CsvBuilder />
            </TabPanel>
          </Tabs>

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
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Portfolio Analysis</h2>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">Summary</h3>
              <SummaryStats data={activeResults.summaryData!} />
            </section>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Portfolio Value Over Time
              </h3>
              <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-4">
                <ComparisonChart data={activeResults.timeSeriesData} />
              </div>
            </section>

            <section className="mb-10">
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Dollar-Weighted Return Over Time
              </h3>
              <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100 p-4">
                <ReturnChart data={activeResults.timeSeriesData} />
              </div>
            </section>

            <section>
              <h3 className="text-lg font-semibold text-slate-800 mb-5">
                Per-Stock Breakdown
              </h3>
              <StockBreakdown data={activeResults.breakdownData} />
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
