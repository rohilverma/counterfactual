import { describe, it, expect } from 'vitest';
import {
  parseCSVText,
  validateHeaders,
  findDuplicates,
  mergeCSVs,
  exportCSV,
  validateFiles,
} from '../utils/csvMerger';
import type { UploadedFile } from '../utils/csvMerger';

describe('parseCSVText', () => {
  it('returns empty for empty input', () => {
    const result = parseCSVText('');
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('parses headers and data rows', () => {
    const csv = `ticker,date,shares
AAPL,2023-01-15,10
GOOG,2023-02-20,5`;

    const result = parseCSVText(csv);
    expect(result.headers).toEqual(['ticker', 'date', 'shares']);
    expect(result.rows).toHaveLength(2);
  });

  it('handles quoted fields with commas', () => {
    const csv = `name,value
"Smith, John",100
"Doe, Jane",200`;

    const result = parseCSVText(csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0][0]).toBe('Smith, John');
  });

  it('handles escaped quotes in fields', () => {
    const csv = `name,value
"He said ""hello""",100`;

    const result = parseCSVText(csv);
    expect(result.rows[0][0]).toBe('He said "hello"');
  });

  it('handles CRLF line endings', () => {
    const csv = "ticker,date,shares\r\nAAPL,2023-01-15,10\r\nGOOG,2023-02-20,5";

    const result = parseCSVText(csv);
    expect(result.rows).toHaveLength(2);
  });

  it('filters out non-transaction rows for Robinhood format', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2023,01/15/2023,01/18/2023,AAPL,Apple Inc,Buy,10,$142.50,"($1,425.00)"
This is some random description text that should be filtered out`;

    const result = parseCSVText(csv);
    expect(result.rows).toHaveLength(1);
  });
});

describe('validateHeaders', () => {
  it('returns valid for empty file list', () => {
    const result = validateHeaders([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid for matching headers', () => {
    const files: UploadedFile[] = [
      { name: 'file1.csv', headers: ['a', 'b', 'c'], rows: [], rowCount: 0 },
      { name: 'file2.csv', headers: ['a', 'b', 'c'], rows: [], rowCount: 0 },
    ];
    const result = validateHeaders(files);
    expect(result.valid).toBe(true);
  });

  it('detects mismatched headers', () => {
    const files: UploadedFile[] = [
      { name: 'file1.csv', headers: ['a', 'b', 'c'], rows: [], rowCount: 0 },
      { name: 'file2.csv', headers: ['a', 'b', 'd'], rows: [], rowCount: 0 },
    ];
    const result = validateHeaders(files);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('file2.csv');
  });

  it('is case-insensitive for header comparison', () => {
    const files: UploadedFile[] = [
      { name: 'file1.csv', headers: ['Ticker', 'Date'], rows: [], rowCount: 0 },
      { name: 'file2.csv', headers: ['ticker', 'date'], rows: [], rowCount: 0 },
    ];
    const result = validateHeaders(files);
    expect(result.valid).toBe(true);
  });
});

describe('findDuplicates', () => {
  it('returns empty for no files', () => {
    expect(findDuplicates([])).toEqual([]);
  });

  it('finds duplicates across Robinhood files', () => {
    const headers = ['Activity Date', 'Instrument', 'Trans Code', 'Quantity', 'Amount'];
    const files: UploadedFile[] = [
      {
        name: 'jan.csv',
        headers,
        rows: [['01/15/2023', 'AAPL', 'Buy', '10', '($1,425.00)']],
        rowCount: 1,
      },
      {
        name: 'feb.csv',
        headers,
        rows: [['01/15/2023', 'AAPL', 'Buy', '10', '($1,425.00)']],
        rowCount: 1,
      },
    ];

    const dupes = findDuplicates(files);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].file1).toBe('jan.csv');
    expect(dupes[0].file2).toBe('feb.csv');
  });

  it('does not flag non-duplicates', () => {
    const headers = ['Activity Date', 'Instrument', 'Trans Code', 'Quantity', 'Amount'];
    const files: UploadedFile[] = [
      {
        name: 'jan.csv',
        headers,
        rows: [['01/15/2023', 'AAPL', 'Buy', '10', '($1,425.00)']],
        rowCount: 1,
      },
      {
        name: 'feb.csv',
        headers,
        rows: [['02/20/2023', 'GOOG', 'Buy', '5', '($470.00)']],
        rowCount: 1,
      },
    ];

    const dupes = findDuplicates(files);
    expect(dupes).toHaveLength(0);
  });
});

describe('mergeCSVs', () => {
  it('returns empty for no files', () => {
    const result = mergeCSVs([]);
    expect(result.headers).toEqual([]);
    expect(result.rows).toEqual([]);
  });

  it('merges rows from multiple files', () => {
    const headers = ['ticker', 'date', 'shares'];
    const files: UploadedFile[] = [
      { name: 'a.csv', headers, rows: [['AAPL', '2023-01-15', '10']], rowCount: 1 },
      { name: 'b.csv', headers, rows: [['GOOG', '2023-02-20', '5']], rowCount: 1 },
    ];

    const result = mergeCSVs(files);
    expect(result.headers).toEqual(headers);
    expect(result.rows).toHaveLength(2);
  });

  it('deduplicates rows within merge', () => {
    const headers = ['ticker', 'date', 'shares'];
    const files: UploadedFile[] = [
      { name: 'a.csv', headers, rows: [['AAPL', '2023-01-15', '10']], rowCount: 1 },
      { name: 'b.csv', headers, rows: [['AAPL', '2023-01-15', '10']], rowCount: 1 },
    ];

    const result = mergeCSVs(files);
    expect(result.rows).toHaveLength(1);
  });

  it('excludes specified keys', () => {
    const headers = ['ticker', 'date', 'shares'];
    const files: UploadedFile[] = [
      { name: 'a.csv', headers, rows: [
        ['AAPL', '2023-01-15', '10'],
        ['GOOG', '2023-02-20', '5'],
      ], rowCount: 2 },
    ];

    const excludeKeys = new Set(['aapl|2023-01-15|10']);
    const result = mergeCSVs(files, excludeKeys);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0][0]).toBe('GOOG');
  });
});

describe('exportCSV', () => {
  it('produces valid CSV string', () => {
    const headers = ['ticker', 'date', 'shares'];
    const rows = [
      ['AAPL', '2023-01-15', '10'],
      ['GOOG', '2023-02-20', '5'],
    ];

    const result = exportCSV(headers, rows);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('ticker,date,shares');
    expect(lines[1]).toBe('AAPL,2023-01-15,10');
  });

  it('escapes fields with commas', () => {
    const headers = ['name', 'value'];
    const rows = [['Smith, John', '100']];

    const result = exportCSV(headers, rows);
    expect(result).toContain('"Smith, John"');
  });

  it('escapes fields with quotes', () => {
    const headers = ['desc', 'value'];
    const rows = [['He said "hello"', '100']];

    const result = exportCSV(headers, rows);
    expect(result).toContain('"He said ""hello"""');
  });
});

describe('validateFiles', () => {
  it('returns no errors for compatible files', () => {
    const files: UploadedFile[] = [
      { name: 'a.csv', headers: ['a', 'b'], rows: [['1', '2']], rowCount: 1 },
      { name: 'b.csv', headers: ['a', 'b'], rows: [['3', '4']], rowCount: 1 },
    ];

    const result = validateFiles(files);
    expect(result.errors).toHaveLength(0);
  });

  it('returns warning for duplicates', () => {
    const headers = ['ticker', 'date', 'shares'];
    const files: UploadedFile[] = [
      { name: 'a.csv', headers, rows: [['AAPL', '2023-01-15', '10']], rowCount: 1 },
      { name: 'b.csv', headers, rows: [['AAPL', '2023-01-15', '10']], rowCount: 1 },
    ];

    const result = validateFiles(files);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.duplicates).toHaveLength(1);
  });
});
