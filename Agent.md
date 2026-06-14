# TradeSphere Agent Handoff

This document is meant for another AI coding agent taking over the project. It explains what the app is, how it works, what must stay stable, and where the important code paths live.

## Project At A Glance

TradeSphere is a trading portfolio dashboard with a backend data source that provides Google Sheet based data. The frontend renders portfolio metrics, a transaction journal, a chart, data sources, and developer logs.

The project has:

- A backend that supplies the Google Sheet data source
- A browser frontend
- No build step
- Browser storage for local app state

## How To Run

This project must be run through a local server.

### Frontend

From the project root:

```sh
python3 -m http.server 8765
```

Then open:

```text
http://127.0.0.1:8765/index.html
```

If port `8765` is already in use, start the server on another free port and use that URL instead.

### Backend

The backend is the source of the Google Sheet data used by the dashboard. Make sure that backend is running and reachable before testing feed sync behavior in the UI.

## Project Root

```text
/Users/hardik/Documents/antigravity/Project TradeSphere
```

## Product Intent

The product is a portfolio and trading journal command center for a user who wants to:

- Add CSV data feeds from Google Sheets or other public CSV sources
- Sync feeds directly in the browser
- Keep a raw transaction log that mirrors the source data exactly
- Review only BUY activity in charting and key portfolio summaries
- Debug feed failures through an in-app developer log panel

The user has repeatedly emphasized these rules:

- Do not recalculate the transaction journal
- Do not rename the source data columns in the journal
- Do not alter raw numeric values in the journal
- Do not add fallback numbers where the CSV is blank
- Preserve layout structure unless a requested UI change requires a specific section to be removed

## File Map

- `index.html` defines the full UI shell: sidebar, dashboard, chart, transaction journal, data sources, logs, modal, and toast.
- `style.css` contains the complete design system, responsive layout, theme overrides, cards, buttons, table, modal, and data source styling.
- `app.js` contains all runtime behavior: storage, logging, CSV parsing, source syncing, journal rendering, metrics, charting, modal actions, theme switching, and export/import.
- `AGENTS.md` is the shorter project guide that was already present.

## How The App Works

Startup flow:

1. `DOMContentLoaded` creates `PortfolioApp`.
2. `PortfolioApp.init()` caches DOM nodes.
3. `StorageService` restores persisted data.
4. The saved theme is applied.
5. Event handlers and global error traps are registered.
6. `syncUi()` recalculates state and renders the dashboard.
7. If any enabled sources exist, the app silently syncs them.

Central refresh path:

```text
PortfolioApp.syncUi()
  -> PortfolioApp.recalculate()
  -> LedgerEngine.compute()
  -> PortfolioApp.renderAll()
  -> renderMetrics()
  -> renderTable()
  -> populateTickerFilter()
  -> renderSources()
  -> renderStatusChips()
  -> renderChart()
  -> renderLogs()
```

If you change anything related to data, use this path so the views stay consistent.

## Core Classes

### `CsvParser`

Parses CSV text with a small scanner that supports quotes and escaped quotes.

Important behavior:

- Keeps raw headers in `rawHeaders`
- Keeps raw display cells in `rawCells`
- Stores a raw object for convenience
- Detects key columns by header names
- Does not format values for display

This class is the source of truth for journal text integrity.

### `LedgerEngine`

Aggregates manual snapshots and synced source feeds into `state.snapshots`.

Important behavior:

- Marks rows with helper flags such as `isBuy`
- Supports metrics, filters, and charting
- Must not overwrite journal display cells
- Must not calculate the journal values shown to the user

### `PortfolioApp`

The main controller for the app.

It handles:

- State loading and persistence
- Rendering all views
- Table filtering and sorting
- Chart switching
- Source management
- Manual snapshot modal
- Developer logs
- CSV export/import

## Data Model

### Source Object

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

### Snapshot Object

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

The important part: `rawHeaders` and `rawCells` are the display source for the Transaction Log Journal.

## Transaction Log Journal Rules

The journal is not a calculator. It is a raw API document viewer.

Must keep:

- API headers exactly as received
- API cell values exactly as received
- API row order unless the user explicitly sorts
- Blank cells as blank
- No app-specific column renames
- No `Actions` column
- No numerical fallback fill

Important examples:

- If the API says `Total Shares = 3`, the UI must show `3`
- If the API has an empty field, the UI must keep it empty
- If the API header says `Average Purchase Price`, that exact header should appear

