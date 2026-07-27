// Headless counterfactual runner: parses a Fidelity CSV with the real parser,
// fetches live Yahoo data (mirroring api/stock/[ticker].ts), and runs the same
// calculation code the app uses. Run: npx vite-node scripts/simulate.ts <csv>
import { readFileSync } from 'node:fs';
import YahooFinance from 'yahoo-finance2';
import { parseCSV } from '../src/utils/csvParser';
import {
  calculateStockBreakdown,
  calculateSummary,
  calculatePortfolioTimeSeries,
  getDateRange,
} from '../src/utils/calculations';
import { mergeWithHistoricalSplits } from '../src/config/historicalSplits';
import type { StockPrice } from '../src/types/StockPrice';
import type { StockSplit } from '../src/types/StockSplit';

const yf = new YahooFinance();

async function fetchOne(ticker: string, start: string, end: string) {
  try {
    const r = await yf.chart(ticker, { period1: start, period2: end, interval: '1d', events: 'div,splits' });
    const prices: StockPrice[] = r.quotes
      .map((q: any) => ({
        date: q.date.toISOString().split('T')[0],
        price: Math.round((q.adjclose ?? q.close ?? 0) * 100) / 100,
        high: Math.round((q.high ?? 0) * 100) / 100,
      }))
      .filter((p) => p.price > 0);
    const splits: StockSplit[] = (r.events?.splits ?? []).map((s: any) => ({
      date: s.date.toISOString().split('T')[0],
      ticker,
      splitFactor: s.numerator / s.denominator,
    }));
    return { prices, splits };
  } catch (e) {
    console.error(`  ! fetch failed for ${ticker}: ${String(e).slice(0, 80)}`);
    return { prices: [] as StockPrice[], splits: [] as StockSplit[] };
  }
}

const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
  const csvPath = process.argv[2];
  const csv = readFileSync(csvPath, 'utf8');
  const { trades, cashFlows } = parseCSV(csv);
  const tickers = [...new Set(trades.map((t) => t.ticker))];
  const { startDate, endDate } = getDateRange(trades);
  console.log(`Parsed ${trades.length} trades, ${cashFlows.length} cash flows across ${tickers.length} tickers`);
  console.log(`Range ${startDate} -> ${endDate}\n`);

  const stockPrices: Record<string, StockPrice[]> = {};
  const stockSplits: Record<string, StockSplit[]> = {};
  const results = await Promise.all(tickers.map((t) => fetchOne(t, startDate, endDate)));
  tickers.forEach((t, i) => {
    stockPrices[t] = results[i].prices;
    stockSplits[t] = mergeWithHistoricalSplits(t, results[i].splits);
  });
  const spy = await fetchOne('SPY', startDate, endDate);
  const spyPrices = spy.prices;

  const tradesWithPrices = trades.map((tr) => {
    if (tr.price !== undefined) return tr;
    const tp = stockPrices[tr.ticker] || [];
    let high = 0;
    for (let i = tp.length - 1; i >= 0; i--) {
      if (tp[i].date <= tr.date) { high = tp[i].high ?? tp[i].price; break; }
    }
    return { ...tr, price: high };
  });

  const breakdown = calculateStockBreakdown(tradesWithPrices, stockPrices, spyPrices);
  const summary = calculateSummary(breakdown, cashFlows, tradesWithPrices);
  const timeSeries = calculatePortfolioTimeSeries(tradesWithPrices, stockPrices, spyPrices, cashFlows, stockSplits);

  // Net share count per ticker straight from parsed trades (buys - sells)
  const netShares: Record<string, number> = {};
  for (const t of tradesWithPrices) {
    netShares[t.ticker] = (netShares[t.ticker] ?? 0) + (t.type === 'sell' ? -t.shares : t.shares);
  }

  console.log('=== SUMMARY ===');
  console.log(`Total cost basis:         ${money(summary.totalCostBasis)}`);
  console.log(`Total contributions:      ${money(summary.totalContributions)}`);
  console.log(`Net contributions:        ${money(summary.netContributions)}`);
  console.log(`Portfolio value:          ${money(summary.totalPortfolioValue)}  (${summary.portfolioReturn}%)`);
  console.log(`If invested in SPY:       ${money(summary.totalCounterfactualValue)}  (${summary.counterfactualReturn}%)`);
  console.log(`Difference (you vs SPY):  ${money(summary.totalDifference)}`);
  console.log(`Best:  ${summary.bestPerformer?.ticker} (${money(summary.bestPerformer?.difference ?? 0)})`);
  console.log(`Worst: ${summary.worstPerformer?.ticker} (${money(summary.worstPerformer?.difference ?? 0)})\n`);

  console.log('=== PER-STOCK BREAKDOWN (held positions) ===');
  console.log(
    'ticker'.padEnd(8),
    'shares'.padStart(11),
    'curPrice'.padStart(10),
    'curValue'.padStart(14),
    'costBasis'.padStart(13),
    'gain'.padStart(13),
    'vsSPYdiff'.padStart(14),
  );
  for (const b of breakdown) {
    const netInvestment = b.currentValue - b.gain;
    console.log(
      b.ticker.padEnd(8),
      String(b.shares).padStart(11),
      money(b.currentPrice).padStart(10),
      money(b.currentValue).padStart(14),
      money(netInvestment).padStart(13),
      money(b.gain).padStart(13),
      money(b.difference).padStart(14),
    );
  }

  console.log('\n=== COST BASIS: net-proceeds (current) vs average-cost (proposed) ===');
  const byTicker: Record<string, typeof tradesWithPrices> = {};
  for (const t of tradesWithPrices) (byTicker[t.ticker] ??= []).push(t);
  for (const [tk, ts] of Object.entries(byTicker)) {
    const sorted = [...ts].sort((a, b) => a.date.localeCompare(b.date));
    let shares = 0, avgCost = 0, netProceeds = 0, sells = 0;
    for (const t of sorted) {
      const amt = t.shares * (t.price ?? 0);
      if (t.type === 'sell') {
        avgCost -= shares > 0 ? (t.shares / shares) * avgCost : 0;
        shares -= t.shares;
        netProceeds -= amt;
        sells++;
      } else {
        avgCost += amt;
        shares += t.shares;
        netProceeds += amt;
      }
    }
    console.log(
      `${tk.padEnd(7)} sells=${String(sells).padStart(2)}  netProceeds=${money(Math.max(0, netProceeds)).padStart(13)}  avgCost=${money(Math.max(0, avgCost)).padStart(13)}`,
    );
  }

  console.log('\n=== NVDA & HEIA share-count trace (buy/sell lots) ===');
  for (const tk of ['NVDA', 'HEI-A']) {
    console.log(`\n${tk}: net held = ${netShares[tk]}`);
    for (const t of tradesWithPrices.filter((x) => x.ticker === tk)) {
      console.log(`  ${t.date}  ${t.type.padEnd(4)} ${String(t.shares).padStart(10)}  @ ${money(t.price ?? 0)}`);
    }
  }

  console.log(`\nTime series points: ${timeSeries.length} (first ${timeSeries[0]?.date}, last ${timeSeries.at(-1)?.date})`);
}

main();
