# TradeSphere Agent Guide

This file is for the next coding agent. It is a fast map of the project, how it works, and the rules that matter most when editing it.

## What This Project Is

TradeSphere is a browser-based trading portfolio dashboard. It aggregates trading snapshots from:

- Manual snapshot entries added in the UI
- CSV feeds from published Google Sheets links
- Imported CSV files from the browser

The app then renders:

- Portfolio metrics
- A portfolio / price chart
- A raw transaction journal
- Data source management cards
- Developer logs

## Project Layout

- `index.html` - the complete UI shell and all visible sections
- `style.css` - the design system, layout, responsive behavior, and component styling
- `app.js` - all runtime behavior, state management, CSV parsing, syncing, rendering, logs, and export/import
- `Backend Script/AppScript.rtf` - Google Apps Script source for a separate Google Sheets backtesting / tracking workflow
- `Backend Script/META - Back testing.xlsx` - spreadsheet reference material for the Apps Script workflow
- `ticker-symbols.json` - local fallback lookup used when a ticker symbol is not provided directly
- `Connection.json` - local source registry written by the app/server
- `server.py` - local static server with a JSON write endpoint for source persistence
- `README.md` - short run instructions and a few behavioral notes

## How To Run

Run the frontend from the project root with a local static server:

```sh
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/index.html
```

For feed syncing tests, the Google Sheet source must be reachable and published as CSV.

## Core Architecture

The app is a single-page vanilla JavaScript application.

Main flow:

```text
DOMContentLoaded
  -> new PortfolioApp()
  -> init()
  -> cache elements
  -> load state from localStorage
  -> apply theme
  -> bind events
  -> register error handlers
  -> syncUi()
```

Central refresh path:

```text
syncUi()
  -> recalculate()
  -> LedgerEngine.compute()
  -> renderAll()
```

`renderAll()` updates:

- Metrics
- Journal table
- Ticker filter dropdown
- Source cards
- Sync status chip
- Chart
- Developer logs

## Important Classes

### `StorageService`

Handles `localStorage` persistence for:

- `trading_sources`
- `trading_manual_snapshots`
- `trading_snapshots`
- theme selection

It also wraps storage errors so the app can log them.

### `DevLogger`

In-app logging system with:

- `INFO`
- `WARN`
- `ERROR`
- `DEBUG`

Logs are persisted in `localStorage`, mirrored to the console, and shown in the Developer Logs tab.

### `CsvParser`

Parses CSV text and preserves raw source data.

Key behavior:

- Detects required columns such as Timestamp, Ticker, Price, and Shares
- Keeps original headers in `rawHeaders`
- Keeps original row cells in `rawCells`
- Stores source-specific raw fields in `raw`
- Cleans numeric values only for calculation and charting

### `LedgerEngine`

Aggregates manual snapshots and enabled synced sources into the final snapshot list.

Important:

- It must not rewrite journal source values
- It may compute helper fields like `isBuy` and normalized numeric values
- It skips sources that are disabled or do not yet have cached CSV data

### `PortfolioApp`

Owns the UI and behavior:

- State persistence
- Feed syncing
- Manual snapshot modal
- Table filtering and sorting
- Ticker filter behavior
- Chart rendering
- Developer logs
- CSV import/export
- Theme toggle

## UI Sections

The HTML contains three main tabs:

- Dashboard
- Data Sources
- Developer Logs

The dashboard includes:

- Portfolio metrics
- Chart controls
- Transaction Log Journal
- Global ticker filter

The Data Sources tab includes:

- Form to add a Google Sheets CSV feed
- Per-source enable/disable toggle
- Per-source manual sync
- Per-source delete
- Sync all / enable all / disable all controls

The Developer Logs tab includes:

- Summary counters
- Level filter
- Category filter
- Clear / export actions

## Data Flow

### Source feeds

`addSource()` normalizes Google Sheets URLs when possible and stores a source object with:

- `id`
- `name`
- `url`
- `enabled`
- `status`
- `lastSync`
- `recordCount`
- `errorMessage`
- `cachedData`

`syncSource()` tries several Google Sheets CSV endpoints:

