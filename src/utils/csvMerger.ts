// CSV merging utilities for combining multiple CSV files

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
}

export interface UploadedFile {
  name: string;
  headers: string[];
  rows: string[][];
  rowCount: number;
}

export interface DuplicateInfo {
  file1: string;
  row1: number;
  file2: string;
  row2: number;
  content: string;
  key: string;
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  duplicates: DuplicateInfo[];
}

// Parse CSV with multi-line quoted fields
function parseMultiLineCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      if (char === '\r') i++;
      currentRow.push(currentField);
      if (currentRow.some(f => f !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (char !== '\r') {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Check if a row is a valid transaction row (not a text/description row)
function isTransactionRow(row: string[], headers: string[]): boolean {
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // For Robinhood format: must have Activity Date and Trans Code
  const dateIdx = lowerHeaders.indexOf('activity date');
  const transCodeIdx = lowerHeaders.indexOf('trans code');

  if (dateIdx !== -1 && transCodeIdx !== -1) {
    const dateVal = row[dateIdx]?.trim() || '';
    const transCode = row[transCodeIdx]?.trim() || '';

    // Must have a date that looks like a date (contains /)
    if (!dateVal || !dateVal.includes('/')) {
      return false;
    }

    // Must have a non-empty transaction code
    if (!transCode) {
      return false;
    }

    // Valid Robinhood trans codes
    const validTransCodes = [
      'Buy', 'Sell', 'SPL', 'ACH', 'CDIV', 'SCAP', 'LCAP', 'INT',
      'ADR', 'OEXP', 'OASGN', 'OEXCS', 'Gold', 'SLIP', 'MA', 'NC'
    ];

    // Check if it's a known trans code (case-insensitive match)
    const isKnownCode = validTransCodes.some(
      code => code.toLowerCase() === transCode.toLowerCase()
    );

    return isKnownCode;
  }

  // For Fidelity format: must have Run Date and Action
  const runDateIdx = lowerHeaders.indexOf('run date');
  const actionIdx = lowerHeaders.indexOf('action');

  if (runDateIdx !== -1 && actionIdx !== -1) {
    const dateVal = row[runDateIdx]?.trim() || '';
    const action = row[actionIdx]?.trim() || '';

    // Must have a date that looks like a date (contains /)
    if (!dateVal || !dateVal.includes('/')) {
      return false;
    }

    // Must have a non-empty action
    if (!action) {
      return false;
    }

    // Valid Fidelity actions (transaction types we care about)
    const validActionPrefixes = [
      'YOU BOUGHT',
      'YOU SOLD',
      'REINVESTMENT',
      'DIVIDEND RECEIVED',
      'Contributions',
      'Electronic Funds Transfer',
      'TRANSFERRED FROM TO BROKERAGE',
    ];

    // Check if action starts with a valid prefix
    const isValidAction = validActionPrefixes.some(
      prefix => action.toUpperCase().startsWith(prefix.toUpperCase())
    );

    return isValidAction;
  }

  // For non-Robinhood/Fidelity formats: check if the row has enough non-empty fields
  // and the first field looks like data (not a description)
  const nonEmptyFields = row.filter(f => f.trim() !== '').length;
  if (nonEmptyFields < 2) {
    return false;
  }

  // If first column is very long text, it's likely a description row
  const firstField = row[0]?.trim() || '';
  if (firstField.length > 50 && !firstField.includes(',')) {
    return false;
  }

  return true;
}

export function parseCSVText(csvText: string): ParsedCSV {
  const rows = parseMultiLineCSV(csvText);
  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter(row => isTransactionRow(row, headers));

  return {
    headers,
    rows: dataRows,
  };
}

// Validate that headers match across files
export function validateHeaders(
  files: UploadedFile[]
): { valid: boolean; errors: string[] } {
  if (files.length === 0) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const referenceHeaders = files[0].headers;
  const referenceSet = new Set(referenceHeaders.map(h => h.toLowerCase()));

  for (let i = 1; i < files.length; i++) {
    const file = files[i];
    const fileHeaders = file.headers;
    const fileSet = new Set(fileHeaders.map(h => h.toLowerCase()));

    // Check for missing columns
    const missing = referenceHeaders.filter(h => !fileSet.has(h.toLowerCase()));
    const extra = fileHeaders.filter(h => !referenceSet.has(h.toLowerCase()));

    if (missing.length > 0 || extra.length > 0) {
      let errorMsg = `${file.name} has different columns than ${files[0].name}`;
      if (missing.length > 0) {
        errorMsg += `. Missing: ${missing.join(', ')}`;
      }
      if (extra.length > 0) {
        errorMsg += `. Extra: ${extra.join(', ')}`;
      }
      errors.push(errorMsg);
    }
  }

  return { valid: errors.length === 0, errors };
}

// Create a key for duplicate detection based on key columns
function createDuplicateKey(row: string[], headers: string[]): string | null {
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // Key columns for Robinhood format
  const dateIdx = lowerHeaders.indexOf('activity date');
  const tickerIdx = lowerHeaders.indexOf('instrument');
  const transCodeIdx = lowerHeaders.indexOf('trans code');
  const quantityIdx = lowerHeaders.indexOf('quantity');
  const amountIdx = lowerHeaders.indexOf('amount');

  // If we have Robinhood-style columns
  if (dateIdx !== -1 && tickerIdx !== -1 && transCodeIdx !== -1) {
    const parts = [
      row[dateIdx] || '',
      row[tickerIdx] || '',
      row[transCodeIdx] || '',
      row[quantityIdx] || '',
      row[amountIdx] || '',
    ].map(p => p.trim().toLowerCase());
    return parts.join('|');
  }

  // Key columns for Fidelity format
  const runDateIdx = lowerHeaders.indexOf('run date');
  const symbolIdx = lowerHeaders.indexOf('symbol');
  const actionIdx = lowerHeaders.indexOf('action');
  const fidelityQuantityIdx = lowerHeaders.indexOf('quantity');
  const fidelityAmountIdx = lowerHeaders.indexOf('amount ($)');

  // If we have Fidelity-style columns
  if (runDateIdx !== -1 && actionIdx !== -1) {
    const parts = [
      row[runDateIdx] || '',
      row[symbolIdx] || '',
      row[actionIdx] || '',
      row[fidelityQuantityIdx] || '',
      row[fidelityAmountIdx] || '',
    ].map(p => p.trim().toLowerCase());
    return parts.join('|');
  }

  // Fallback: use all columns
  return row.map(v => v.trim().toLowerCase()).join('|');
}

// Format row for display
function formatRowForDisplay(row: string[], headers: string[]): string {
  const lowerHeaders = headers.map(h => h.toLowerCase());

  // Robinhood format
  const dateIdx = lowerHeaders.indexOf('activity date');
  const tickerIdx = lowerHeaders.indexOf('instrument');
  const transCodeIdx = lowerHeaders.indexOf('trans code');
  const quantityIdx = lowerHeaders.indexOf('quantity');
  const amountIdx = lowerHeaders.indexOf('amount');

  if (dateIdx !== -1 && tickerIdx !== -1 && transCodeIdx !== -1) {
    const parts = [
      row[dateIdx] || '',
      row[tickerIdx] || '',
      row[transCodeIdx] || '',
      row[quantityIdx] || '',
      row[amountIdx] || '',
    ].filter(p => p.trim());
    return parts.join(' | ');
  }

  // Fidelity format
  const runDateIdx = lowerHeaders.indexOf('run date');
  const symbolIdx = lowerHeaders.indexOf('symbol');
  const actionIdx = lowerHeaders.indexOf('action');
  const fidelityQuantityIdx = lowerHeaders.indexOf('quantity');
  const fidelityAmountIdx = lowerHeaders.indexOf('amount ($)');

  if (runDateIdx !== -1 && actionIdx !== -1) {
    // Extract action type (e.g., "YOU BOUGHT" from "YOU BOUGHT NVIDIA...")
    const action = row[actionIdx] || '';
    const shortAction = action.split(' ').slice(0, 2).join(' ');
    const parts = [
      row[runDateIdx] || '',
      row[symbolIdx] || '',
      shortAction,
      row[fidelityQuantityIdx] || '',
      row[fidelityAmountIdx] || '',
    ].filter(p => p.trim());
    return parts.join(' | ');
  }

  return row.slice(0, 5).join(' | ');
}

// Find duplicate rows across files
export function findDuplicates(files: UploadedFile[]): DuplicateInfo[] {
  if (files.length === 0) return [];

  const duplicates: DuplicateInfo[] = [];
  const seen = new Map<string, { file: string; rowNum: number; row: string[] }>();

  for (const file of files) {
    for (let rowIdx = 0; rowIdx < file.rows.length; rowIdx++) {
      const row = file.rows[rowIdx];
      const key = createDuplicateKey(row, file.headers);

      if (!key) continue;

      const existing = seen.get(key);
      if (existing) {
        duplicates.push({
          file1: existing.file,
          row1: existing.rowNum + 1, // 1-indexed for display
          file2: file.name,
          row2: rowIdx + 1,
          content: formatRowForDisplay(row, file.headers),
          key,
        });
      } else {
        seen.set(key, { file: file.name, rowNum: rowIdx, row });
      }
    }
  }

  return duplicates;
}

// Merge CSVs into one, optionally excluding duplicate keys
export function mergeCSVs(
  files: UploadedFile[],
  excludeKeys: Set<string> = new Set()
): { headers: string[]; rows: string[][] } {
  if (files.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = files[0].headers;
  const seenKeys = new Set<string>();
  const rows: string[][] = [];

  for (const file of files) {
    for (const row of file.rows) {
      const key = createDuplicateKey(row, file.headers);

      // Skip if this key should be excluded
      if (key && excludeKeys.has(key)) {
        continue;
      }

      // Skip if we've already seen this row (dedup within merge)
      if (key && seenKeys.has(key)) {
        continue;
      }

      if (key) {
        seenKeys.add(key);
      }

      rows.push(row);
    }
  }

  return { headers, rows };
}

// Escape a field for CSV output
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

// Export merged data to CSV string
export function exportCSV(headers: string[], rows: string[][]): string {
  const lines: string[] = [];

  lines.push(headers.map(escapeCSVField).join(','));

  for (const row of rows) {
    lines.push(row.map(escapeCSVField).join(','));
  }

  return lines.join('\n');
}

// Validate files and return combined result
export function validateFiles(files: UploadedFile[]): ValidationResult {
  const headerValidation = validateHeaders(files);
  const duplicates = findDuplicates(files);

  const warnings: string[] = [];
  if (duplicates.length > 0) {
    warnings.push(`Found ${duplicates.length} potential duplicate row(s)`);
  }

  return {
    errors: headerValidation.errors,
    warnings,
    duplicates,
  };
}
