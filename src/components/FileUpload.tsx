import { useCallback, useState } from 'react';
import type { Trade, CashFlow, PortfolioData } from '../types';
import { parseCSV, generateSampleCSV } from '../utils/csvParser';

interface FileUploadProps {
  onDataLoaded: (data: PortfolioData) => void;
}

interface UploadedFile {
  name: string;
  trades: Trade[];
  cashFlows: CashFlow[];
}

export function FileUpload({ onDataLoaded }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const processFiles = useCallback(async (files: FileList) => {
    setError(null);
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const result = parseCSV(text);
        if (result.trades.length > 0 || result.cashFlows.length > 0) {
          newFiles.push({ name: file.name, trades: result.trades, cashFlows: result.cashFlows });
        }
      } catch (err) {
        setError(`Error parsing ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => {
        const updated = [...prev, ...newFiles];
        const allTrades = updated.flatMap(f => f.trades);
        const allCashFlows = updated.flatMap(f => f.cashFlows);
        onDataLoaded({ trades: allTrades, cashFlows: allCashFlows });
        return updated;
      });
    }
  }, [onDataLoaded]);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => {
      const updated = prev.filter((_, i) => i !== index);
      const allTrades = updated.flatMap(f => f.trades);
      const allCashFlows = updated.flatMap(f => f.cashFlows);
      onDataLoaded({ trades: allTrades, cashFlows: allCashFlows });
      return updated;
    });
  }, [onDataLoaded]);

  const clearAll = useCallback(() => {
    setUploadedFiles([]);
    onDataLoaded({ trades: [], cashFlows: [] });
  }, [onDataLoaded]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  }, [processFiles]);

  const loadSampleData = useCallback(() => {
    setError(null);
    try {
      const sampleCSV = generateSampleCSV();
      const result = parseCSV(sampleCSV);
      setUploadedFiles([{ name: 'Sample Data', trades: result.trades, cashFlows: result.cashFlows }]);
      onDataLoaded(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sample data');
    }
  }, [onDataLoaded]);

  const totalTrades = uploadedFiles.reduce((sum, f) => sum + f.trades.length, 0);

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".csv"
          multiple
          onChange={handleChange}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="cursor-pointer"
        >
          <div className="space-y-2">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="text-gray-600">
              <span className="text-blue-600 hover:text-blue-700 font-medium">
                Upload CSV files
              </span>
              {' '}or drag and drop
            </div>
            <p className="text-xs text-gray-500">
              Supports multiple files. Schwab format or simple (ticker, date, shares, price)
            </p>
          </div>
        </label>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">
              {uploadedFiles.length} file{uploadedFiles.length > 1 ? 's' : ''} ({totalTrades} trades)
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex justify-between items-center text-sm bg-white px-2 py-1 rounded"
              >
                <span className="truncate">{file.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">{file.trades.length} trades</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      <button
        onClick={loadSampleData}
        className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
      >
        Load Sample Data
      </button>
    </div>
  );
}
