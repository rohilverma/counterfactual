import type { PortfolioData } from '../types/PortfolioData';
import { perf } from './logger';
import { parseCSVLine } from './parsers/shared';
import { isRobinhoodFormat, parseRobinhoodCSV } from './parsers/robinhood';
import { isFidelityFormat, parseFidelityCSV } from './parsers/fidelity';
import { isSchwabFormat, parseSchwabCSV } from './parsers/schwab';
import { parseSimpleCSV } from './parsers/simple';

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
