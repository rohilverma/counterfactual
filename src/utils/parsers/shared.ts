import type { CashFlowType } from '../../types/CashFlow';

// Parse CSV line handling quoted fields
export function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

// Convert MM/DD/YYYY to YYYY-MM-DD
export function convertDateFormat(dateStr: string): string {
  // Handle "MM/DD/YYYY as of MM/DD/YYYY" format - use the "as of" date
  const asOfMatch = dateStr.match(/as of (\d{1,2}\/\d{1,2}\/\d{4})/);
  const dateToUse = asOfMatch ? asOfMatch[1] : dateStr.split(' ')[0];

  const match = dateToUse.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return dateStr; // Return as-is if already in correct format
}

// Parse CSV with multi-line quoted fields (needed for Robinhood)
export function parseMultiLineCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
      if (char === '\r') i++; // Skip \n in \r\n
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else if (char !== '\r') {
      currentField += char;
    }
  }

  // Handle last field/row
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Map Robinhood trans codes to cash flow types
export function getCashFlowType(transCode: string): CashFlowType | null {
  switch (transCode) {
    case 'ACH': return 'deposit';
    case 'CDIV': return 'dividend';
    case 'SCAP':
    case 'LCAP': return 'capgain';
    case 'INT': return 'interest';
    default: return null;
  }
}
