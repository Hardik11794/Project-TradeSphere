# TradeSphere

TradeSphere is a trading portfolio dashboard with a holographic sci-fi command-interface aesthetic. It aggregates trading snapshots from Google Sheets CSV feeds and manual entries, then renders portfolio metrics, charts, a raw transaction journal, data source management, and developer logs.

## Run

Run the app through the bundled local server from the project root:

```sh
python3 server.py 8765
```

Open:

```text
http://127.0.0.1:8765/index.html
```

If that port is busy, use another one:

```sh
python3 server.py 8766
```

Do not use `python3 -m http.server`. That static server cannot handle the app's `PUT /api/connections` request and will return `HTTP 501`, breaking source persistence.

## Project Files

| File | Purpose |
| --- | --- |
| `index.html` | UI shell — all sections, modals, and SVG icons |
| `style.css` | Sci-fi design system — Orbitron + Share Tech Mono fonts, neon cyan palette, HUD corner brackets, scanline overlay, animated glow effects |
| `app.js` | Runtime logic — syncing, charting, state, logs, export/import |
| `ticker-symbols.json` | Local ticker metadata for symbol lookup, display names, and PNG icons |
| `Connection.json` | Local source registry written by the server |
| `server.py` | Static file server + `/api/connections` persistence endpoint |

## Connection.json Format

```json
[
  { "Ticker Name": "META", "URL": "https://..." },
  { "Ticker Name": "NVDA", "URL": "https://..." }
]
```

## Design System

The UI uses a sci-fi holographic theme:

- **Fonts** — `Orbitron` for headings and metric values; `Share Tech Mono` for data, labels, table cells, and inputs
- **Palette** — electric cyan `#00e5ff` (primary), neon green `#00ff88` (gains/BUY), hot red `#ff2255` (losses/errors), amber `#ffaa00` (warnings), violet `#8833ff` (special states)
- **Effects** — scanlines overlay, animated scan beam in sidebar and chart area, HUD corner brackets on every card, pulsing neon glow on brand icon and metric values

## Notes

- The transaction journal stays raw — source CSV values are displayed as-is.
- The Portfolio Analytics chart is BUY-only.
- The top-right ticker selector filters the entire dashboard view.
