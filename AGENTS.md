# TradeSphere Project Guide

This repository is a static browser app for tracking a stock portfolio and trading journal. It has no build step, package manager, backend, or database. Open `index.html` in a browser to run it.

## File Map

- `index.html` defines the whole UI shell: sidebar navigation, dashboard metrics, chart canvas, transaction ledger table, data-source manager, manual snapshot modal, toast container, and script/style includes.
- `style.css` contains the full visual system: dark/light theme variables, responsive layout, cards, tables, forms, data-source cards, modal, toast, and breakpoints.
- `app.js` contains all runtime behavior through class-based modules: state loading/saving, developer logging, CSV parsing, source syncing, portfolio calculations, rendering, filters, sorting, chart creation, import/export, modal handling, and theme switching.

## Runtime Dependencies

- Chart rendering depends on Chart.js loaded from `https://cdn.jsdelivr.net/npm/chart.js` in `index.html`.
- Fonts are loaded from Google Fonts.
- All app state is stored in browser `localStorage`.
- Google Sheets feeds, or any compatible public CSV URL, are fetched directly by the browser. CORS rules therefore matter.

There is no local dependency install command and no automated test runner in the current project.

## Startup Flow

`app.js` starts on `DOMContentLoaded`:

1. `new PortfolioApp().init()` caches DOM nodes and subscribes the log renderer.
2. `StorageService` restores saved data sources and manual snapshots.
3. The saved `theme` is applied to `<html data-theme>`, defaulting to `dark`.
4. Event handlers and global runtime error traps are registered.
5. `syncUi()` computes the ledger, then updates metrics, table, ticker filter, source cards, chart, and logs.
6. If enabled sources exist, `syncAllSources(false)` silently refreshes feeds.

The central refresh path is:

```text
PortfolioApp.syncUi()
  -> PortfolioApp.recalculate()
  -> LedgerEngine.compute()
  -> PortfolioApp.renderAll()
  -> renderMetrics()
  -> renderTable()
  -> populateTickerFilter()
  -> renderSources()
  -> renderChart()
  -> renderLogs()
```

Prefer using this path after data changes so all derived UI stays consistent.

## State Model

Top-level mutable state in `app.js`:

- `sources`: saved CSV data-source definitions.
- `manualSnapshots`: snapshots added by modal or local CSV import.
- `snapshots`: derived master ledger from manual snapshots plus enabled source feeds.
- `portfolioChartInstance`: current Chart.js instance, destroyed and recreated by `renderChart()`.
- `currentChartTab`: either `portfolio` or `prices`.
- `sortColumn` and `sortAscending`: current ledger table sort.
- `STARTING_CASH`: currently `0.00`, used as the running cash baseline.

LocalStorage keys:

- `trading_sources`: persisted `sources`.
- `trading_manual_snapshots`: persisted manual snapshots.
- `trading_snapshots`: persisted derived snapshots, written for convenience but recalculated from source/manual data.
- `trading_dev_logs`: persisted developer diagnostics shown in the Developer Logs tab.
- `theme`: `dark` or `light`.

## Data Shapes

Data source object:

```js
{
  id: "src_...",
  name: "META NASDAQ Feed",
  url: "https://.../pub?output=csv",
  enabled: true,
  status: "pending" | "success" | "error",
  lastSync: "Never" | "localized date/time",
  recordCount: 0,
  errorMessage: "",
  cachedData: "raw CSV text"
}
```

Raw snapshot input:

```js
{
  timestamp: "YYYY-MM-DD HH:MM:SS",
  ticker: "META",
  exchange: "NASDAQ",
  todayPrice: 570.26,
  sharesBought: 1,
  decision: "AUTO" | "BUY" | "NO BUY" | "FIRST SNAPSHOT"
}
```

`calculateLedger()` mutates each snapshot with derived fields:

- `prevPrice`
- `purchaseCost`
- `cashRemaining`
- `totalShares`
- `totalSpent`
- `avgPurchasePrice`
- `portfolioValue`
- `profitLoss`
- `returnPct`

## CSV Expectations

`parseAndExtractCSV(text)` uses a small character-scanner CSV parser that supports quoted fields and escaped quotes. It detects columns by normalized header names rather than exact labels.

Required concepts:

- timestamp column: header includes `time`
- ticker column: header includes `tick`
- price column: header includes `today`, or includes `price` while not including `prev`, `average`, or `cost`
- shares column: header includes `shares`, `bought`, or `qty`

