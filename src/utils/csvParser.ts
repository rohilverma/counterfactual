import type { Trade, CashFlow, PortfolioData, CashFlowType } from '../types';
import { perf } from './logger';

// Parse CSV line handling quoted fields
function parseCSVLine(line: string): string[] {
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
function convertDateFormat(dateStr: string): string {
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

// Detect if this is a Schwab Equity Vests CSV
function isSchwabFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('action') &&
         lowerHeader.includes('symbol') &&
         lowerHeader.includes('quantity');
}

// Detect if this is a Robinhood CSV
function isRobinhoodFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('activity date') &&
         lowerHeader.includes('instrument') &&
         lowerHeader.includes('trans code');
}

// Detect if this is a Fidelity CSV
function isFidelityFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('run date') &&
         lowerHeader.includes('action') &&
         lowerHeader.includes('symbol') &&
         lowerHeader.includes('amount ($)');
}

// Parse CSV with multi-line quoted fields (needed for Robinhood)
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
function getCashFlowType(transCode: string): CashFlowType | null {
  switch (transCode) {
    case 'ACH': return 'deposit';
    case 'CDIV': return 'dividend';
    case 'SCAP':
    case 'LCAP': return 'capgain';
    case 'INT': return 'interest';
    default: return null;
  }
}

// Parse Robinhood CSV
function parseRobinhoodCSV(csvText: string): PortfolioData {
  const rows = parseMultiLineCSV(csvText);
  if (rows.length < 2) return { trades: [], cashFlows: [], format: 'robinhood' };

  const header = rows[0].map(h => h.toLowerCase());
  const dateIndex = header.indexOf('activity date');
  const instrumentIndex = header.indexOf('instrument');
  const transCodeIndex = header.indexOf('trans code');
  const quantityIndex = header.indexOf('quantity');
  const priceIndex = header.indexOf('price');
  const amountIndex = header.indexOf('amount');

  const trades: Trade[] = [];
  const cashFlows: CashFlow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const transCode = values[transCodeIndex];
    const dateRaw = values[dateIndex];
    if (!dateRaw) continue;
    const date = convertDateFormat(dateRaw);

    // Check if this is a cash flow transaction
    const cashFlowType = getCashFlowType(transCode);
    if (cashFlowType) {
      const amountRaw = values[amountIndex]?.replace(/[$(),]/g, '');
      const amount = parseFloat(amountRaw);
      if (!isNaN(amount) && amount > 0) {
        let ticker = values[instrumentIndex]?.toUpperCase();
        if (ticker === 'FB') ticker = 'META';
        cashFlows.push({
          id: `cashflow-${date}-${i}`,
          date,
          amount,
          type: cashFlowType,
          ...(ticker ? { ticker } : {}),
        });
      }
      continue;
    }

    // Process Buy, Sell, and Split transactions
    if (transCode !== 'Buy' && transCode !== 'Sell' && transCode !== 'SPL') continue;

    let ticker = values[instrumentIndex]?.toUpperCase();
    if (!ticker) continue;

    // Handle ticker renames
    if (ticker === 'FB') ticker = 'META';

    const quantityRaw = values[quantityIndex];
    const priceRaw = values[priceIndex]?.replace('$', '');

    const quantity = parseFloat(quantityRaw);
    const price = priceRaw ? parseFloat(priceRaw) : NaN;

    if (isNaN(quantity) || quantity <= 0) continue;

    // Stock splits add shares at $0 cost (price = 0)
    if (transCode === 'SPL') {
      trades.push({
        id: `${ticker}-${date}-${i}-split`,
        ticker,
        date,
        shares: quantity,
        type: 'buy',
        price: 0, // Split shares have no cost basis
      });
    } else {
      trades.push({
        id: `${ticker}-${date}-${i}`,
        ticker,
        date,
        shares: quantity,
        type: transCode === 'Buy' ? 'buy' : 'sell',
        ...(isNaN(price) ? {} : { price }),
      });
    }
  }

  return { trades, cashFlows, format: 'robinhood' };
}