The journal renderer uses `getJournalHeaders()` and `getRawJournalCell()` for this reason.

## Chart Rules

The Portfolio Analytics chart currently follows these rules:

- It only uses rows where `Decision === BUY`
- It is further scoped by the selected ticker in the header dropdown
- If `All Tickers` is selected, the chart falls back to the first ticker that has BUY data
- It should not show data for NO BUY rows

The chart has two modes:

- `Portfolio Value`
- `Price vs Avg Cost`

## Global Ticker Selector

The top-right dashboard dropdown is the global ticker selector.

Behavior:

- Selecting a ticker should filter the dashboard view to that ticker only
- Metrics should use only BUY rows for that ticker
- The chart should use only BUY rows for that ticker
- The journal should show only rows for that ticker

The ticker selector lives in the dashboard header and uses `id="filter-ticker"`.

## Metrics Rules

Dashboard KPI cards are derived from the latest BUY snapshot for the selected ticker.

Do not:

- Invent numbers
- Backfill missing data
- Recalculate journal values to make the cards look nicer

If no BUY rows exist for the selected ticker, show neutral placeholders rather than calculated values.

## Developer Logs

There is an in-app Developer Logs tab above the theme toggle in the sidebar.

It is used to show:

- Sync failures
- Parsing problems
- Runtime errors
- Unhandled promise rejections
- Storage issues

Log entries contain:

- `timestamp`
- `level`
- `category`
- `message`
- `details`

The logs can be filtered, cleared, and exported.

## Data Sources Tab

The Data Sources tab manages CSV feed definitions.

Current behavior:

- Add source
- Sync all sources
- Sync one source
- Enable or disable a source
- Delete a source

Note:

- The source cards are still rendered in code, but the current UI may intentionally hide the list depending on the latest request.
- Do not break the sync logic even if a visual section is hidden.

## Styling Notes

The app has gone through several visual themes. The current state emphasizes a black-and-gold luxury dashboard style.

Important styling guidance:

- Preserve strong contrast and readable numeric values
- Keep financial data aligned with tabular numerals
- Prefer structured, premium surfaces over generic crypto styling
- Reuse existing classes when possible
- Keep the layout responsive

## Known Code Paths

Useful entry points in `app.js`:

- `PortfolioApp.init()`
- `PortfolioApp.syncUi()`
- `PortfolioApp.renderAll()`
- `PortfolioApp.renderMetrics()`
- `PortfolioApp.renderTable()`
- `PortfolioApp.renderChart()`
- `PortfolioApp.renderSources()`
- `PortfolioApp.renderLogs()`
- `PortfolioApp.populateTickerFilter()`
- `PortfolioApp.getSelectedTickerFilter()`
- `PortfolioApp.exportLedgerToCSV()`
- `PortfolioApp.syncAllSources()`
- `PortfolioApp.syncSource()`

Useful parser / engine paths:

- `CsvParser.parse()`
- `CsvParser.rowToSnapshot()`
- `LedgerEngine.compute()`

## What Not To Break

Please treat these as hard constraints:

- Do not change the raw journal data contract
- Do not sort the journal by default
- Do not introduce recalculation into the journal values
- Do not break import/export
- Do not break theme switching
- Do not break logs
- Do not break data source syncing
- Do not break the chart toggle buttons
- Do not break the selected ticker filter

## Runtime Notes

Chart rendering depends on Chart.js loaded from the CDN in `index.html`.
Fonts are loaded from Google Fonts.
All app state is stored in browser `localStorage`.
Google Sheets feeds are fetched directly by the browser, so CORS matters.

There is no install command and no automated test runner.

## Validation

For a quick sanity check:

```sh
node --check app.js
```

Then open `index.html` and verify:

1. The dashboard loads
2. A ticker can be selected from the top-right dropdown
3. The chart changes to that ticker
4. The journal shows exact API values
5. Blank CSV cells stay blank
6. Logs appear when a source fails

## Recent Project Direction

The recent work on this project has focused on:

- Stronger visual polish
- A premium black-and-gold wealth-management presentation
- A global ticker filter in the dashboard header
- BUY-only analytics charting
- Removing misleading calculated values from the dashboard
- Preserving the raw API truth in the journal

When in doubt, favor raw-data fidelity over clever presentation.
