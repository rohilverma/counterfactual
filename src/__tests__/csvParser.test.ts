import { describe, it, expect, vi } from 'vitest';
import { parseCSV } from '../utils/csvParser';
import type { Trade, CashFlow } from '../types';

// Mock the logger to avoid fetch calls in tests
vi.mock('../utils/logger', () => ({
  perf: { start: vi.fn(), end: vi.fn() },
}));

// --- helpers ---

function findTrade(trades: Trade[], ticker: string, date: string): Trade | undefined {
  return trades.find(t => t.ticker === ticker && t.date === date);
}

function findCashFlow(cashFlows: CashFlow[], type: string, date: string): CashFlow | undefined {
  return cashFlows.find(cf => cf.type === type && cf.date === date);
}

// ============================================================
// Semantic equivalence: identical activity in all 4 CSV formats
// must produce the same trades and deposits.
// ============================================================

describe('semantic equivalence across formats', () => {
  // Scenario: on 2023-06-15, buy 10 shares of AAPL at $185.
  // On 2023-06-15, deposit $5000.

  const simpleCSV = `ticker,date,shares,price,type
AAPL,2023-06-15,10,185,buy`;

  const robinhoodCSV = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
06/15/2023,06/15/2023,06/20/2023,,ACH Deposit,ACH,,$0.00,"$5,000.00"
06/15/2023,06/15/2023,06/20/2023,AAPL,Apple Inc,Buy,10,$185.00,"($1,850.00)"`;

  const schwabCSV = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
06/15/2023,Stock Plan Activity,AAPL,"Vest from equity plan",10,$185.00,$0.00,"$1,850.00"`;

  const fidelityCSV = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
06/15/2023,ELECTRONIC FUNDS TRANSFER RECEIVED,,CONTRIBUTION,Cash,,,,,,5000.00,06/15/2023
06/15/2023,YOU BOUGHT APPLE INC,AAPL,,Cash,10,185.00,0,,,"(1,850.00)",06/20/2023`;

  it('all formats produce a buy of 10 AAPL at $185 on 2023-06-15', () => {
    const simple = parseCSV(simpleCSV);
    const robinhood = parseCSV(robinhoodCSV);
    const schwab = parseCSV(schwabCSV);
    const fidelity = parseCSV(fidelityCSV);

    for (const result of [simple, robinhood, schwab, fidelity]) {
      const trade = findTrade(result.trades, 'AAPL', '2023-06-15');
      expect(trade, `expected AAPL buy in ${JSON.stringify(result.trades)}`).toBeDefined();
      expect(trade!.shares).toBe(10);
      expect(trade!.price).toBe(185);
      expect(trade!.type).toBe('buy');
    }
  });

  it('all formats produce a deposit cash flow on 2023-06-15', () => {
    const simple = parseCSV(simpleCSV);
    const robinhood = parseCSV(robinhoodCSV);
    const schwab = parseCSV(schwabCSV);
    const fidelity = parseCSV(fidelityCSV);

    for (const result of [simple, robinhood, schwab, fidelity]) {
      const deposit = findCashFlow(result.cashFlows, 'deposit', '2023-06-15');
      expect(deposit, `expected deposit in ${JSON.stringify(result.cashFlows)}`).toBeDefined();
    }
  });

  it('Robinhood and Fidelity deposits reflect the explicit deposit amount', () => {
    const robinhood = parseCSV(robinhoodCSV);
    const fidelity = parseCSV(fidelityCSV);

    for (const result of [robinhood, fidelity]) {
      const deposit = findCashFlow(result.cashFlows, 'deposit', '2023-06-15');
      expect(deposit!.amount).toBe(5000);
    }
  });

  it('simple and Schwab deposits equal shares * price (trade value)', () => {
    const simple = parseCSV(simpleCSV);
    const schwab = parseCSV(schwabCSV);

    for (const result of [simple, schwab]) {
      const deposit = findCashFlow(result.cashFlows, 'deposit', '2023-06-15');
      expect(deposit!.amount).toBe(1850); // 10 * 185
    }
  });
});

// ============================================================
// Format routing: minimal CSV is dispatched to the right parser
// ============================================================

describe('format routing', () => {
  it('identifies simple format', () => {
    const csv = `ticker,date,shares
AAPL,2023-01-15,10`;
    expect(parseCSV(csv).format).toBe('simple');
  });

  it('identifies Robinhood format', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2023,01/15/2023,01/18/2023,GOOG,Alphabet,Buy,5,$94.00,($470.00)`;
    expect(parseCSV(csv).format).toBe('robinhood');
  });

  it('identifies Schwab format', () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Stock Plan Activity,MSFT,"Vest",100,$250.00,$0.00,"$25,000.00"`;
    expect(parseCSV(csv).format).toBe('schwab');
  });

  it('identifies Fidelity format', () => {
    const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU BOUGHT APPLE INC,AAPL,,Cash,10,142.50,0,,,"(1,425.00)",01/18/2023`;
    expect(parseCSV(csv).format).toBe('fidelity');
  });
});

