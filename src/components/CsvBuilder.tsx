import { useCallback, useState, useMemo } from 'react';
import {
  parseCSVText,
  validateFiles,
  mergeCSVs,
  exportCSV,
  type UploadedFile,
} from '../utils/csvMerger';

export function CsvBuilder() {
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [removedDuplicateKeys, setRemovedDuplicateKeys] = useState<Set<string>>(new Set());

  const validation = useMemo(() => validateFiles(uploadedFiles), [uploadedFiles]);

  const processFiles = useCallback(async (files: FileList) => {
    setError(null);
    const newFiles: UploadedFile[] = [];

    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.csv')) {
        setError(`${file.name} is not a CSV file`);
        continue;
      }

      try {
        const text = await file.text();
        const parsed = parseCSVText(text);

        if (parsed.headers.length === 0) {
          setError(`${file.name} appears to be empty`);
          continue;
        }

        newFiles.push({
          name: file.name,
          headers: parsed.headers,
          rows: parsed.rows,
          rowCount: parsed.rows.length,
        });
      } catch (err) {
        setError(`Error parsing ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    if (newFiles.length > 0) {
      setUploadedFiles(prev => [...prev, ...newFiles]);
      // Reset duplicate selections when new files are added
      setRemovedDuplicateKeys(new Set());
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
    setRemovedDuplicateKeys(new Set());
  }, []);

  const clearAll = useCallback(() => {
    setUploadedFiles([]);
    setRemovedDuplicateKeys(new Set());
    setError(null);
  }, []);

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

  const toggleDuplicate = useCallback((key: string) => {
    setRemovedDuplicateKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const removeAllDuplicates = useCallback(() => {
    const allKeys = new Set(validation.duplicates.map(d => d.key));
    setRemovedDuplicateKeys(allKeys);
  }, [validation.duplicates]);

  const keepAllDuplicates = useCallback(() => {
    setRemovedDuplicateKeys(new Set());
  }, []);

  const handleDownload = useCallback(() => {
    if (uploadedFiles.length === 0 || validation.errors.length > 0) return;

    const merged = mergeCSVs(uploadedFiles, removedDuplicateKeys);
    const csvContent = exportCSV(merged.headers, merged.rows);

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'merged.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [uploadedFiles, removedDuplicateKeys, validation.errors]);

  const totalRows = uploadedFiles.reduce((sum, f) => sum + f.rowCount, 0);
  const duplicatesRemoved = removedDuplicateKeys.size;
  const finalRowCount = totalRows - duplicatesRemoved - (validation.duplicates.length - duplicatesRemoved);

  const hasErrors = validation.errors.length > 0;
  const canDownload = uploadedFiles.length > 0 && !hasErrors;

  return (
    <div className="space-y-4">
      {/* Upload Area */}
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
          id="csv-builder-upload"
        />
        <label htmlFor="csv-builder-upload" className="cursor-pointer">
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
                Drop CSV files here
              </span>
              {' '}or click to browse
            </div>
            <p className="text-xs text-gray-500">
              Upload multiple CSV files to merge them together
            </p>
          </div>
        </label>
      </div>

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-medium text-gray-700">
              Uploaded Files
            </span>
            <button
              onClick={clearAll}
              className="text-xs text-red-600 hover:text-red-700"
            >
              Clear all
            </button>
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {uploadedFiles.map((file, index) => (
              <div
                key={index}
                className="flex justify-between items-center text-sm bg-white px-3 py-2 rounded"
              >
                <span className="truncate font-mono">{file.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{file.rowCount} rows</span>
                  <button
                    onClick={() => removeFile(index)}
                    className="text-gray-400 hover:text-red-600 text-lg leading-none"
                  >
                    &times;
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Errors */}
      {validation.errors.length > 0 && (
        <div className="bg-red-50 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <span className="text-red-500 text-lg">&#10006;</span>
            <div>
              <span className="text-sm font-medium text-red-800">Errors</span>
              <ul className="mt-1 text-sm text-red-700 list-disc list-inside">
                {validation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Parse Error */}
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      {/* Duplicates Section */}
      {validation.duplicates.length > 0 && !hasErrors && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-start gap-2">
              <span className="text-yellow-600 text-lg">&#9888;</span>
              <span className="text-sm font-medium text-yellow-800">
                Potential Duplicates ({validation.duplicates.length} found)
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={keepAllDuplicates}
                className="text-xs px-2 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded"
              >
                Keep All
              </button>
              <button
                onClick={removeAllDuplicates}
                className="text-xs px-2 py-1 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded"
              >
                Remove All
              </button>
            </div>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {validation.duplicates.map((dup, index) => (
              <div
                key={index}
                className="bg-white rounded p-2 text-sm"
              >
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={removedDuplicateKeys.has(dup.key)}
                    onChange={() => toggleDuplicate(dup.key)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-mono text-gray-900">{dup.content}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {dup.file1}:{dup.row1}, {dup.file2}:{dup.row2}
                    </div>
                  </div>
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-yellow-700 mt-2">
            Check duplicates to remove them from the merged file
          </p>
        </div>
      )}

      {/* Summary and Actions */}
      {uploadedFiles.length > 0 && (
        <div className="flex items-center justify-between bg-gray-100 rounded-lg p-4">
          <div className="text-sm text-gray-700">
            <span className="font-medium">Total:</span>{' '}
            {finalRowCount} rows
            {duplicatesRemoved > 0 && (
              <span className="text-gray-500">
                {' '}({duplicatesRemoved} duplicate{duplicatesRemoved !== 1 ? 's' : ''} removed)
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={clearAll}
              className="py-2 px-4 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
            >
              Clear All
            </button>
            <button
              onClick={handleDownload}
              disabled={!canDownload}
              className={`py-2 px-4 rounded-lg transition-colors font-medium ${
                canDownload
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Download Merged CSV
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
