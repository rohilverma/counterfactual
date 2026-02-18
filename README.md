# Counterfactual

A portfolio analysis tool that compares your actual stock trades against a counterfactual: what if you had invested the same money in the S&P 500 instead?

Upload a CSV from Robinhood, Fidelity, or Schwab (or enter trades manually) and instantly see how your picks performed relative to passive index investing.

## Architecture

### Tech Stack

- **React 19** + **TypeScript 5.9** — UI and type safety
- **Vite 7** — dev server and build
- **Tailwind CSS 4** — styling
- **Recharts 3** — interactive charts
- **Yahoo Finance 2** — historical price and split data
- **Vitest** — unit tests

### Project Structure

```
src/
├── components/
│   ├── Dashboard.tsx          # Main orchestrator — state, layout, input mode switching
│   ├── FileUpload.tsx         # CSV drag-and-drop upload
│   ├── ManualEntry.tsx        # Manual trade entry form
│   ├── CsvBuilder.tsx         # Guided CSV builder
│   ├── ComparisonChart.tsx    # Portfolio vs SPY value over time
│   ├── ReturnChart.tsx        # Dollar-weighted return chart
│   ├── StockBreakdown.tsx     # Per-stock performance table
│   └── SummaryStats.tsx       # Key metrics cards
│
├── hooks/
│   └── useStockData.ts        # Data fetching and calculation orchestration
│
├── utils/
│   ├── calculations.ts        # Core math — time series, breakdown, summary
│   ├── csvParser.ts           # CSV parsing with format auto-detection
│   ├── csvMerger.ts           # CSV merging utilities
│   ├── stockApi.ts            # Yahoo Finance API layer with caching
│   └── logger.ts              # Browser-side performance logging
│
├── config/
│   └── historicalSplits.ts    # Manual split data for delisted/problematic tickers
│
├── types/
│   └── index.ts               # Central type definitions
│
└── __tests__/
    ├── calculations.test.ts   # Portfolio calculation tests
    └── csvParser.test.ts      # CSV parsing tests
```

### Data Flow

```
User Input (CSV upload / manual entry / CSV builder)
  │
  ▼
CSV Parsing — auto-detects format (Robinhood, Fidelity, Schwab, simple)
  │           extracts Trade[] and CashFlow[]
  ▼
Stock Data Fetching — historical prices + splits for each ticker and SPY
  │                    un-adjusts Yahoo's split-adjusted prices
  ▼
Core Calculations (calculations.ts)
  ├── calculatePortfolioTimeSeries  → daily portfolio vs SPY values and returns
  ├── calculateStockBreakdown       → per-stock gain vs SPY gain
  └── calculateSummary              → aggregate metrics, best/worst performers
  │
  ▼
Visualization — ComparisonChart, ReturnChart, StockBreakdown, SummaryStats
```

### Key Types

```typescript
Trade        { ticker, date, shares, price, type: 'buy' | 'sell' }
CashFlow     { date, amount, type: 'deposit' | 'dividend' | ... }

// Output
PortfolioDataPoint {
  date, portfolioValue, counterfactualValue,
  totalDeposits, portfolioReturn, counterfactualReturn
}
StockBreakdownData {
  ticker, shares, currentValue, spyCurrentValue,
  gain, spyGain, difference
}
```

### Notable Design Decisions

**Split adjustment** — Yahoo Finance returns split-adjusted prices. The app un-adjusts them using split history so raw CSV share counts stay correct. Manual overrides in `historicalSplits.ts` handle delisted tickers like TVIX.

**Counterfactual calculation** — When cash flows are available, each deposit is converted to SPY shares at the deposit-date price for an accurate comparison. Falls back to trade-cost-based calculation otherwise.

**State management** — Pure React (`useState` + custom hooks). No external state library. `useStockData` encapsulates all fetching and calculation logic.

**Error resilience** — `Promise.allSettled` for multi-ticker fetches so one failure doesn't block the rest.