// ============================================================
// Error handling
// ============================================================

describe('error handling', () => {
  it('throws on empty input', () => {
    expect(() => parseCSV('')).toThrow();
  });

  it('throws on header-only input', () => {
    expect(() => parseCSV('ticker,date,shares')).toThrow();
  });
});

// ============================================================
// Simple format specifics
// ============================================================

describe('simple format', () => {
  it('defaults type to buy when column missing', () => {
    const csv = `ticker,date,shares
AAPL,2023-01-15,10`;
    expect(parseCSV(csv).trades[0].type).toBe('buy');
  });

  it('parses sell type', () => {
    const csv = `ticker,date,shares,price,type
AAPL,2023-01-15,10,150,sell`;
    expect(parseCSV(csv).trades[0].type).toBe('sell');
  });

  it('uppercases ticker symbols', () => {
    const csv = `ticker,date,shares
aapl,2023-01-15,10`;
    expect(parseCSV(csv).trades[0].ticker).toBe('AAPL');
  });

  it('converts MM/DD/YYYY to YYYY-MM-DD', () => {
    const csv = `ticker,date,shares
AAPL,01/15/2023,10`;
    expect(parseCSV(csv).trades[0].date).toBe('2023-01-15');
  });

  it('synthesizes a deposit for buy trades with a known price', () => {
    const csv = `ticker,date,shares,price
AAPL,2023-01-15,10,142.50`;
    const result = parseCSV(csv);
    expect(result.cashFlows).toHaveLength(1);
    expect(result.cashFlows[0].type).toBe('deposit');
    expect(result.cashFlows[0].amount).toBe(1425); // 10 * 142.50
    expect(result.cashFlows[0].date).toBe('2023-01-15');
  });

  it('does not synthesize a deposit for sell trades', () => {
    const csv = `ticker,date,shares,price,type
AAPL,2023-01-15,10,150,sell`;
    expect(parseCSV(csv).cashFlows).toHaveLength(0);
  });

  it('does not synthesize a deposit when price is missing', () => {
    const csv = `ticker,date,shares
AAPL,2023-01-15,10`;
    expect(parseCSV(csv).cashFlows).toHaveLength(0);
  });

  it('leaves price undefined when column is empty', () => {
    const csv = `ticker,date,shares,price
NVDA,2023-04-05,15,`;
    expect(parseCSV(csv).trades[0].price).toBeUndefined();
  });

  it('skips rows with missing ticker', () => {
    const csv = `ticker,date,shares
,2023-02-20,5`;
    expect(parseCSV(csv).trades).toHaveLength(0);
  });

  it('skips rows with missing date', () => {
    const csv = `ticker,date,shares
GOOG,,8`;
    expect(parseCSV(csv).trades).toHaveLength(0);
  });
});

// ============================================================
// Robinhood format specifics
// ============================================================

