# TradeSphere Project Guide

This repository is a static browser app for tracking a stock portfolio and trading journal. It has no build step, package manager, backend, or database. Open `index.html` in a browser to run it.

Current working directory:

```text
/Users/hardik/Documents/antigravity/Project TradeSphere
```

## File Map

- `index.html` defines the whole UI shell: sidebar navigation, dashboard metrics, chart canvas, transaction ledger table, data-source manager, manual snapshot modal, toast container, and script/style includes.
- `style.css` contains the full visual system: dark/light theme variables, responsive layout, cards, tables, forms, data-source cards, modal, toast, and breakpoints.
- `app.js` contains all runtime behavior through class-based modules: state loading/saving, developer logging, CSV parsing, source syncing, raw journal rendering, filters, sorting, chart creation, import/export, modal handling, and theme switching.

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
5. `syncUi()` rebuilds app state, then updates metrics, the raw API-shaped journal table, ticker filter, source cards, chart, and logs.
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

Prefer using this path after data changes so all views stay consistent.

## State Model

Top-level mutable state in `app.js`:

- `sources`: saved CSV data-source definitions.
- `manualSnapshots`: snapshots added by modal or local CSV import.
- `snapshots`: aggregated rows from manual snapshots plus enabled source feeds. Rows preserve raw API headers and raw API cells.
- `portfolioChartInstance`: current Chart.js instance, destroyed and recreated by `renderChart()`.
- `currentChartTab`: either `portfolio` or `prices`.
- `sortColumn` and `sortAscending`: current ledger table sort.
- `sortColumn` can be `null` for API order, or `raw:<index>` when the user explicitly sorts a raw API column.

LocalStorage keys:

- `trading_sources`: persisted `sources`.
- `trading_manual_snapshots`: persisted manual snapshots.
- `trading_snapshots`: persisted aggregated snapshots, written for convenience and rebuilt from source/manual data.
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

Parsed snapshot shape:

```js
{
  timestamp: "YYYY-MM-DD HH:MM:SS",
  ticker: "META",
  exchange: "NASDAQ",
  todayPrice: 570.26,
  sharesBought: 1,
  decision: "BUY" | "NO BUY" | "FIRST SNAPSHOT" | "AUTO",
  rawHeaders: ["Timestamp", "Ticker", "..."],
  rawCells: ["2026-06-13 08:41:05", "META", "..."],
  raw: {
    timestamp: "2026-06-13 08:41:05",
    ticker: "META",
    exchange: "NASDAQ",
    todayPrice: "$566.98",
    decision: "BUY",
    totalShares: "3"
  }
}
```

Important display rule: `rawHeaders` and `rawCells` are the source of truth for the Transaction Log Journal. Do not replace them with app-specific column names or calculated values.

## CSV Expectations

`CsvParser.parse(text)` uses a small character-scanner CSV parser that supports quoted fields and escaped quotes. It keeps the original header names and original cell values for display, while also detecting a few columns for filtering/searching.

Required concepts:

- timestamp column: header includes `time`
- ticker column: header includes `tick`
- price column: header includes `today`, or includes `price` while not including `prev`, `average`, or `cost`
- shares column: header includes `shares`, `bought`, or `qty`

Optional concepts:

- exchange column: header includes `exchang`; defaults to `NASDAQ`
- decision column: header includes `decision`; defaults to `AUTO`

Number parsing is only for internal filtering/chart support. It must not be used to alter displayed Transaction Log Journal values.

## Journal Display Rules

The Transaction Log Journal is an API document viewer, not a calculator.

- Headers must come from the API CSV header row exactly.
- Row values must come from the API CSV cells exactly.
- Do not show app-specific replacement labels such as `Qty`, `Cash Left`, `Holdings`, `Avg Price`, or `Port. Value`.
- Do not add an `Actions` column to feed rows in the Transaction Log Journal.
- Do not calculate, format, round, uppercase, or fallback-fill journal cell values.
- Do not sort rows by default. Preserve API order unless the user explicitly clicks a column header.
- If the API says `Total Shares` is `3`, the UI must show `3`.

`LedgerEngine.compute()` may mark rows with helper fields such as `isBuy` for filtering/metrics, but it must not calculate or overwrite journal display cells.

## UI Behavior

- Dashboard metrics read raw API values from the most recent `BUY` snapshot when one exists. Do not calculate fallback values for these cards.
- The Transaction Log Journal supports search by ticker/exchange, decision filtering, ticker filtering, and explicit user-triggered sorting.
- The Transaction Log Journal must display API/imported headers and cell values exactly as received. Do not format, round, rename, calculate, or fallback-fill API columns.
- Feed rows are not deleted from the ledger directly; remove or disable their source instead.
- The Data Sources tab can add, enable, disable, delete, sync one feed, or sync all feeds.
- The Developer Logs tab, located above the theme toggle in the sidebar, shows persisted runtime/API/CSV/storage diagnostics.
- CSV import appends parsed rows to `manualSnapshots`.
- CSV export downloads the same raw API-shaped headers and cells used by the Transaction Log Journal.
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

- Some source card rendering still uses `innerHTML`. If source labels/URLs may come from untrusted users, sanitize text or switch those renderers to DOM text nodes.
- The parser stores raw API headers under `row.rawHeaders` and raw API cells under `row.rawCells`. Treat these as the display source of truth.
- Timestamp parsing is used only for helper behavior. Do not let timestamp parsing reorder the journal by default.
- `syncAllSources()` calls `syncSource()`, and each `syncSource()` calls `syncUi()`. With many feeds this can render repeatedly.

## Suggested Validation

Because there is no build system, use browser validation plus direct syntax checks:

```sh
node --check app.js
```

Then open `index.html` and test:

1. Add a public CSV source and sync it.
2. Confirm Transaction Log Journal headers exactly match the API headers.
3. Confirm a row with API `Total Shares` value `3` shows `3`, not a locally accumulated value.
4. Confirm blank API cells remain blank.
5. Filter and explicitly sort the journal.
6. Import and export CSV.
7. Add a deliberately bad source URL and confirm the Developer Logs tab shows an API failure with details.
8. Toggle between chart modes.
9. Toggle light/dark theme.
