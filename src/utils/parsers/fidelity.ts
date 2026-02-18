import type { Trade } from '../../types/Trade';
import type { CashFlow } from '../../types/CashFlow';
import type { PortfolioData } from '../../types/PortfolioData';
import { convertDateFormat, parseMultiLineCSV } from './shared';

// Detect if this is a Fidelity CSV
export function isFidelityFormat(header: string[]): boolean {
  const lowerHeader = header.map(h => h.toLowerCase());
  return lowerHeader.includes('run date') &&
         lowerHeader.includes('action') &&
         lowerHeader.includes('symbol') &&
         lowerHeader.includes('amount ($)');
}

// Parse Fidelity CSV
export function parseFidelityCSV(csvText: string): PortfolioData {
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
