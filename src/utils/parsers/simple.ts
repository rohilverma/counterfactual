import type { Trade } from '../../types/Trade';
import type { CashFlow } from '../../types/CashFlow';
import type { PortfolioData } from '../../types/PortfolioData';
import { parseCSVLine, convertDateFormat } from './shared';

// Parse simple CSV format (ticker, date, shares, price)
export function parseSimpleCSV(lines: string[]): PortfolioData {
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