// Parse Fidelity CSV
function parseFidelityCSV(csvText: string): PortfolioData {
  const rows = parseMultiLineCSV(csvText);
  if (rows.length < 2) return { trades: [], cashFlows: [], format: 'fidelity' };

  const header = rows[0].map(h => h.toLowerCase());
  const runDateIndex = header.indexOf('run date');
  const actionIndex = header.indexOf('action');
  const symbolIndex = header.indexOf('symbol');
  const priceIndex = header.indexOf('price ($)');
  const quantityIndex = header.indexOf('quantity');
  const amountIndex = header.indexOf('amount ($)');

  const trades: Trade[] = [];
  const cashFlows: CashFlow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const action = values[actionIndex]?.trim() || '';
    const dateRaw = values[runDateIndex]?.trim();
    if (!dateRaw || !dateRaw.includes('/')) continue;

    const date = convertDateFormat(dateRaw);
    let symbol = values[symbolIndex]?.toUpperCase()?.trim() || '';

    // Handle ticker renames
    if (symbol === 'FB') symbol = 'META';

    const priceRaw = values[priceIndex]?.replace(/[$,]/g, '');
    const quantityRaw = values[quantityIndex]?.replace(/,/g, '');
    const amountRaw = values[amountIndex]?.replace(/[$,]/g, '');

    const price = priceRaw ? parseFloat(priceRaw) : NaN;
    const quantity = quantityRaw ? parseFloat(quantityRaw) : NaN;
    const amount = amountRaw ? parseFloat(amountRaw) : NaN;

    const actionUpper = action.toUpperCase();

    // Handle buy transactions
    if (actionUpper.startsWith('YOU BOUGHT') || actionUpper.startsWith('REINVESTMENT')) {
      if (!symbol || isNaN(quantity) || quantity <= 0) continue;

      // Skip money market funds (cash equivalents)
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: Math.abs(quantity),
        type: 'buy',
        ...(isNaN(price) || price === 0 ? {} : { price }),
      });
      continue;
    }

    // Handle sell transactions
    if (actionUpper.startsWith('YOU SOLD')) {
      if (!symbol || isNaN(quantity)) continue;

      // Skip money market funds
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: Math.abs(quantity),
        type: 'sell',
        ...(isNaN(price) || price === 0 ? {} : { price }),
      });
      continue;
    }

    // Handle 401k contributions (treated as buys + deposits)
    if (action === 'Contributions') {
      // Record deposit cashFlow for the contribution amount
      if (!isNaN(amount) && amount > 0) {
        cashFlows.push({
          id: `cashflow-${date}-${i}`,
          date,
          amount,
          type: 'deposit',
        });
      }

      if (!symbol && values[header.indexOf('description')]) {
        // For 401k, symbol might be empty but description has fund name
        // Skip trade for these as they're typically target date funds
        continue;
      }
      if (!symbol || isNaN(quantity) || quantity <= 0) continue;

      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: quantity,
        type: 'buy',
        ...(isNaN(price) || price === 0 ? {} : { price }),
      });
      continue;
    }

    // Handle deposits
    if (actionUpper.includes('ELECTRONIC FUNDS TRANSFER RECEIVED') ||
        actionUpper.includes('TRANSFERRED FROM TO BROKERAGE')) {
      if (isNaN(amount) || amount <= 0) continue;

      cashFlows.push({
        id: `cashflow-${date}-${i}`,
        date,
        amount,
        type: 'deposit',
      });
      continue;
    }

    // Handle dividends
    if (actionUpper.startsWith('DIVIDEND RECEIVED')) {
      if (isNaN(amount) || amount <= 0) continue;

      // Skip money market fund dividends
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      cashFlows.push({
        id: `cashflow-${date}-${i}`,
        date,
        amount,
        type: 'dividend',
        ...(symbol ? { ticker: symbol } : {}),
      });
      continue;
    }

  }

  return { trades, cashFlows, format: 'fidelity' };
}

