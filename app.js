class StorageService {
    constructor(prefix = "trading_", logger = null) {
        this.prefix = prefix;
        this.logger = logger;
    }

    get(key, fallback) {
        const raw = localStorage.getItem(this.prefix + key);
        if (raw === null) return fallback;
        try {
            return JSON.parse(raw);
        } catch (error) {
            this.logger?.warn("STORAGE", `Failed to parse localStorage key "${this.prefix + key}"`, { key: this.prefix + key, error: this.errorDetails(error) });
            return fallback;
        }
    }

    set(key, value) {
        try {
            localStorage.setItem(this.prefix + key, JSON.stringify(value));
        } catch (error) {
            this.logger?.error("STORAGE", `Failed to persist localStorage key "${this.prefix + key}"`, { key: this.prefix + key, error: this.errorDetails(error) });
        }
    }

    getTheme() {
        return localStorage.getItem("theme") || "dark";
    }

    setTheme(theme) {
        localStorage.setItem("theme", theme);
    }

    errorDetails(error) {
        if (!(error instanceof Error)) return { message: String(error) };
        return { name: error.name, message: error.message, stack: error.stack };
    }
}

class DevLogger {
    constructor(storageKey = "trading_dev_logs", limit = 300) {
        this.storageKey = storageKey;
        this.limit = limit;
        this.listeners = new Set();
        this.entries = this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            console.warn("Failed to load developer logs", error);
            return [];
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getEntries() {
        return [...this.entries].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }

    info(category, message, details = {}) {
        return this.log("INFO", category, message, details);
    }

    warn(category, message, details = {}) {
        return this.log("WARN", category, message, details);
    }

    error(category, message, details = {}) {
        return this.log("ERROR", category, message, details);
    }

    debug(category, message, details = {}) {
        return this.log("DEBUG", category, message, details);
    }

    log(level, category, message, details = {}) {
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`,
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            details: this.normalizeDetails(details)
        };

        this.entries.unshift(entry);
        this.entries = this.entries.slice(0, this.limit);
        this.persist();
        this.notify();
        this.mirrorToConsole(entry);
        return entry;
    }

    clear() {
        this.entries = [];
        this.persist();
        this.notify();
    }

    persist() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.entries));
        } catch (error) {
            console.warn("Failed to persist developer logs", error);
        }
    }

    notify() {
        this.listeners.forEach((listener) => listener(this.getEntries()));
    }

    normalizeDetails(details) {
        if (details instanceof Error) return this.errorDetails(details);
        try {
            return JSON.parse(JSON.stringify(details, (_key, value) => {
                if (value instanceof Error) return this.errorDetails(value);
                if (typeof value === "function") return "[Function]";
                return value;
            }));
        } catch {
            return { value: String(details) };
        }
    }

    errorDetails(error) {
        return {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...Object.fromEntries(Object.entries(error).filter(([_key, value]) => typeof value !== "function"))
        };
    }

    mirrorToConsole(entry) {
        const method = entry.level === "ERROR" ? "error" : entry.level === "WARN" ? "warn" : "log";
        console[method](`[${entry.level}] ${entry.category}: ${entry.message}`, entry.details);
    }
}

class CsvParser {
    static parse(text) {
        const rows = CsvParser.tokenize(text);
        const validRows = rows.filter((row) => row.length && row.some((cell) => cell.trim().length > 0));
        if (validRows.length < 2) throw new Error("CSV file is empty or missing headers");

        const rawHeaders = validRows[0].map((h) => String(h || "").trim());
        const headers = rawHeaders.map((h) => CsvParser.cleanHeader(h));
        const idx = CsvParser.findColumnIndexes(headers);

        if (idx.timestamp === -1 || idx.ticker === -1 || idx.price === -1 || idx.shares === -1) {
            throw new Error("Required columns missing: Timestamp, Ticker, Price, Shares");
        }

        const results = [];
        for (let i = 1; i < validRows.length; i++) {
            const cells = validRows[i];
            const item = CsvParser.rowToSnapshot(cells, idx, rawHeaders);
            if (item) results.push(item);
        }
        return results;
    }

    static tokenize(text) {
        const rows = [];
        let row = [];
        let cell = "";
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const next = text[i + 1];

            if (char === '"') {
                if (inQuotes && next === '"') {
                    cell += '"';
                    i++;
                } else {
                    inQuotes = !inQuotes;
                }
                continue;
            }

            if (char === "," && !inQuotes) {
                row.push(cell);
                cell = "";
                continue;
            }

            if ((char === "\n" || char === "\r") && !inQuotes) {
                if (char === "\r" && next === "\n") i++;
                row.push(cell);
                rows.push(row);
                row = [];
                cell = "";
                continue;
            }

            cell += char;
        }

        if (cell.length || row.length) {
            row.push(cell);
            rows.push(row);
        }
        return rows;
    }

    static cleanHeader(value) {
        return String(value || "")
            .toLowerCase()
            .replace(/[\r\n]+/g, " ")
            .replace(/\s+/g, " ")
            .replace(/[^a-z0-9% ]/g, "")
            .trim();
    }

    static findColumnIndexes(headers) {
        const idx = {
            timestamp: -1,
            ticker: -1,
            exchange: -1,
            price: -1,
            prevPrice: -1,
            shares: -1,
            decision: -1,
            purchaseCost: -1,
            cashRemaining: -1,
            totalShares: -1,
            totalSpent: -1,
            avgPurchasePrice: -1,
            portfolioValue: -1,
            profitLoss: -1,
            returnPct: -1
        };
        headers.forEach((h, index) => {
            if (h.includes("time")) idx.timestamp = index;
            else if (h.includes("tick")) idx.ticker = index;
            else if (h.includes("exchang")) idx.exchange = index;
            else if (h.includes("previous") || h.includes("prev")) idx.prevPrice = index;
            else if (h.includes("today") || (h.includes("price") && !h.includes("prev") && !h.includes("average") && !h.includes("cost"))) idx.price = index;
            else if (h.includes("decision")) idx.decision = index;
            else if ((h.includes("average") || h.includes("avg")) && h.includes("purchase")) idx.avgPurchasePrice = index;
            else if (h.includes("purchase") && h.includes("cost")) idx.purchaseCost = index;
            else if (h.includes("cash") && h.includes("remaining")) idx.cashRemaining = index;
            else if (h.includes("total") && h.includes("share")) idx.totalShares = index;
            else if (h.includes("total") && h.includes("spent")) idx.totalSpent = index;
            else if (h.includes("portfolio") && h.includes("value")) idx.portfolioValue = index;
            else if ((h.includes("profit") || h.includes("loss")) && !h.includes("return")) idx.profitLoss = index;
            else if (h.includes("return")) idx.returnPct = index;
            else if (h.includes("shares") || h.includes("bought") || h.includes("qty")) idx.shares = index;
        });
        return idx;
    }

    static rowToSnapshot(cells, idx, rawHeaders = []) {
        if (cells.length <= Math.max(idx.timestamp, idx.ticker, idx.price, idx.shares)) return null;
        const timestamp = String(cells[idx.timestamp] || "").trim();
        const tickerRaw = String(cells[idx.ticker] || "").trim();
        const exchangeRaw = idx.exchange !== -1 && cells[idx.exchange] ? String(cells[idx.exchange]).trim() : "NASDAQ";
        const todayPriceRaw = String(cells[idx.price] || "").trim();
        const sharesBoughtRaw = String(cells[idx.shares] || "").trim();
        const decisionRaw = idx.decision !== -1 && cells[idx.decision] ? String(cells[idx.decision]).trim() : "";
        const ticker = tickerRaw.toUpperCase();
        const exchange = exchangeRaw.toUpperCase();
        const todayPrice = CsvParser.cleanNumber(cells[idx.price]);
        const sharesBought = CsvParser.cleanNumber(cells[idx.shares]);
        const decision = decisionRaw ? decisionRaw.toUpperCase() : "AUTO";

        if (!timestamp || !ticker) return null;
        return {
            timestamp,
            ticker,
            exchange,
            todayPrice,
            sharesBought,
            decision,
            rawHeaders,
            rawCells: CsvParser.alignCellsToHeaders(cells, rawHeaders.length),
            raw: {
                timestamp,
                ticker: tickerRaw,
                exchange: exchangeRaw,
                todayPrice: todayPriceRaw,
                sharesBought: sharesBoughtRaw,
                decision: decisionRaw || "AUTO",
                prevPrice: CsvParser.rawCell(cells, idx.prevPrice),
                purchaseCost: CsvParser.rawCell(cells, idx.purchaseCost),
                cashRemaining: CsvParser.rawCell(cells, idx.cashRemaining),
                totalShares: CsvParser.rawCell(cells, idx.totalShares),
                totalSpent: CsvParser.rawCell(cells, idx.totalSpent),
                avgPurchasePrice: CsvParser.rawCell(cells, idx.avgPurchasePrice),
                portfolioValue: CsvParser.rawCell(cells, idx.portfolioValue),
                profitLoss: CsvParser.rawCell(cells, idx.profitLoss),
                returnPct: CsvParser.rawCell(cells, idx.returnPct)
            }
        };
    }

    static rawCell(cells, index) {
        return index !== -1 && cells[index] !== undefined ? String(cells[index]).trim() : undefined;
    }

    static alignCellsToHeaders(cells, headerCount) {
        return Array.from({ length: headerCount }, (_value, index) => String(cells[index] ?? "").trim());
    }

    static cleanNumber(value) {
        if (value === undefined || value === null || value === "") return 0;
        const num = parseFloat(String(value).replace(/[\$,%]/g, "").trim());
        return Number.isFinite(num) ? num : 0;
    }
}

class LedgerEngine {
    constructor(startingCash = 0, logger = null) {
        this.startingCash = startingCash;
        this.logger = logger;
    }

    compute(manualSnapshots, sources) {
        const aggregated = [...manualSnapshots];
        for (const source of sources) {
            if (!source.enabled || !source.cachedData) continue;
            try {
                aggregated.push(...CsvParser.parse(source.cachedData));
            } catch (error) {
                console.error(`Failed to aggregate source "${source.name}":`, error);
                this.logger?.error("CSV", `Cached data failed to parse for source "${source.name}"`, {
                    sourceId: source.id,
                    sourceName: source.name,
                    rowBytes: source.cachedData.length,
                    error
                });
            }
        }

        for (const row of aggregated) {
            const decision = this.normalizeDecision(row.decision);
            row.calculatedDecision = decision;
            row.isBuy = decision === "BUY";
            row.prevPrice = CsvParser.cleanNumber(row.raw?.prevPrice);
            row.purchaseCost = CsvParser.cleanNumber(row.raw?.purchaseCost);
            row.cashRemaining = CsvParser.cleanNumber(row.raw?.cashRemaining);
            row.totalShares = CsvParser.cleanNumber(row.raw?.totalShares);
            row.totalSpent = CsvParser.cleanNumber(row.raw?.totalSpent);
            row.avgPurchasePrice = CsvParser.cleanNumber(row.raw?.avgPurchasePrice);
            row.portfolioValue = CsvParser.cleanNumber(row.raw?.portfolioValue);
            row.profitLoss = CsvParser.cleanNumber(row.raw?.profitLoss);
            row.returnPct = CsvParser.cleanNumber(row.raw?.returnPct);
        }

        return aggregated;
    }

    normalizeDecision(decision) {
        return String(decision || "").trim().toUpperCase();
    }
}

class PortfolioApp {
    constructor() {
        this.logger = new DevLogger();
        this.storage = new StorageService("trading_", this.logger);
        this.ledgerEngine = new LedgerEngine(0, this.logger);
        this.state = {
            sources: [],
            manualSnapshots: [],
            snapshots: [],
            portfolioChartInstance: null,
            currentChartTab: "portfolio",
            sortColumn: null,
            sortAscending: true
        };
        this.cache = {};
    }

    init() {
        this.cacheElements();
        this.logger.subscribe(() => this.renderLogs());
        this.loadState();
        this.applyTheme(this.storage.getTheme(), false);
        this.bindEvents();
        this.registerGlobalErrorHandlers();
        this.syncUi();
        this.logger.info("SYSTEM", "Application initialized", {
            sources: this.state.sources.length,
            manualSnapshots: this.state.manualSnapshots.length,
            userAgent: navigator.userAgent
        });

        const activeSources = this.state.sources.filter((s) => s.enabled);
        if (activeSources.length > 0) this.syncAllSources(false);
    }

    cacheElements() {
        const ids = [
            "nav-dashboard", "nav-sources", "nav-ledger", "nav-logs", "tab-dashboard", "tab-sources", "tab-logs",
            "theme-toggle", "btn-reset", "btn-export", "csv-file", "btn-chart-portfolio",
            "btn-chart-prices", "search-input", "filter-decision", "filter-ticker",
            "btn-add-row", "modal-snapshot", "modal-close", "modal-cancel", "form-add-snapshot",
            "btn-sync-all", "btn-enable-all", "btn-disable-all", "form-add-source",
            "input-source-name", "input-source-url", "input-source-enabled", "toast",
            "ledger-body", "table-empty-state", "sources-grid", "sources-empty-state",
            "portfolioChart", "metric-portfolio-val", "metric-pl-container", "trend-icon-pl",
            "metric-pl-val", "metric-pl-pct", "metric-cash",
            "metric-avg-price", "metric-total-spent", "log-level-filter",
            "log-category-filter", "btn-clear-logs", "btn-export-logs", "logs-list",
            "logs-empty-state", "log-total-count", "log-error-summary", "log-latest-time",
            "log-error-count", "status-last-sync"
        ];
        ids.forEach((id) => (this.cache[id] = document.getElementById(id)));
    }

    loadState() {
        this.state.sources = this.storage.get("sources", []);
        this.state.manualSnapshots = this.storage.get("manual_snapshots", []);
    }

    persistState() {
        this.storage.set("sources", this.state.sources);
        this.storage.set("manual_snapshots", this.state.manualSnapshots);
        this.storage.set("snapshots", this.state.snapshots);
    }

    syncUi() {
        this.recalculate();
        this.renderAll();
    }

    recalculate() {
        this.state.snapshots = this.ledgerEngine.compute(this.state.manualSnapshots, this.state.sources);
        this.persistState();
    }

    renderAll() {
        this.renderMetrics();
        this.renderTable();
        this.populateTickerFilter();
        this.renderSources();
        this.renderStatusChips();
        this.renderChart();
        this.renderLogs();
    }

    bindEvents() {
        this.cache["nav-dashboard"].addEventListener("click", (e) => { e.preventDefault(); this.showTab("dashboard"); });
        this.cache["nav-sources"].addEventListener("click", (e) => { e.preventDefault(); this.showTab("sources"); });
        this.cache["nav-ledger"].addEventListener("click", (e) => { e.preventDefault(); this.showTab("dashboard", true); });
        this.cache["nav-logs"].addEventListener("click", (e) => { e.preventDefault(); this.showTab("logs"); });

        this.cache["btn-chart-portfolio"].addEventListener("click", () => { this.state.currentChartTab = "portfolio"; this.updateChartToggle(); this.renderChart(); });
        this.cache["btn-chart-prices"].addEventListener("click", () => { this.state.currentChartTab = "prices"; this.updateChartToggle(); this.renderChart(); });

        this.cache["search-input"].addEventListener("input", () => this.renderTable());
        this.cache["filter-decision"].addEventListener("change", () => this.renderTable());
        this.cache["filter-ticker"].addEventListener("change", () => {
            this.renderMetrics();
            this.renderTable();
            this.renderChart();
        });

        document.querySelectorAll(".sortable").forEach((header) => {
            header.addEventListener("click", () => this.sortByHeader(header.getAttribute("data-sort")));
        });

        this.cache["btn-add-row"].addEventListener("click", () => this.openSnapshotModal());
        this.cache["modal-close"].addEventListener("click", () => this.hideModal());
        this.cache["modal-cancel"].addEventListener("click", () => this.hideModal());
        this.cache["modal-snapshot"].addEventListener("click", (e) => { if (e.target === this.cache["modal-snapshot"]) this.hideModal(); });

        this.cache["form-add-snapshot"].addEventListener("submit", (e) => this.addManualSnapshot(e));
        this.cache["theme-toggle"].addEventListener("click", () => this.toggleTheme());

        this.cache["btn-reset"].addEventListener("click", () => this.syncAllSources(true));
        this.cache["btn-export"].addEventListener("click", () => this.exportLedgerToCSV());
        this.cache["csv-file"].addEventListener("change", (e) => this.importCsv(e));

        this.cache["form-add-source"].addEventListener("submit", (e) => this.addSourceFromForm(e));
        this.cache["btn-sync-all"].addEventListener("click", () => this.syncAllSources(true));
        this.cache["btn-enable-all"].addEventListener("click", () => this.setAllSourcesEnabled(true));
        this.cache["btn-disable-all"].addEventListener("click", () => this.setAllSourcesEnabled(false));

        this.cache["log-level-filter"].addEventListener("change", () => this.renderLogs());
        this.cache["log-category-filter"].addEventListener("change", () => this.renderLogs());
        this.cache["btn-clear-logs"].addEventListener("click", () => this.clearLogs());
        this.cache["btn-export-logs"].addEventListener("click", () => this.exportLogs());
    }

    registerGlobalErrorHandlers() {
        window.addEventListener("error", (event) => {
            this.logger.error("RUNTIME", event.message || "Unhandled runtime error", {
                filename: event.filename,
                line: event.lineno,
                column: event.colno,
                error: event.error
            });
        });

        window.addEventListener("unhandledrejection", (event) => {
            this.logger.error("RUNTIME", "Unhandled promise rejection", {
                reason: event.reason instanceof Error ? event.reason : String(event.reason)
            });
        });
    }

    showTab(tabName, scrollLedger = false) {
        const dashboard = this.cache["tab-dashboard"];
        const sources = this.cache["tab-sources"];
        const logs = this.cache["tab-logs"];
        const navDashboard = this.cache["nav-dashboard"];
        const navSources = this.cache["nav-sources"];
        const navLogs = this.cache["nav-logs"];

        const showDashboard = tabName === "dashboard";
        const showSources = tabName === "sources";
        const showLogs = tabName === "logs";
        dashboard.classList.toggle("hidden", !showDashboard);
        sources.classList.toggle("hidden", !showSources);
        logs.classList.toggle("hidden", !showLogs);
        navDashboard.classList.toggle("active", showDashboard);
        navSources.classList.toggle("active", showSources);
        navLogs.classList.toggle("active", showLogs);

        if (showDashboard) {
            this.renderChart();
            if (scrollLedger) document.getElementById("ledger-section").scrollIntoView({ behavior: "smooth", block: "start" });
        }

        if (showLogs) this.renderLogs();
    }

    updateChartToggle() {
        this.cache["btn-chart-portfolio"].classList.toggle("active", this.state.currentChartTab === "portfolio");
        this.cache["btn-chart-prices"].classList.toggle("active", this.state.currentChartTab === "prices");
    }

    sortByHeader(column) {
        if (this.state.sortColumn === column) this.state.sortAscending = !this.state.sortAscending;
        else {
            this.state.sortColumn = column;
            this.state.sortAscending = true;
        }
        document.querySelectorAll(".sortable").forEach((h) => h.classList.remove("sort-asc", "sort-desc"));
        const activeHeader = document.querySelector(`.sortable[data-sort="${column}"]`);
        if (activeHeader) activeHeader.classList.add(this.state.sortAscending ? "sort-asc" : "sort-desc");
        this.renderTable();
    }

    openSnapshotModal() {
        const now = new Date();
        const formatted = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        document.getElementById("input-timestamp").value = formatted;
        this.cache["modal-snapshot"].classList.remove("hidden");
    }

    hideModal() {
        this.cache["modal-snapshot"].classList.add("hidden");
    }

    addManualSnapshot(event) {
        event.preventDefault();
        const snapshot = {
            timestamp: document.getElementById("input-timestamp").value.trim(),
            ticker: document.getElementById("input-ticker").value.toUpperCase().trim(),
            exchange: document.getElementById("input-exchange").value.toUpperCase().trim(),
            todayPrice: parseFloat(document.getElementById("input-price").value),
            sharesBought: parseInt(document.getElementById("input-shares").value, 10),
            decision: document.getElementById("input-decision").value,
            rawHeaders: this.defaultJournalHeaders(),
            rawCells: [
                document.getElementById("input-timestamp").value.trim(),
                document.getElementById("input-ticker").value.trim(),
                document.getElementById("input-exchange").value.trim(),
                document.getElementById("input-price").value,
                "",
                document.getElementById("input-decision").value,
                document.getElementById("input-shares").value,
                "",
                "",
                "",
                "",
                "",
                "",
                "",
                ""
            ],
            raw: {
                timestamp: document.getElementById("input-timestamp").value.trim(),
                ticker: document.getElementById("input-ticker").value.trim(),
                exchange: document.getElementById("input-exchange").value.trim(),
                todayPrice: document.getElementById("input-price").value,
                sharesBought: document.getElementById("input-shares").value,
                decision: document.getElementById("input-decision").value
            }
        };

        if (!snapshot.ticker || !snapshot.exchange || !Number.isFinite(snapshot.todayPrice) || snapshot.todayPrice <= 0 || !Number.isFinite(snapshot.sharesBought) || snapshot.sharesBought < 0) {
            this.logger.warn("UI", "Manual snapshot validation failed", { snapshot });
            this.showToast("Please provide valid form inputs", "error");
            return;
        }

        this.state.manualSnapshots.push(snapshot);
        this.cache["form-add-snapshot"].reset();
        this.hideModal();
        this.syncUi();
        this.logger.info("UI", "Manual snapshot added", {
            ticker: snapshot.ticker,
            exchange: snapshot.exchange,
            timestamp: snapshot.timestamp,
            sharesBought: snapshot.sharesBought
        });
        this.showToast("Snapshot added successfully!", "success");
    }

    toggleTheme() {
        const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
        this.applyTheme(next, true);
    }

    applyTheme(theme, toast = false) {
        document.documentElement.setAttribute("data-theme", theme);
        this.storage.setTheme(theme);
        this.renderChart();
        if (toast) this.showToast(`Theme switched to ${theme} mode`, "success");
    }

    importCsv(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const parsed = CsvParser.parse(String(evt.target.result || ""));
                this.state.manualSnapshots.push(...parsed);
                this.syncUi();
                this.logger.info("CSV", "Manual CSV import succeeded", {
                    fileName: file.name,
                    fileSize: file.size,
                    recordsImported: parsed.length
                });
                this.showToast(`Imported ${parsed.length} manual records!`, "success");
            } catch (error) {
                console.error(error);
                this.logger.error("CSV", "Manual CSV import failed", {
                    fileName: file.name,
                    fileSize: file.size,
                    error
                });
                this.showToast(`Error parsing CSV: ${error.message}`, "error");
            }
        };
        reader.readAsText(file);
        event.target.value = "";
    }

    addSourceFromForm(event) {
        event.preventDefault();
        const name = document.getElementById("input-source-name").value.trim();
        const url = document.getElementById("input-source-url").value.trim();
        const enabled = document.getElementById("input-source-enabled").checked;
        if (!name || !url) return;
        this.addSource(name, url, enabled);
        event.target.reset();
        document.getElementById("input-source-enabled").checked = true;
    }

    addSource(name, url, enabled) {
        const normalizedUrl = this.normalizeSourceUrl(url);
        const source = {
            id: `src_${Date.now()}`,
            name,
            url: normalizedUrl,
            enabled,
            status: "pending",
            lastSync: "Never",
            recordCount: 0,
            errorMessage: "",
            cachedData: ""
        };
        this.state.sources.push(source);
        this.persistState();
        this.renderSources();
        this.logger.info("API", "Data source added", {
            sourceId: source.id,
            sourceName: source.name,
            originalUrl: url,
            normalizedUrl,
            enabled
        });
        if (enabled) this.syncSource(source, true);
    }

    normalizeSourceUrl(url) {
        const trimmed = String(url || "").trim();
        const publishedMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
        if (publishedMatch) return trimmed;

        const sheetsMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!sheetsMatch) return trimmed;

        const sheetId = sheetsMatch[1];
        const gidMatch = trimmed.match(/[?&]gid=(\d+)/);
        const gid = gidMatch ? gidMatch[1] : "0";
        const normalized = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
        if (normalized !== trimmed) {
            this.logger.debug("API", "Normalized Google Sheets URL to CSV export endpoint", {
                inputUrl: trimmed,
                normalizedUrl: normalized,
                gid
            });
        }
        return normalized;
    }

    setAllSourcesEnabled(enabled) {
        if (this.state.sources.length === 0) return;
        this.state.sources.forEach((src) => { src.enabled = enabled; });
        this.persistState();
        this.syncUi();
        this.logger.info("API", enabled ? "All data sources enabled" : "All data sources disabled", {
            sourceCount: this.state.sources.length
        });
        if (enabled) this.syncAllSources(true);
        else this.showToast("All data sources disabled", "success");
    }

    async syncSource(source, showToasts = false) {
        if (!source || !source.url) return;
        const startedAt = performance.now();
        let fetchUrl = "";
        const attempts = [];
        source.status = "pending";
        this.renderSources();
        this.logger.info("API", `Source sync started for "${source.name}"`, {
            sourceId: source.id,
            sourceName: source.name,
            url: source.url,
            candidates: this.buildSourceFetchCandidates(source.url).map((candidate) => candidate.label)
        });
        if (showToasts) this.showToast(`Syncing "${source.name}"...`, "info");

        try {
            const result = await this.fetchCsvWithFallbacks(source);
            fetchUrl = result.fetchUrl;
            attempts.push(...result.attempts);
            const { csvText, response, contentType, candidate } = result;
            const parsedRows = CsvParser.parse(csvText);

            source.cachedData = csvText;
            source.status = "success";
            source.recordCount = parsedRows.length;
            source.lastSync = new Date().toLocaleString();
            source.errorMessage = "";
            this.logger.info("API", `Source sync succeeded for "${source.name}"`, {
                sourceId: source.id,
                sourceName: source.name,
                status: response.status,
                contentType,
                candidate: candidate.label,
                recordsParsed: parsedRows.length,
                responseBytes: csvText.length,
                durationMs: Math.round(performance.now() - startedAt),
                finalUrl: response.url || fetchUrl,
                attempts
            });
            if (showToasts) this.showToast(`"${source.name}" synced successfully!`, "success");
        } catch (error) {
            console.error(`Sync error on ${source.name}:`, error);
            source.status = "error";
            source.errorMessage = this.formatSyncError(error);
            this.logger.error("API", `Source sync failed for "${source.name}"`, {
                sourceId: source.id,
                sourceName: source.name,
                url: source.url,
                fetchUrl,
                durationMs: Math.round(performance.now() - startedAt),
                error,
                attempts,
                renderedMessage: source.errorMessage
            });
            if (showToasts) this.showToast(`Sync failed on "${source.name}"`, "error");
        }

        this.persistState();
        this.syncUi();
    }

    async fetchCsvWithFallbacks(source) {
        const candidates = this.buildSourceFetchCandidates(source.url);
        const attempts = [];
        let lastError = null;

        for (const candidate of candidates) {
            const fetchUrl = this.addCacheBuster(candidate.url);
            const startedAt = performance.now();
            try {
                const response = await fetch(fetchUrl);
                const contentType = response.headers.get("content-type") || "unknown";
                if (!response.ok) {
                    const error = new Error(this.describeHttpError(response.status));
                    error.status = response.status;
                    error.statusText = response.statusText;
                    error.contentType = contentType;
                    throw error;
                }

                const csvText = await response.text();
                if (!csvText || !csvText.trim()) {
                    throw new Error("The source returned an empty response.");
                }
                if (!this.looksLikeCsv(csvText)) {
                    const error = new Error("The source did not return CSV text. Check that the sheet is published and accessible.");
                    error.contentType = contentType;
                    error.preview = csvText.slice(0, 240);
                    throw error;
                }

                attempts.push({
                    label: candidate.label,
                    url: candidate.url,
                    fetchUrl,
                    ok: true,
                    status: response.status,
                    contentType,
                    bytes: csvText.length,
                    durationMs: Math.round(performance.now() - startedAt)
                });

                return { csvText, response, contentType, candidate, fetchUrl, attempts };
            } catch (error) {
                lastError = error;
                attempts.push({
                    label: candidate.label,
                    url: candidate.url,
                    fetchUrl,
                    ok: false,
                    durationMs: Math.round(performance.now() - startedAt),
                    error: this.logger.errorDetails(error instanceof Error ? error : new Error(String(error)))
                });
            }
        }

        const finalError = lastError instanceof Error ? lastError : new Error("All source fetch attempts failed.");
        finalError.attempts = attempts;
        throw finalError;
    }

    buildSourceFetchCandidates(url) {
        const trimmed = String(url || "").trim();
        const candidates = [{ label: "direct", url: trimmed }];
        const gid = this.extractQueryParam(trimmed, "gid") || "0";
        const publishedMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
        const editableMatch = trimmed.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);

        if (publishedMatch) {
            const pubId = publishedMatch[1];
            candidates.push({
                label: "google-published-gviz",
                url: `https://docs.google.com/spreadsheets/d/e/${pubId}/gviz/tq?tqx=out:csv&gid=${gid}`
            });
        } else if (editableMatch) {
            const sheetId = editableMatch[1];
            candidates.push({
                label: "google-export",
                url: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`
            });
            candidates.push({
                label: "google-gviz",
                url: `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&gid=${gid}`
            });
        }

        const unique = [];
        const seen = new Set();
        for (const candidate of candidates) {
            if (!candidate.url || seen.has(candidate.url)) continue;
            seen.add(candidate.url);
            unique.push(candidate);
        }

        if (/^https:\/\/docs\.google\.com\//.test(trimmed)) {
            unique.push({
                label: "cors-raw-fallback",
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent(trimmed)}`
            });
        }

        return unique;
    }

    addCacheBuster(url) {
        return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
    }

    extractQueryParam(url, key) {
        try {
            return new URL(url).searchParams.get(key);
        } catch {
            const match = String(url || "").match(new RegExp(`[?&]${key}=([^&]+)`));
            return match ? decodeURIComponent(match[1]) : null;
        }
    }

    async syncAllSources(showToasts = true) {
        const active = this.state.sources.filter((s) => s.enabled);
        if (active.length === 0) {
            this.logger.warn("API", "Sync all skipped because no active feeds are enabled", {
                sourceCount: this.state.sources.length
            });
            if (showToasts) this.showToast("No active data feeds to sync", "error");
            return;
        }
        this.logger.info("API", "Sync all sources started", {
            activeSourceCount: active.length,
            sourceNames: active.map((source) => source.name)
        });
        if (showToasts) this.showToast(`Syncing ${active.length} active feeds...`, "info");
        await Promise.all(active.map((src) => this.syncSource(src, false)));
        if (showToasts) {
            const errors = active.filter((s) => s.status === "error").length;
            this.showToast(errors > 0 ? `Sync completed with ${errors} error(s)` : "All data sources synced successfully!", errors > 0 ? "error" : "success");
        }
        this.logger.info("API", "Sync all sources finished", {
            activeSourceCount: active.length,
            errorCount: active.filter((s) => s.status === "error").length,
            successCount: active.filter((s) => s.status === "success").length
        });
    }

    looksLikeCsv(text) {
        const firstLine = String(text || "").split(/\r?\n/)[0].trim();
        return firstLine.includes(",") || firstLine.includes(";") || firstLine.includes("\t");
    }

    describeHttpError(status) {
        if (status === 403) return "Access denied by the source. The sheet may not be published or CORS is blocking the request.";
        if (status === 404) return "Source not found. Double-check the published CSV URL.";
        if (status === 429) return "The source is rate-limiting requests. Try again in a moment.";
        return `HTTP error! status: ${status}`;
    }

    formatSyncError(error) {
        const message = error instanceof Error ? error.message : String(error || "Unknown error");
        if (/Failed to fetch|NetworkError|CORS|Load failed/i.test(message)) {
            return "Browser could not load the source directly. The app tried alternate Google Sheets endpoints and a CORS-readable fallback; check Developer Logs for each attempt.";
        }
        return message;
    }

    renderMetrics() {
        const s = this.state.snapshots;
        const selectedTicker = this.getSelectedTickerFilter();
        const buyRows = s.filter((row) => row.isBuy && (selectedTicker === "ALL" || row.ticker.toUpperCase() === selectedTicker));
        if (buyRows.length === 0) {
            this.setText("metric-portfolio-val", "—");
            this.cache["metric-pl-container"].className = "metric-change neutral";
            this.setText("trend-icon-pl", "▬");
            this.setText("metric-pl-val", "—");
            this.setText("metric-pl-pct", "");
            this.setText("metric-cash", "—");
            this.setText("metric-avg-price", "—");
            this.setText("metric-total-spent", "Total Spent: —");
            return;
        }

        const latest = buyRows[buyRows.length - 1];
        const display = this.getDisplayRow(latest);
        const profitLoss = CsvParser.cleanNumber(display.profitLoss);

        this.setText("metric-portfolio-val", display.portfolioValue || "—");
        const pl = profitLoss;
        this.cache["metric-pl-container"].className = `metric-change ${pl > 0.005 ? "positive" : pl < -0.005 ? "negative" : "neutral"}`;
        this.setText("trend-icon-pl", pl > 0.005 ? "▲" : pl < -0.005 ? "▼" : "▬");
        this.setText("metric-pl-val", display.profitLoss || "—");
        this.setText("metric-pl-pct", display.returnPct ? `(${display.returnPct})` : "");

        this.setText("metric-cash", display.cashRemaining || "—");
        this.setText("metric-avg-price", display.avgPurchasePrice || "—");
        this.setText("metric-total-spent", `Total Spent: ${display.totalSpent || "—"}`);
    }

    renderTable() {
        const tbody = this.cache["ledger-body"];
        const empty = this.cache["table-empty-state"];
        tbody.innerHTML = "";

        const search = this.cache["search-input"].value.toLowerCase().trim();
        const decisionFilter = this.cache["filter-decision"].value;
        const tickerFilter = this.getSelectedTickerFilter();

        let filtered = this.state.snapshots.filter((row) => {
            const matchesSearch = row.ticker.toLowerCase().includes(search) || row.exchange.toLowerCase().includes(search);
            const matchesDecision = decisionFilter === "ALL" || row.calculatedDecision === decisionFilter;
            const matchesTicker = tickerFilter === "ALL" || row.ticker.toUpperCase() === tickerFilter;
            return matchesSearch && matchesDecision && matchesTicker;
        });

        if (this.state.sortColumn) {
            filtered = filtered.slice().sort((a, b) => this.compareRows(a, b));
        }

        if (filtered.length === 0) {
            this.renderJournalHeaders(this.getJournalHeaders(this.state.snapshots));
            empty.classList.remove("hidden");
            return;
        }
        empty.classList.add("hidden");
        const headers = this.getJournalHeaders(filtered);
        this.renderJournalHeaders(headers);

        const fragment = document.createDocumentFragment();
        for (const row of filtered) {
            const tr = document.createElement("tr");
            headers.forEach((header, index) => {
                const td = document.createElement("td");
                const value = this.getRawJournalCell(row, index);
                td.textContent = value;
                this.decorateJournalCell(td, header, value);
                tr.appendChild(td);
            });
            fragment.appendChild(tr);
        }

        tbody.appendChild(fragment);
    }

    getJournalHeaders(rows) {
        const rowWithHeaders = rows.find((row) => Array.isArray(row.rawHeaders) && row.rawHeaders.length > 0);
        return rowWithHeaders ? rowWithHeaders.rawHeaders : this.defaultJournalHeaders();
    }

    renderJournalHeaders(headers) {
        const thead = document.querySelector("#ledger-table thead");
        if (!thead) return;
        thead.innerHTML = "";
        const tr = document.createElement("tr");
        headers.forEach((header, index) => {
            const th = document.createElement("th");
            th.className = "sortable";
            th.dataset.sort = `raw:${index}`;
            th.textContent = header;
            const indicator = document.createElement("span");
            indicator.className = "sort-indicator";
            th.appendChild(indicator);
            th.addEventListener("click", () => this.sortByHeader(`raw:${index}`));
            tr.appendChild(th);
        });
        thead.appendChild(tr);
    }

    getRawJournalCell(row, index) {
        return Array.isArray(row.rawCells) ? String(row.rawCells[index] ?? "") : "";
    }

    decorateJournalCell(cell, header, value) {
        const normalizedHeader = CsvParser.cleanHeader(header);
        const rawValue = String(value ?? "");

        if (this.isNumericLikeCell(rawValue)) cell.classList.add("text-right", "font-mono");
        if (normalizedHeader.includes("tick")) cell.classList.add("ticker-cell");
        if (normalizedHeader.includes("decision") && rawValue.trim()) {
            const badge = document.createElement("span");
            badge.className = `badge ${this.getDecisionBadgeClass(rawValue)}`;
            badge.textContent = rawValue;
            cell.textContent = "";
            cell.classList.add("decision-cell", "text-center");
            cell.appendChild(badge);
        }
        if (this.isPerformanceHeader(normalizedHeader) && rawValue.trim()) {
            const numericValue = CsvParser.cleanNumber(rawValue);
            cell.classList.add(numericValue > 0 ? "positive" : numericValue < 0 ? "negative" : "neutral");
        }
    }

    getDecisionBadgeClass(value) {
        const normalizedValue = String(value || "").trim().toUpperCase();
        if (normalizedValue === "BUY") return "buy";
        if (normalizedValue === "SELL") return "sell";
        if (normalizedValue === "NO BUY") return "nobuy";
        if (normalizedValue === "FIRST SNAPSHOT") return "first";
        return "neutral";
    }

    isPerformanceHeader(normalizedHeader) {
        return normalizedHeader.includes("profit") || normalizedHeader.includes("loss") || normalizedHeader.includes("return");
    }

    isNumericLikeCell(value) {
        return /^[\s$()%,.+-]*\d/.test(String(value || ""));
    }

    compareRows(a, b) {
        const column = this.state.sortColumn;
        if (String(column).startsWith("raw:")) {
            const index = Number(String(column).slice(4));
            const leftRaw = this.getRawJournalCell(a, index);
            const rightRaw = this.getRawJournalCell(b, index);
            const leftNum = CsvParser.cleanNumber(leftRaw);
            const rightNum = CsvParser.cleanNumber(rightRaw);
            const bothNumeric = leftRaw !== "" && rightRaw !== "" && Number.isFinite(leftNum) && Number.isFinite(rightNum) && /[\d]/.test(leftRaw) && /[\d]/.test(rightRaw);
            if (bothNumeric && leftNum !== rightNum) return this.state.sortAscending ? leftNum - rightNum : rightNum - leftNum;
            return this.state.sortAscending ? leftRaw.localeCompare(rightRaw) : rightRaw.localeCompare(leftRaw);
        }
        let left = a[column];
        let right = b[column];
        if (column === "timestamp") {
            return this.state.sortAscending ? new Date(left) - new Date(right) : new Date(right) - new Date(left);
        }
        if (typeof left === "string") {
            left = left.toUpperCase();
            right = right.toUpperCase();
        }
        left = left ?? 0;
        right = right ?? 0;
        if (left < right) return this.state.sortAscending ? -1 : 1;
        if (left > right) return this.state.sortAscending ? 1 : -1;
        return 0;
    }

    defaultJournalHeaders() {
        return [
            "Timestamp",
            "Ticker",
            "Exchange",
            "Today Price",
            "Previous Snapshot Price",
            "Decision",
            "Shares Bought",
            "Purchase Cost",
            "Cash Remaining",
            "Total Shares",
            "Total Spent",
            "Average Purchase Price",
            "Portfolio Value",
            "Profit/Loss",
            "Return %"
        ];
    }

    getDisplayRow(row) {
        const raw = row.raw || {};
        const rawText = (key) => raw[key] ?? "";
        return {
            timestamp: raw.timestamp ?? row.timestamp ?? "",
            ticker: raw.ticker ?? row.ticker ?? "",
            exchange: raw.exchange ?? row.exchange ?? "",
            todayPrice: raw.todayPrice ?? String(row.todayPrice ?? ""),
            sharesBought: raw.sharesBought ?? String(row.sharesBought ?? ""),
            decision: raw.decision ?? row.decision ?? "",
            prevPrice: rawText("prevPrice"),
            purchaseCost: rawText("purchaseCost"),
            cashRemaining: rawText("cashRemaining"),
            totalShares: rawText("totalShares"),
            totalSpent: rawText("totalSpent"),
            avgPurchasePrice: rawText("avgPurchasePrice"),
            portfolioValue: rawText("portfolioValue"),
            profitLoss: rawText("profitLoss"),
            returnPct: rawText("returnPct")
        };
    }

    escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    populateTickerFilter() {
        const select = this.cache["filter-ticker"];
        if (!select) return;
        const current = select.value;
        const tickers = [...new Set(this.state.snapshots.map((s) => s.ticker.toUpperCase()))].sort();
        select.innerHTML = '<option value="ALL">All Tickers</option>';
        tickers.forEach((ticker) => {
            const option = document.createElement("option");
            option.value = ticker;
            option.textContent = ticker;
            select.appendChild(option);
        });
        if (tickers.includes(current)) select.value = current;
    }

    getSelectedTickerFilter() {
        const select = this.cache["filter-ticker"];
        return select ? String(select.value || "ALL").toUpperCase() : "ALL";
    }

    renderStatusChips() {
        const chip = this.cache["status-last-sync"];
        if (!chip) return;

        const syncedSources = this.state.sources
            .filter((source) => source.enabled && source.lastSync && source.lastSync !== "Never")
            .sort((a, b) => (Date.parse(b.lastSync) || 0) - (Date.parse(a.lastSync) || 0));

        if (syncedSources.length === 0) {
            chip.textContent = this.state.sources.some((source) => source.enabled) ? "Last Sync: Waiting" : "Last Sync: No feeds";
            chip.title = "No feed has completed a sync in this browser yet.";
            return;
        }

        const latest = syncedSources[0];
        chip.textContent = `Last Sync: ${latest.lastSync}`;
        chip.title = `${latest.name} synced at ${latest.lastSync}`;
    }

    renderSources() {
        const grid = this.cache["sources-grid"];
        const empty = this.cache["sources-empty-state"];
        grid.innerHTML = "";
        if (this.state.sources.length === 0) {
            empty.classList.remove("hidden");
            return;
        }
        empty.classList.add("hidden");

        const fragment = document.createDocumentFragment();
        for (const src of this.state.sources) {
            const card = document.createElement("div");
            card.className = `glass-card source-card ${src.enabled ? "" : "disabled"}`;
            const status = src.status === "success" ? "success" : src.status === "error" ? "error" : "pending";
            card.innerHTML = `
                <div>
                    <div class="source-card-header">
                        <div class="source-card-title">${src.name}</div>
                        <label class="switch">
                            <input type="checkbox" class="toggle-source-enable" data-id="${src.id}" ${src.enabled ? "checked" : ""}>
                            <span class="slider"></span>
                        </label>
                    </div>
                    <div class="source-card-status">
                        <span class="status-dot ${status}"></span>
                        <span>${src.status.toUpperCase()}</span>
                    </div>
                    <div class="source-card-url" title="${src.url}">${src.url}</div>
                    <div class="source-card-stats">
                        <span>Rows Synced: <strong>${src.recordCount}</strong></span>
                        <span>Last Synced: <small>${src.lastSync}</small></span>
                    </div>
                    ${src.status === "error" && src.errorMessage ? `<div class="source-card-error">${src.errorMessage}</div>` : ""}
                </div>
                <div class="source-card-footer">
                    <button class="btn btn-secondary btn-icon-only btn-sync-source" data-id="${src.id}" title="Force Refresh Sync">↻</button>
                    <button class="btn btn-secondary btn-icon-only btn-delete-source" data-id="${src.id}" title="Delete Data Source">×</button>
                </div>
            `;
            fragment.appendChild(card);
        }
        grid.appendChild(fragment);

        document.querySelectorAll(".toggle-source-enable").forEach((cb) => {
            cb.addEventListener("change", (e) => this.toggleSourceEnabled(e.target.getAttribute("data-id"), e.target.checked));
        });
        document.querySelectorAll(".btn-sync-source").forEach((btn) => {
            btn.addEventListener("click", (e) => this.syncSource(this.state.sources.find((s) => s.id === e.currentTarget.getAttribute("data-id")), true));
        });
        document.querySelectorAll(".btn-delete-source").forEach((btn) => {
            btn.addEventListener("click", (e) => this.deleteSource(e.currentTarget.getAttribute("data-id")));
        });
    }

    toggleSourceEnabled(id, enabled) {
        const source = this.state.sources.find((s) => s.id === id);
        if (!source) return;
        source.enabled = enabled;
        this.persistState();
        this.syncUi();
        this.showToast(`${source.name} ${enabled ? "enabled" : "disabled"}`, "success");
    }

    deleteSource(id) {
        const source = this.state.sources.find((s) => s.id === id);
        if (!source) return;
        if (!confirm(`Are you sure you want to remove the source "${source.name}"?`)) return;
        this.state.sources = this.state.sources.filter((s) => s.id !== id);
        this.syncUi();
        this.logger.info("API", "Data source removed", {
            sourceId: source.id,
            sourceName: source.name,
            url: source.url
        });
        this.showToast("Source removed successfully", "success");
    }

    renderLogs() {
        const list = this.cache["logs-list"];
        if (!list) return;

        const entries = this.logger.getEntries();
        const errorCount = entries.filter((entry) => entry.level === "ERROR").length;
        const latest = entries[0];

        this.setText("log-total-count", entries.length);
        this.setText("log-error-summary", errorCount);
        this.setText("log-latest-time", latest ? this.formatLogTime(latest.timestamp) : "None");

        const errorBadge = this.cache["log-error-count"];
        errorBadge.textContent = errorCount > 99 ? "99+" : String(errorCount);
        errorBadge.classList.toggle("hidden", errorCount === 0);

        const levelFilter = this.cache["log-level-filter"].value;
        const categoryFilter = this.cache["log-category-filter"].value;
        const filtered = entries.filter((entry) => {
            const matchesLevel = levelFilter === "ALL" || entry.level === levelFilter;
            const matchesCategory = categoryFilter === "ALL" || entry.category === categoryFilter;
            return matchesLevel && matchesCategory;
        });

        list.innerHTML = "";
        this.cache["logs-empty-state"].classList.toggle("hidden", filtered.length > 0);
        if (filtered.length === 0) return;

        const fragment = document.createDocumentFragment();
        filtered.forEach((entry) => fragment.appendChild(this.createLogEntryNode(entry)));
        list.appendChild(fragment);
    }

    createLogEntryNode(entry) {
        const wrapper = document.createElement("article");
        wrapper.className = "log-entry";

        const header = document.createElement("div");
        header.className = "log-entry-header";

        const level = document.createElement("span");
        level.className = `log-level-badge ${entry.level.toLowerCase()}`;
        level.textContent = entry.level;

        const category = document.createElement("span");
        category.className = "log-category-badge";
        category.textContent = entry.category;

        const message = document.createElement("div");
        message.className = "log-message";
        message.textContent = entry.message;

        const time = document.createElement("time");
        time.className = "log-time";
        time.dateTime = entry.timestamp;
        time.textContent = this.formatLogTime(entry.timestamp);

        header.append(level, category, message, time);
        wrapper.appendChild(header);

        if (entry.details && Object.keys(entry.details).length > 0) {
            const details = document.createElement("pre");
            details.className = "log-details";
            details.textContent = JSON.stringify(entry.details, null, 2);
            wrapper.appendChild(details);
        }

        return wrapper;
    }

    clearLogs() {
        if (!confirm("Clear all developer logs?")) return;
        this.logger.clear();
        this.showToast("Developer logs cleared", "success");
    }

    exportLogs() {
        const logs = this.logger.getEntries();
        if (logs.length === 0) {
            this.showToast("No logs to export", "error");
            return;
        }

        const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `tradesphere_developer_logs_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        this.showToast("Developer logs exported", "success");
    }

    formatLogTime(timestamp) {
        try {
            return new Date(timestamp).toLocaleString();
        } catch {
            return timestamp;
        }
    }

    createChartGlowPlugin(color) {
        return {
            id: `datasetGlow${Date.now()}`,
            beforeDatasetDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.shadowColor = color;
                ctx.shadowBlur = 18;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            },
            afterDatasetDraw(chart) {
                chart.ctx.restore();
            }
        };
    }

    renderChart() {
        const canvas = this.cache["portfolioChart"];
        if (!canvas || !window.Chart) return;
        const ctx = canvas.getContext("2d");
        if (this.state.portfolioChartInstance) this.state.portfolioChartInstance.destroy();
        const selectedTicker = this.getSelectedTickerFilter();
        const buySnapshots = this.state.snapshots.filter((row) => row.isBuy && (selectedTicker === "ALL" || row.ticker.toUpperCase() === selectedTicker));
        if (buySnapshots.length === 0) return;

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const gridColor = isDark ? "rgba(255, 255, 255, 0.03)" : "rgba(15, 23, 42, 0.08)";
        const textColor = isDark ? "#A89B82" : "#5f533c";
        const goldPrimary = "#D4AF37";
        const goldLight = "#F3E5AB";
        const goldDim = "#8A7330";
        const tooltipOptions = {
            backgroundColor: isDark ? "rgba(10, 10, 10, 0.94)" : "rgba(255, 255, 255, 0.95)",
            titleColor: isDark ? "#F3E5AB" : "#3a2f12",
            bodyColor: isDark ? "#F5F5F5" : "#1f2937",
            borderColor: isDark ? "rgba(212, 175, 55, 0.28)" : "rgba(120, 86, 13, 0.22)",
            borderWidth: 1,
            padding: 12,
            cornerRadius: 10,
            displayColors: false,
            mode: "index",
            intersect: false
        };

        if (this.state.currentChartTab === "portfolio") {
            const labels = buySnapshots.map((s) => s.timestamp.substring(5, 16));
            const portfolioValues = buySnapshots.map((s) => s.portfolioValue);
            const gradient = ctx.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, "rgba(212, 175, 55, 0.2)");
            gradient.addColorStop(1, "rgba(5, 5, 5, 0)");

            this.state.portfolioChartInstance = new Chart(ctx, {
                type: "line",
                data: {
                    labels,
                    datasets: [{
                        label: "Portfolio Value ($)",
                        data: portfolioValues,
                        borderColor: goldPrimary,
                        borderWidth: 3,
                        pointRadius: portfolioValues.map((_value, index) => index === portfolioValues.length - 1 ? 5 : 2.5),
                        pointHoverRadius: 7,
                        pointBackgroundColor: portfolioValues.map((_value, index) => index === portfolioValues.length - 1 ? goldLight : "rgba(212, 175, 55, 0.86)"),
                        pointBorderColor: "rgba(5, 5, 5, 0.9)",
                        pointBorderWidth: 1.25,
                        backgroundColor: gradient,
                        fill: true,
                        tension: 0.38
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    layout: { padding: { top: 10, right: 16, bottom: 2, left: 4 } },
                    plugins: { legend: { display: false }, tooltip: { ...tooltipOptions, callbacks: { label: (c) => `Value: ${this.formatCurrency(c.parsed.y)}` } } },
                    scales: {
                        x: { grid: { display: false }, border: { display: false }, ticks: { color: textColor, maxTicksLimit: 10, font: { weight: "600" } } },
                        y: { grid: { color: gridColor, drawTicks: false }, border: { display: false }, ticks: { color: textColor, padding: 10, callback: (v) => "$" + Number(v).toLocaleString() } }
                    }
                },
                plugins: [this.createChartGlowPlugin("rgba(212, 175, 55, 0.35)")]
            });
            return;
        }

        const tickers = [...new Set(this.state.snapshots.map((s) => s.ticker.toUpperCase()))];
        const buyTickers = [...new Set(buySnapshots.map((s) => s.ticker.toUpperCase()))];
        let chartTicker = this.getSelectedTickerFilter();
        if (chartTicker === "ALL") chartTicker = buyTickers[0] || tickers[0] || "";
        if (!chartTicker) return;
        const tickerSnapshots = buySnapshots.filter((s) => s.ticker.toUpperCase() === chartTicker);
        if (tickerSnapshots.length === 0) return;

        this.state.portfolioChartInstance = new Chart(ctx, {
            type: "line",
            data: {
                labels: tickerSnapshots.map((s) => s.timestamp.substring(5, 16)),
                datasets: [
                    { label: `${chartTicker} Price ($)`, data: tickerSnapshots.map((s) => s.todayPrice), borderColor: goldPrimary, borderWidth: 2.5, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: goldLight, pointBorderColor: "rgba(5, 5, 5, 0.85)", pointBorderWidth: 1, tension: 0.32, fill: false },
                    { label: "Avg Purchase Cost ($)", data: tickerSnapshots.map((s) => s.avgPurchasePrice), borderColor: goldDim, borderWidth: 2.25, borderDash: [6, 6], pointRadius: 0, tension: 0.18, fill: false }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                layout: { padding: { top: 8, right: 16, bottom: 2, left: 4 } },
                plugins: { legend: { display: true, labels: { color: textColor, boxWidth: 9, boxHeight: 9, usePointStyle: true, font: { weight: "700" } } }, tooltip: { ...tooltipOptions, callbacks: { label: (c) => `${c.dataset.label.split(" ")[0]}: ${this.formatCurrency(c.parsed.y)}` } } },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: textColor, maxTicksLimit: 10, font: { weight: "600" } } },
                    y: { grid: { color: gridColor, drawTicks: false }, border: { display: false }, ticks: { color: textColor, padding: 10, callback: (v) => "$" + Number(v).toFixed(2) } }
                }
            },
            plugins: [this.createChartGlowPlugin("rgba(212, 175, 55, 0.28)")]
        });
    }

    exportLedgerToCSV() {
        if (this.state.snapshots.length === 0) {
            this.showToast("No data to export", "error");
            return;
        }

        const headers = this.getJournalHeaders(this.state.snapshots);
        const lines = [headers.map((header) => this.csvCell(header)).join(",")];
        for (const s of this.state.snapshots) {
            lines.push(headers.map((_header, index) => this.csvCell(this.getRawJournalCell(s, index))).join(","));
        }

        const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `aggregated_portfolio_ledger_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        this.showToast("CSV file downloaded", "success");
    }

    csvCell(value) {
        return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    formatCurrency(value) {
        return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
    }

    setText(id, value) {
        this.cache[id].textContent = value;
    }

    showToast(message, type = "success") {
        const toast = this.cache["toast"];
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove("hidden");
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.portfolioApp = new PortfolioApp();
    window.portfolioApp.init();
});
