# TradeSphere

TradeSphere is a trading portfolio dashboard with a backend data source that supplies Google Sheet based data. The app shows portfolio metrics, a chart, a raw transaction journal, data sources, and developer logs.

## Run

Run the frontend through a local server from the project root:

```sh
python3 -m http.server 8765
```

Open:

```text
http://127.0.0.1:8765/index.html
```

Make sure the backend data source is also running and reachable when testing feed sync.

## Project Files

- `index.html` - UI shell
- `style.css` - visual styling and layout
- `app.js` - runtime logic, syncing, charting, logs, and export/import
- `ticker-symbols.json` - local fallback lookup for source/company names to ticker symbols

## Notes

- The transaction journal must stay raw and match the source CSV values exactly.
- The Portfolio Analytics chart is BUY-only.
- The top-right ticker selector filters the dashboard.
