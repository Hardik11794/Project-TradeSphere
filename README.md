# TradeSphere

TradeSphere is a trading portfolio dashboard with a backend data source that supplies Google Sheet based data. The app shows portfolio metrics, a chart, a raw transaction journal, data sources, and developer logs.

## Run

Run the app through the bundled local server from the project root:

```sh
python3 server.py 8765
```

Open:

```text
http://127.0.0.1:8765/index.html
```

If that port is busy, use another one like `python3 server.py 8766` and open the matching URL.

Do not use `python3 -m http.server` when you want source changes to persist to `Connection.json`. That static server cannot handle the app's `PUT /api/connections` request and will return `HTTP 501`.

`Connection.json` is now the local source registry. Add/edit/delete source records in the UI and the server writes them back to that file.

The file stores connections as:

```json
[
  {
    "Ticker Name": "META",
    "URL": "https://..."
  },
  {
    "Ticker Name": "NVDA",
    "URL": "https://..."
  }
]
```

## Project Files

- `index.html` - UI shell
- `style.css` - visual styling and layout
- `app.js` - runtime logic, syncing, charting, logs, and export/import
- `ticker-symbols.json` - local ticker metadata used for symbol lookup, display names, and web-loaded PNG icons
- `Connection.json` - local source registry used by the dashboard and server
- `server.py` - local static server plus `/api/connections` persistence endpoint

## Notes

- The transaction journal must stay raw and match the source CSV values exactly.
- The Portfolio Analytics chart is BUY-only.
- The top-right ticker selector filters the dashboard.