- direct URL
- published CSV gviz endpoint
- export endpoint
- gviz endpoint
- CORS-readable fallback through AllOrigins for Google Sheets URLs

Source cards and log messages prefer `tickerSymbol` when it is available. If a source is saved with a company name instead of a symbol, the app falls back to `ticker-symbols.json` before using the raw input.

`Connection.json` is the source registry for ticker symbols and URLs. The app loads it on startup when available and writes back to it through the local server whenever sources are added, edited, imported, or deleted. Keep its persisted shape simple:

```json
[
  { "Ticker Name": "META", "URL": "https://..." },
  { "Ticker Name": "NVDA", "URL": "https://..." }
]
```

### Manual snapshots

The modal adds a snapshot directly into `manualSnapshots`.

### CSV import

The import flow also adds parsed rows into `manualSnapshots`.

### Aggregation

`LedgerEngine.compute()` combines:

- `manualSnapshots`
- parsed rows from enabled source feeds

The result becomes `state.snapshots`.

## Journal Rules

The Transaction Log Journal is intentionally a raw viewer.

Keep these rules stable:

- Show the source headers as-is
- Show the source cell values as-is
- Preserve row order unless the user explicitly sorts
- Do not rename columns for display
- Do not invent fallback values for blank cells
- Keep `rawHeaders` and `rawCells` as the source of truth

The journal table is rebuilt dynamically from the source headers found in the loaded data.

## Metric Rules

Dashboard metrics are based on rows that are marked as buy rows.

The UI shows:

- Portfolio value
- Buying power / cash
- Asset market value
- Cost basis / average purchase price

If no qualifying buy rows exist, the dashboard shows dashes instead of fake values.

## Chart Rules

The chart is BUY-only.

It must:

- Use only rows where `isBuy` is true
- Respect the global ticker filter
- Fall back to a valid ticker when `All Tickers` is selected
- Never plot `NO BUY` rows

There are two chart modes:

- Portfolio value over time
- Price vs average cost

## Sorting And Filtering

Filters:

- Search by ticker or exchange
- Decision filter
- Global ticker selector

Sorting:

- Column headers are sortable
- Raw journal headers are also sortable by source column index

## Developer Logs

Logs are important for debugging feed sync and parsing issues.

The log view shows:

- Total events
- Error count
- Latest event time
- Filtered timeline entries

Typical categories:

- `API`
- `CSV`
- `RUNTIME`
- `STORAGE`
- `UI`
- `SYSTEM`

## Backend Script Notes

`Backend Script/AppScript.rtf` is a Google Apps Script program for a separate Google Sheets workflow.

It appears to:

- Set up strategy settings
- Pull live prices with `GOOGLEFINANCE`
- Append strategy log rows
- Generate a summary sheet
- Optionally send email

This is not executed by the browser app, but it documents the intended backtesting / tracking logic.

## Safe Edit Zones

Usually safe to change:

- Styling in `style.css`
- Layout and text in `index.html`
- Non-breaking rendering improvements in `app.js`
- Developer-log messaging
- Readme wording

Be careful when changing:

- CSV parsing logic
- Journal rendering
- Raw row preservation
- BUY-only chart behavior
- Source sync fallbacks
- `localStorage` keys

## Invariants To Preserve

- The journal must stay raw and faithful to source data
- The chart must remain BUY-only
- The ticker selector must keep filtering dashboard views
- Feed sync must keep fallback attempts and logging
- Theme preference should persist across reloads

## Validation Checklist

Before handing off changes, verify:

1. The page loads through a local server
2. The dashboard renders without console errors
3. Manual snapshot creation works
4. CSV import works
5. Source feeds sync or fail with useful logs
6. Journal values stay raw
7. BUY-only chart behavior is unchanged
8. Developer logs update correctly

Quick syntax check:

```sh
node --check app.js
```

## What To Look At First When Debugging

If something is broken, start here:

1. `app.js` event binding and `syncUi()`
2. `CsvParser.parse()` and `LedgerEngine.compute()`
3. `renderTable()`, `renderMetrics()`, and `renderChart()`
4. `syncSource()` and `fetchCsvWithFallbacks()`
5. Developer logs for runtime or fetch errors
