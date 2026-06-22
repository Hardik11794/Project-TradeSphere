#!/usr/bin/env python3
from __future__ import annotations

import json
import argparse
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
CONNECTION_FILE = ROOT / "Connection.json"


class TradeSphereHandler(SimpleHTTPRequestHandler):
    def _send_json(self, status: int, payload) -> None:
        data = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _read_connections(self):
        if not CONNECTION_FILE.exists():
            return []
        try:
            data = json.loads(CONNECTION_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _write_connections(self, data) -> None:
        tmp_file = CONNECTION_FILE.with_suffix(".json.tmp")
        tmp_file.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp_file.replace(CONNECTION_FILE)

    def _normalize_connections(self, payload):
        connections = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            ticker = str(
                item.get("Ticker Name")
                or item.get("tickerSymbol")
                or item.get("ticker")
                or item.get("name")
                or ""
            ).strip().upper()
            url = str(item.get("URL") or item.get("url") or "").strip()
            if ticker and url:
                connections.append({"Ticker Name": ticker, "URL": url})
        return connections

    def do_OPTIONS(self):
        if urlparse(self.path).path == "/api/connections":
            self.send_response(HTTPStatus.NO_CONTENT)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, PUT, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.end_headers()
            return
        super().do_OPTIONS()

    def do_GET(self):
        if urlparse(self.path).path == "/api/connections":
            self.send_response(HTTPStatus.OK)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            payload = json.dumps(self._read_connections(), indent=2).encode("utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
            return

        return super().do_GET()

    def do_HEAD(self):
        if urlparse(self.path).path == "/api/connections":
            payload = json.dumps(self._read_connections(), indent=2).encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            return

        return super().do_HEAD()

    def do_PUT(self):
        if urlparse(self.path).path != "/api/connections":
            self.send_error(HTTPStatus.NOT_FOUND)
            return

        content_length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(content_length).decode("utf-8") if content_length else "[]"
        try:
            payload = json.loads(raw)
            if not isinstance(payload, list):
                raise ValueError("Connection payload must be a JSON list")
            connections = self._normalize_connections(payload)
            self._write_connections(connections)
        except Exception as exc:
            self._send_json(HTTPStatus.BAD_REQUEST, {"error": str(exc)})
            return

        self._send_json(HTTPStatus.OK, {"ok": True, "count": len(connections)})

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("port", nargs="?", type=int, default=8765)
    args = parser.parse_args()
    host = "127.0.0.1"
    port = args.port
    handler = partial(TradeSphereHandler, directory=str(ROOT))
    server = ThreadingHTTPServer((host, port), handler)
    print(f"TradeSphere server running at http://{host}:{port}/index.html")
    print(f"Connection data: {CONNECTION_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