// Parse Schwab Equity Vests CSV
function parseSchwabCSV(lines: string[]): PortfolioData {
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());

  const dateIndex = header.indexOf('date');
  const actionIndex = header.indexOf('action');
  const symbolIndex = header.indexOf('symbol');
  const quantityIndex = header.indexOf('quantity');
  const priceIndex = header.indexOf('price');

  const trades: Trade[] = [];
  const cashFlows: CashFlow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    const action = values[actionIndex];

    // Only process Stock Plan Activity (RSU vests) and Reinvest Shares
    if (action !== 'Stock Plan Activity' && action !== 'Reinvest Shares') {
      continue;
    }

    let symbol = values[symbolIndex]?.toUpperCase();
    // Handle ticker renames
    if (symbol === 'FB') symbol = 'META';
    const dateRaw = values[dateIndex];
    const quantity = parseFloat(values[quantityIndex]);
    const priceRaw = values[priceIndex]?.replace('$', '');
    const price = priceRaw ? parseFloat(priceRaw) : NaN;

    if (!symbol || !dateRaw || isNaN(quantity) || quantity <= 0) {
      continue;
    }

    const date = convertDateFormat(dateRaw);

    trades.push({
      id: `${symbol}-${date}-${i}`,
      ticker: symbol,
      date,
      shares: quantity,
      type: 'buy',
      ...(isNaN(price) ? {} : { price }),
    });

    // Synthesize a deposit for the vest value (shares * price)
    if (!isNaN(price) && price > 0) {
      cashFlows.push({
        id: `cashflow-${date}-${i}`,
        date,
        amount: quantity * price,
        type: 'deposit',
      });
    }
  }

  return { trades, cashFlows, format: 'schwab' };
}

// Parse simple CSV format (ticker, date, shares, price)
function parseSimpleCSV(lines: string[]): PortfolioData {
  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());

  const tickerIndex = header.indexOf('ticker');
  const dateIndex = header.indexOf('date');
  const sharesIndex = header.indexOf('shares');
  const priceIndex = header.indexOf('price');
  const typeIndex = header.indexOf('type');

  if (tickerIndex === -1 || dateIndex === -1 || sharesIndex === -1) {
    throw new Error('CSV must have columns: ticker, date, shares (price and type are optional)');
  }

  const trades: Trade[] = [];
  const cashFlows: CashFlow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);

    const ticker = values[tickerIndex]?.toUpperCase();
    const date = convertDateFormat(values[dateIndex]);
    const shares = parseFloat(values[sharesIndex]);
    const price = priceIndex !== -1 ? parseFloat(values[priceIndex]) : NaN;
    const typeRaw = typeIndex !== -1 ? values[typeIndex]?.toLowerCase() : 'buy';
    const type = typeRaw === 'sell' ? 'sell' : 'buy';

    if (!ticker || !date || isNaN(shares)) {
      console.warn(`Skipping invalid row ${i + 1}: ${line}`);
      continue;
    }

    trades.push({
      id: `${ticker}-${date}-${i}`,
      ticker,
      date,
      shares,
      type,
      ...(isNaN(price) ? {} : { price }),
    });

    // Synthesize a deposit for buy trades with a known price
    if (type === 'buy' && !isNaN(price) && price > 0) {
      cashFlows.push({
        id: `cashflow-${date}-${i}`,
        date,
        amount: shares * price,
        type: 'deposit',
      });
    }
  }

  return { trades, cashFlows, format: 'simple' };
}

export function parseCSV(csvText: string): PortfolioData {
  perf.start('parseCSV:total');

  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row');
  }

  const header = parseCSVLine(lines[0]);

  let result: PortfolioData;
  if (isRobinhoodFormat(header)) {
    perf.start('parseCSV:robinhood');
    result = parseRobinhoodCSV(csvText);
    perf.end('parseCSV:robinhood');
  } else if (isFidelityFormat(header)) {
    perf.start('parseCSV:fidelity');
    result = parseFidelityCSV(csvText);
    perf.end('parseCSV:fidelity');
  } else if (isSchwabFormat(header)) {
    perf.start('parseCSV:schwab');
    result = parseSchwabCSV(lines);
    perf.end('parseCSV:schwab');
  } else {
    perf.start('parseCSV:simple');
    result = parseSimpleCSV(lines);
    perf.end('parseCSV:simple');
  }

  perf.end('parseCSV:total');
  return result;
}

export function generateSampleCSV(): string {
  return `ticker,date,shares,price
AAPL,2023-01-15,10,142.50
GOOGL,2023-02-20,5,94.00
MSFT,2023-03-10,8,250.00
NVDA,2023-04-05,15,
AMZN,2023-05-12,12,110.00`;
}