Optional concepts:

- exchange column: header includes `exchang`; defaults to `NASDAQ`
- decision column: header includes `decision`; defaults to `AUTO`

Number parsing removes `$`, `,`, and `%`. Shares are rounded to whole numbers.

## Portfolio Calculation Rules

`calculateLedger()` merges manual snapshots and enabled source rows, sorts everything by ascending timestamp, and processes the timeline in order.

- `AUTO` becomes `BUY` if `sharesBought > 0`.
- `AUTO` becomes `FIRST SNAPSHOT` for a ticker with no previous price.
- Otherwise `AUTO` becomes `NO BUY`.
- Only `BUY` rows change cash, total shares, and total spent.
- Each row stores the previous price for its ticker.
- Portfolio value is `runningCash + current value of all holdings`, using the current row's price for its ticker and the latest known prior price for other tickers.
- Profit/loss and return percentage are currently populated only on `BUY` rows.

Important: `STARTING_CASH` is `0.00`, so buying shares creates negative cash and `returnPct` is forced to `0` to avoid division by zero. If the app should represent a funded account, change this constant and review all metric labels.

## UI Behavior

- Dashboard metrics read raw API values from the most recent `BUY` snapshot when one exists. Do not calculate fallback values for these cards.
- The table supports search by ticker/exchange, decision filtering, ticker filtering, sortable columns, and manual-row deletion.
- The Transaction Log Journal must display API/imported cell values exactly as received. Do not format, round, or calculate fallback values for API-provided columns.
- Feed rows are not deleted from the ledger directly; remove or disable their source instead.
- The Data Sources tab can add, enable, disable, delete, sync one feed, or sync all feeds.
- The Developer Logs tab, located above the theme toggle in the sidebar, shows persisted runtime/API/CSV/storage diagnostics.
- CSV import appends parsed rows to `manualSnapshots`.
- CSV export downloads the derived `snapshots` ledger.
- Theme switching updates `data-theme`, saves `theme`, and redraws the chart.

## Developer Logging

`DevLogger` stores structured diagnostics in `localStorage` and mirrors them to the browser console. Entries include:

- `timestamp`
- `level`: `ERROR`, `WARN`, `INFO`, or `DEBUG`
- `category`: `API`, `CSV`, `RUNTIME`, `STORAGE`, `UI`, or `SYSTEM`
- `message`
- `details`: JSON-safe debugging context

The UI supports filtering by severity/category, clearing logs, and exporting logs as JSON. Source sync failures capture source id/name, URL, fetch URL, HTTP status, content type, duration, and the rendered user-facing error. Global `window.error` and `unhandledrejection` events are also captured.

For Google Sheets feeds, `PortfolioApp.syncSource()` builds multiple fetch candidates. It first tries the saved URL, then a Google `gviz` CSV endpoint when the URL can be recognized, then a public raw CORS fallback for Google Sheets URLs. The Developer Logs details include an `attempts` array so debugging can show which endpoint failed or succeeded.

## Styling Notes

The CSS uses theme variables extensively. When adding UI:

- Prefer existing variables from `:root` and `[data-theme="light"]`.
- Reuse the existing button, card, form, table, badge, modal, and empty-state classes.
- Keep responsive behavior aligned with the existing breakpoints at `1024px`, `900px`, `768px`, and `576px`.

## Known Maintenance Issues

- Some table/source card rendering still uses `innerHTML`. If CSV/source values may come from untrusted users, sanitize text or switch those renderers to DOM text nodes.
- The ledger parser stores raw API cell values under `row.raw`. Treat these as the display source of truth.
- Timestamp sorting depends on strings that `new Date()` can parse. Normalize timestamp input if feeds vary by locale or format.
- `syncAllSources()` calls `syncSource()`, and each `syncSource()` calls `syncUi()`. With many feeds this can render repeatedly.

## Suggested Validation

Because there is no build system, use browser validation plus direct syntax checks:

```sh
node --check app.js
```

Then open `index.html` and test:

1. Add a manual `FIRST SNAPSHOT` row.
2. Add a manual `BUY` row.
3. Filter and sort the ledger.
4. Toggle between chart modes.
5. Import and export CSV.
6. Add a public CSV source and sync it.
7. Add a deliberately bad source URL and confirm the Developer Logs tab shows an API failure with details.
8. Toggle light/dark theme.