describe('Robinhood format', () => {
  it('parses sell transactions', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2023,01/15/2023,01/18/2023,AAPL,Apple Inc,Sell,10,$150.00,"$1,500.00"`;
    expect(parseCSV(csv).trades[0].type).toBe('sell');
  });

  it('parses stock splits as zero-cost buys', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
06/10/2022,06/10/2022,06/10/2022,AMZN,Amazon,SPL,19,$0.00,$0.00`;
    const trade = parseCSV(csv).trades[0];
    expect(trade.type).toBe('buy');
    expect(trade.price).toBe(0);
    expect(trade.shares).toBe(19);
  });

  it('parses ACH deposits as cash flows', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/10/2023,01/10/2023,01/10/2023,,ACH Deposit,ACH,,$0.00,"$1,000.00"`;
    const cf = parseCSV(csv).cashFlows[0];
    expect(cf.type).toBe('deposit');
    expect(cf.amount).toBe(1000);
  });

  it('parses dividends as cash flows with ticker', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
03/15/2023,03/15/2023,03/15/2023,AAPL,Apple Dividend,CDIV,,$0.00,$23.00`;
    const cf = parseCSV(csv).cashFlows[0];
    expect(cf.type).toBe('dividend');
    expect(cf.ticker).toBe('AAPL');
  });

  it('renames FB to META', () => {
    const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2022,01/15/2022,01/18/2022,FB,Facebook Inc,Buy,10,$300.00,"($3,000.00)"`;
    expect(parseCSV(csv).trades[0].ticker).toBe('META');
  });
});

// ============================================================
// Schwab format specifics
// ============================================================

describe('Schwab format', () => {
  it('only parses Stock Plan Activity and Reinvest Shares', () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Stock Plan Activity,MSFT,"Vest",100,$250.00,$0.00,"$25,000.00"
02/20/2023,Reinvest Shares,MSFT,"Reinvest",5,$260.00,$0.00,"$1,300.00"
03/01/2023,Sell,MSFT,"Sell",50,$270.00,$5.00,"$13,495.00"`;
    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(2);
  });

  it('renames FB to META', () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2022,Stock Plan Activity,FB,"Vest",50,$300.00,$0.00,"$15,000.00"`;
    expect(parseCSV(csv).trades[0].ticker).toBe('META');
  });

  it('synthesizes a deposit for each vest with a known price', () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Stock Plan Activity,MSFT,"Vest",100,$250.00,$0.00,"$25,000.00"`;
    const result = parseCSV(csv);
    expect(result.cashFlows).toHaveLength(1);
    expect(result.cashFlows[0].type).toBe('deposit');
    expect(result.cashFlows[0].amount).toBe(25000); // 100 * 250
  });

  it('does not synthesize a deposit when price is missing', () => {
    const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Stock Plan Activity,MSFT,"Vest",100,,$0.00,`;
    const result = parseCSV(csv);
    expect(result.cashFlows).toHaveLength(0);
  });
});

// ============================================================
// Fidelity format specifics
// ============================================================

describe('Fidelity format', () => {
  it('parses sell transactions', () => {
    const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU SOLD APPLE INC,AAPL,,Cash,-10,150.00,0,,,"1,500.00",01/18/2023`;
    const trade = parseCSV(csv).trades[0];
    expect(trade.type).toBe('sell');
    expect(trade.shares).toBe(10);
  });

  it('parses dividend cash flows', () => {
    const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
03/15/2023,DIVIDEND RECEIVED,AAPL,APPLE INC,Cash,,,,,,"23.00",03/15/2023`;
    const cf = parseCSV(csv).cashFlows[0];
    expect(cf.type).toBe('dividend');
    expect(cf.amount).toBe(23);
  });

  it('skips money market funds SPAXX and FDRXX', () => {
    const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU BOUGHT FIDELITY GOV MMF,SPAXX,,Cash,100,1.00,0,,,"(100.00)",01/18/2023
01/15/2023,YOU BOUGHT FIDELITY GOV MMF,FDRXX,,Cash,200,1.00,0,,,"(200.00)",01/18/2023`;
    expect(parseCSV(csv).trades).toHaveLength(0);
  });

  it('parses EFT deposits', () => {
    const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/10/2023,ELECTRONIC FUNDS TRANSFER RECEIVED,,CONTRIBUTION,Cash,,,,,,5000.00,01/10/2023`;
    const cf = parseCSV(csv).cashFlows[0];
    expect(cf.type).toBe('deposit');
    expect(cf.amount).toBe(5000);
  });
});
