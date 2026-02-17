import { describe, it, expect, vi } from 'vitest';
import { parseCSV, generateSampleCSV } from '../utils/csvParser';

// Mock the logger
vi.mock('../utils/logger', () => ({
  perf: {
    start: vi.fn(),
    end: vi.fn(),
  },
}));

describe('parseCSV', () => {
  it('throws on empty input', () => {
    expect(() => parseCSV('')).toThrow();
  });

  it('throws on header-only input', () => {
    expect(() => parseCSV('ticker,date,shares')).toThrow();
  });

  describe('simple format', () => {
    it('parses basic CSV with ticker, date, shares, price', () => {
      const csv = `ticker,date,shares,price
AAPL,2023-01-15,10,142.50
GOOGL,2023-02-20,5,94.00`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].ticker).toBe('AAPL');
      expect(result.trades[0].date).toBe('2023-01-15');
      expect(result.trades[0].shares).toBe(10);
      expect(result.trades[0].price).toBe(142.50);
      expect(result.trades[0].type).toBe('buy');
    });

    it('handles missing price (optional)', () => {
      const csv = `ticker,date,shares,price
NVDA,2023-04-05,15,`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].price).toBeUndefined();
    });

    it('handles sell type', () => {
      const csv = `ticker,date,shares,price,type
AAPL,2023-01-15,10,150,sell`;

      const result = parseCSV(csv);
      expect(result.trades[0].type).toBe('sell');
    });

    it('defaults to buy when no type column', () => {
      const csv = `ticker,date,shares
AAPL,2023-01-15,10`;

      const result = parseCSV(csv);
      expect(result.trades[0].type).toBe('buy');
    });

    it('uppercases ticker symbols', () => {
      const csv = `ticker,date,shares
aapl,2023-01-15,10`;

      const result = parseCSV(csv);
      expect(result.trades[0].ticker).toBe('AAPL');
    });

    it('converts MM/DD/YYYY date format', () => {
      const csv = `ticker,date,shares
AAPL,01/15/2023,10`;

      const result = parseCSV(csv);
      expect(result.trades[0].date).toBe('2023-01-15');
    });

    it('skips rows with invalid data', () => {
      const csv = `ticker,date,shares
AAPL,2023-01-15,10
,2023-02-20,5
GOOG,,8`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
    });

    it('returns empty cashFlows for simple format', () => {
      const csv = `ticker,date,shares
AAPL,2023-01-15,10`;

      const result = parseCSV(csv);
      expect(result.cashFlows).toEqual([]);
    });
  });

  describe('Schwab format', () => {
    it('detects and parses Schwab equity vests CSV', () => {
      const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Stock Plan Activity,MSFT,"Vest",100,$250.00,$0.00,"$25,000.00"
02/20/2023,Reinvest Shares,MSFT,"Reinvest",5,$260.00,$0.00,"$1,300.00"
03/01/2023,Sell,MSFT,"Sell",50,$270.00,$5.00,"$13,495.00"`;

      const result = parseCSV(csv);
      // Only Stock Plan Activity and Reinvest Shares are parsed
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].ticker).toBe('MSFT');
      expect(result.trades[0].shares).toBe(100);
      expect(result.trades[0].price).toBe(250);
      expect(result.trades[0].type).toBe('buy');
    });

    it('skips non-vest actions', () => {
      const csv = `Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount
01/15/2023,Sell,MSFT,"Market Sell",50,$270.00,$5.00,"$13,495.00"`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(0);
    });
  });

  describe('Robinhood format', () => {
    it('detects and parses Robinhood CSV', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2023,01/15/2023,01/18/2023,AAPL,Apple Inc,Buy,10,$142.50,"($1,425.00)"
02/20/2023,02/20/2023,02/23/2023,GOOG,Alphabet Inc,Buy,5,$94.00,($470.00)`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(2);
      expect(result.trades[0].ticker).toBe('AAPL');
      expect(result.trades[0].shares).toBe(10);
      expect(result.trades[0].type).toBe('buy');
    });

    it('handles sell transactions', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2023,01/15/2023,01/18/2023,AAPL,Apple Inc,Sell,10,$150.00,"$1,500.00"`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].type).toBe('sell');
    });

    it('handles stock splits (SPL)', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
06/10/2022,06/10/2022,06/10/2022,AMZN,Amazon,SPL,19,$0.00,$0.00`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].type).toBe('buy');
      expect(result.trades[0].price).toBe(0);
      expect(result.trades[0].shares).toBe(19);
    });

    it('parses cash flow transactions (ACH deposits)', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/10/2023,01/10/2023,01/10/2023,,ACH Deposit,ACH,,$0.00,"$1,000.00"`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(0);
      expect(result.cashFlows).toHaveLength(1);
      expect(result.cashFlows[0].type).toBe('deposit');
      expect(result.cashFlows[0].amount).toBe(1000);
    });

    it('parses dividend cash flows', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
03/15/2023,03/15/2023,03/15/2023,AAPL,Apple Dividend,CDIV,,$0.00,$23.00`;

      const result = parseCSV(csv);
      expect(result.cashFlows).toHaveLength(1);
      expect(result.cashFlows[0].type).toBe('dividend');
      expect(result.cashFlows[0].ticker).toBe('AAPL');
    });

    it('renames FB to META', () => {
      const csv = `Activity Date,Process Date,Settle Date,Instrument,Description,Trans Code,Quantity,Price,Amount
01/15/2022,01/15/2022,01/18/2022,FB,Facebook Inc,Buy,10,$300.00,"($3,000.00)"`;

      const result = parseCSV(csv);
      expect(result.trades[0].ticker).toBe('META');
    });
  });

  describe('Fidelity format', () => {
    it('detects and parses Fidelity CSV', () => {
      const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU BOUGHT APPLE INC,AAPL,,Cash,10,142.50,0,,,"(1,425.00)",01/18/2023`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].ticker).toBe('AAPL');
      expect(result.trades[0].shares).toBe(10);
      expect(result.trades[0].type).toBe('buy');
    });

    it('handles sell transactions', () => {
      const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU SOLD APPLE INC,AAPL,,Cash,-10,150.00,0,,,"1,500.00",01/18/2023`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].type).toBe('sell');
      expect(result.trades[0].shares).toBe(10); // abs value
    });

    it('handles dividend cash flows', () => {
      const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
03/15/2023,DIVIDEND RECEIVED,AAPL,APPLE INC,Cash,,,,,,"23.00",03/15/2023`;

      const result = parseCSV(csv);
      expect(result.cashFlows).toHaveLength(1);
      expect(result.cashFlows[0].type).toBe('dividend');
      expect(result.cashFlows[0].amount).toBe(23);
    });

    it('skips money market funds (SPAXX, FDRXX)', () => {
      const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/15/2023,YOU BOUGHT FIDELITY GOV MMF,SPAXX,,Cash,100,1.00,0,,,"(100.00)",01/18/2023
01/15/2023,YOU BOUGHT FIDELITY GOV MMF,FDRXX,,Cash,200,1.00,0,,,"(200.00)",01/18/2023
01/15/2023,YOU BOUGHT APPLE INC,AAPL,,Cash,10,142.50,0,,,"(1,425.00)",01/18/2023`;

      const result = parseCSV(csv);
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0].ticker).toBe('AAPL');
    });

    it('handles EFT deposit cash flows', () => {
      const csv = `Run Date,Action,Symbol,Description,Type,Quantity,Price ($),Commission ($),Fees ($),Accrued Interest ($),Amount ($),Settlement Date
01/10/2023,ELECTRONIC FUNDS TRANSFER RECEIVED,,CONTRIBUTION,Cash,,,,,,5000.00,01/10/2023`;

      const result = parseCSV(csv);
      expect(result.cashFlows).toHaveLength(1);
      expect(result.cashFlows[0].type).toBe('deposit');
      expect(result.cashFlows[0].amount).toBe(5000);
    });
  });
});

describe('generateSampleCSV', () => {
  it('returns a valid CSV string', () => {
    const csv = generateSampleCSV();
    const result = parseCSV(csv);
    expect(result.trades.length).toBeGreaterThan(0);
  });

  it('includes expected tickers', () => {
    const csv = generateSampleCSV();
    const result = parseCSV(csv);
    const tickers = result.trades.map(t => t.ticker);
    expect(tickers).toContain('AAPL');
    expect(tickers).toContain('GOOGL');
  });
});
