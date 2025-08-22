// src/api/integrations.ts

export type LogFilters = {
    project?: string;
    filename?: string;
    dateFrom?: string | null; // ISO
    dateTo?: string | null;   // ISO
    kwargs?: Record<string, string[]>;
    returns?: Record<string, string[]>;
    limit?: number;
    offset?: number;
};

export type LogItem = {
    id: string;
    timestamp?: string; // ISO в UTC (c Z)
    filename?: string;
    project?: string;
    text: string;
    kwargs?: Record<string, any>;
    integration_return?: Record<string, any>;
};

export type LogsResponse =
    | { items: LogItem[]; total?: number }
    | string;

// --- helper: "YYYY-MM-DD HH:mm:ss" (UTC) -> ISO с Z
function getDataAttr(name: string): string | undefined {
    const root = document.getElementById("root");
    if (!root) return undefined;
    return (root as HTMLElement).dataset[name] ?? undefined;
}

/** ✅ Добавит https:// если забыли */
function normalizeBase(u?: string): string | undefined {
    if (!u) return undefined;
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** ✅ Склеивает с учётом подпути (/code) */
function buildUrl(base: string, path: string): string {
    const b = base.endsWith("/") ? base : base + "/";
    const p = path.replace(/^\//, "");
    return new URL(p, b).toString();
}

// пример
const chatServer = getDataAttr("chatServer");   // из data-chat-server
const codeBase =
    normalizeBase(getDataAttr("codeServer")) || "https://wwstest.glagol.ai/code";


function buildOperatorList(values?: string[]) {
    if (!values || values.length === 0) return undefined;
    return ["IN", ...values];
}

export async function getIntegrationLogByKey(key: string): Promise<string> {
    const url = buildUrl(codeBase!, `integrations/logs/${encodeURIComponent(key)}`);
    const resp = await fetch(url, { method: "GET" });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${txt}`);
    }
    const ct = resp.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
        const data = await resp.json();
        return typeof data === "string" ? data : JSON.stringify(data, null, 2);
    }
    return await resp.text();
}

export async function getIntegrationLogs(filters: LogFilters): Promise<LogsResponse> {
    // собираем kwargs
    const kwargs: Record<string, any> = {};
    if (filters.kwargs) {
        for (const [k, arr] of Object.entries(filters.kwargs)) {
            if (arr?.length) kwargs[k] = ["IN", ...arr];
        }
    }

    // собираем integration_return
    const integration_return: Record<string, any> = {};
    if (filters.returns) {
        for (const [k, arr] of Object.entries(filters.returns)) {
            if (arr?.length) integration_return[k] = ["IN", ...arr];
        }
    }

    // базовый payload — без пустых полей
    const payload: Record<string, any> = {
        login: "fs.at.akc24.ru",
        directory: "main",
        // error: true,
        // return_errors: true,
    };

    if (filters.project)  payload.project  = filters.project;
    if (filters.filename) payload.filename = filters.filename;
    // if (filters.limit != null)  payload.logs_number = filters.limit;
    if (filters.offset != null) payload.offset      = filters.offset;
    if (filters.dateFrom) payload.logs_timestamp_from = filters.dateFrom;
    if (filters.dateTo)   payload.logs_timestamp_to   = filters.dateTo;
    if (Object.keys(kwargs).length)             payload.kwargs              = kwargs;
    if (Object.keys(integration_return).length) payload.integration_return  = integration_return;
    // integration_log не кладём вовсе, раз он пустой
    const url = buildUrl(codeBase!, "integrations/file/logs");

    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`HTTP ${resp.status}: ${txt}`);
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
        const text = await resp.text();
        return text;
    }

    // ожидаемый массив { datetime, integration_key }
    const json = await resp.json();

    if (json && typeof json === "object" && Array.isArray(json.items)) {
        return json as { items: LogItem[]; total?: number };
    }

    if (Array.isArray(json)) {
        type RawRow = { datetime: string; integration_key: string };
        const rows = json as RawRow[];

        const toIso = (dt: string) => dt.replace(" ", "T") + "Z";
        const fmt   = (iso: string) =>
            new Intl.DateTimeFormat(undefined, {
                year: "numeric", month: "2-digit", day: "2-digit",
                hour: "2-digit", minute: "2-digit", second: "2-digit",
            }).format(new Date(iso));

        const items: LogItem[] = rows.map((r, i) => {
            const iso = toIso(r.datetime);
            return {
                id: r.integration_key || String(i + 1),
                timestamp: iso,
                filename: filters.filename,
                project:  filters.project,
                text: `${fmt(iso)} — ${r.integration_key}`,
            };
        }).sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

        return { items, total: items.length };
    }

    return JSON.stringify(json);
}

// как было:
export function trySplitPlainTextIntoItems(raw: string): LogItem[] {
    const chunks = raw.split(/\n{2,}|^-{3,}\n/m).map(s => s.trim()).filter(Boolean);
    return chunks.map((t, i) => ({ id: String(i + 1), text: t }));
}
