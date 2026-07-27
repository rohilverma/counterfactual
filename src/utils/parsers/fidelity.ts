import type { Trade } from '../../types/Trade';
import type { CashFlow } from '../../types/CashFlow';
import type { PortfolioData } from '../../types/PortfolioData';
import { convertDateFormat, parseMultiLineCSV, isCusip } from './shared';

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
    // Fidelity lists dual-class shares with no separator (e.g. HEICO Class A as
    // "HEIA"), but Yahoo Finance uses a hyphen ("HEI-A"). Remap so price/split
    // data can be fetched; otherwise the position is parsed but silently dropped
    // for lack of a price feed.
    if (symbol === 'HEIA') symbol = 'HEI-A';

    const priceRaw = values[priceIndex]?.replace(/[$,]/g, '');
    const quantityRaw = values[quantityIndex]?.replace(/,/g, '');
    const amountRaw = values[amountIndex]?.replace(/[$,]/g, '');

    const price = priceRaw ? parseFloat(priceRaw) : NaN;
    const quantity = quantityRaw ? parseFloat(quantityRaw) : NaN;
    const amount = amountRaw ? parseFloat(amountRaw) : NaN;

    const actionUpper = action.toUpperCase();

    // Fixed income (bonds/T-bills) is listed by CUSIP and quoted per $100 face,
    // so raw quantity x price does not equal dollar value and there is no market
    // price feed. Store these in dollar terms instead: shares = |amount|, price = 1,
    // so shares x price == the position's dollar value (at par/cost). The time
    // series values missing CUSIP prices at par to match.
    const isFixedIncome = isCusip(symbol) && !isNaN(amount) && amount !== 0;

    // Handle buy transactions
    const isReinvestment = actionUpper.startsWith('REINVESTMENT');
    if (actionUpper.startsWith('YOU BOUGHT') || isReinvestment) {
      if (!symbol || isNaN(quantity) || quantity <= 0) continue;

      // Skip money market funds (cash equivalents)
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      // Reinvested dividends are added at zero cost basis. The dividend is
      // already recorded as its own cash inflow, and brokerages (Fidelity)
      // report a position's cost basis / total gain counting only actual cash
      // purchases — reinvested shares are treated as zero-cost, so their full
      // market value shows up as gain. Pinning price to an explicit 0 (rather
      // than leaving it unset) keeps the downstream missing-price back-fill from
      // assigning them a market cost.
      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: isFixedIncome ? Math.abs(amount) : Math.abs(quantity),
        type: 'buy',
        ...(isReinvestment && !isFixedIncome
          ? { price: 0 }
          : isFixedIncome
            ? { price: 1 }
            : isNaN(price) || price === 0
              ? {}
              : { price }),
      });
      continue;
    }

    // Handle sell transactions.
    // REDEMPTION PAYOUT covers maturing bonds/T-bills that are paid out at par;
    // these carry a negative quantity, so treat them as sells to close the position.
    if (actionUpper.startsWith('YOU SOLD') || actionUpper.startsWith('REDEMPTION PAYOUT')) {
      if (!symbol || isNaN(quantity)) continue;

      // Skip money market funds
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: isFixedIncome ? Math.abs(amount) : Math.abs(quantity),
        type: 'sell',
        ...(isFixedIncome ? { price: 1 } : (isNaN(price) || price === 0 ? {} : { price })),
      });
      continue;
    }

    // Handle share distributions from stock splits (e.g. NVDA's 10-for-1 split
    // in June 2024, which Fidelity records as "DISTRIBUTION ... (Cash)" with a
    // Type of "Shares"). The Quantity is the number of new shares added at no
    // cash cost. Add them as a buy so the running share count reflects the
    // post-split total, but pin the price to an explicit 0 so it contributes no
    // cost basis and no benchmark SPY-equivalent shares. The explicit 0 (rather
    // than leaving price unset) is important: downstream, missing prices are
    // back-filled from the market feed, which would otherwise assign these free
    // shares a full market cost. Yahoo's split data only un-adjusts historical
    // prices, never share counts, so this does not double-count the split.
    if (actionUpper.startsWith('DISTRIBUTION')) {
      if (!symbol || isNaN(quantity) || quantity <= 0) continue;
      if (symbol === 'FDRXX' || symbol === 'SPAXX') continue;

      trades.push({
        id: `${symbol}-${date}-${i}`,
        ticker: symbol,
        date,
        shares: Math.abs(quantity),
        type: 'buy',
        price: 0,
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

    // Handle withdrawals (money leaving the account).
    // Recorded as a negative-amount deposit so it reduces cost basis and unwinds
    // the SPY-equivalent shares in the benchmark comparison.
    if (actionUpper.includes('ELECTRONIC FUNDS TRANSFER PAID') ||
        actionUpper.includes('TRANSFERRED TO TO BROKERAGE')) {
      if (isNaN(amount) || amount >= 0) continue;

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
