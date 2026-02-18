import type { Trade } from '../../types/Trade';
import type { CashFlow } from '../../types/CashFlow';
import type { PortfolioData } from '../../types/PortfolioData';
import { convertDateFormat, parseMultiLineCSV, getCashFlowType } from './shared';

// Detect if this is a Robinhood CSV
export function isRobinhoodFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('activity date') &&
         lowerHeader.includes('instrument') &&
         lowerHeader.includes('trans code');
}

// Parse Robinhood CSV
export function parseRobinhoodCSV(csvText: string): PortfolioData {
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
