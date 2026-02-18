import type { Trade } from '../../types/Trade';
import type { CashFlow } from '../../types/CashFlow';
import type { PortfolioData } from '../../types/PortfolioData';
import { parseCSVLine, convertDateFormat } from './shared';

// Detect if this is a Schwab Equity Vests CSV
export function isSchwabFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('action') &&
         lowerHeader.includes('symbol') &&
         lowerHeader.includes('quantity');
}

// Parse Schwab Equity Vests CSV
export function parseSchwabCSV(lines: string[]): PortfolioData {
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
