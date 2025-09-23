// src/api/agents.ts  (оставь свой реальный путь)
// ВАЖНО: больше не читаем store.getState() на верхнем уровне модуля!

import axios from "axios";
import { store } from "../../../../../redux/store";

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

export type LogsResponse = { items: LogItem[]; total?: number } | string;

/* ===================== helpers ===================== */

/** Всегда берём актуальные значения из Redux на момент вызова */
function getCreds() {
    const st = store.getState();
    const creds = st?.credentials ?? {};
    const glagol_parent: string = creds.glagolParent || "";
    const codeServer: string = creds.codeServer || "";
    return { glagol_parent, codeServer };
}

/** Добавит https:// если забыли */
function normalizeBase(u?: string): string | undefined {
    if (!u) return undefined;
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Склеивает с учётом подпути (/code) */
function buildUrl(base: string, path: string): string {
    const b = base.endsWith("/") ? base : base + "/";
    const p = path.replace(/^\//, "");
    return new URL(p, b).toString();
}

/** codeBase: Redux.credentials.codeServer → data-code-server → дефолт */
function getCodeBase(): string {
    // 1) Redux
    const { codeServer } = getCreds();
    const fromRedux = normalizeBase(codeServer);
    if (fromRedux) return fromRedux;

    // 2) data-attr
    const root = document.getElementById("root") as HTMLElement | null;
    const fromData = normalizeBase(root?.dataset?.codeServer);
    if (fromData) return fromData;

    // 3) дефолт
    return "https://wwstest.glagol.ai/code";
}

/** подготовка IN-массива для бэкенда */
function toIn(values?: string[]) {
    if (!values || values.length === 0) return undefined;
    return ["IN", ...values];
}

/* ===================== API ===================== */

export async function getIntegrationLogByKey(key: string): Promise<string> {
    const codeBase = getCodeBase();
    const url = buildUrl(codeBase, `integrations/logs/${encodeURIComponent(key)}`);

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
    const codeBase = getCodeBase();
    const { glagol_parent } = getCreds();

    // добавляем .py к имени модуля для бэка
    const withPy = (name?: string) => {
        if (!name) return undefined;
        const v = name.trim();
        if (!v) return undefined;
        return /\.py$/i.test(v) ? v : `${v}.py`;
    };

    // kwargs
    const kwargs: Record<string, any> = {};
    if (filters.kwargs) {
        for (const [k, arr] of Object.entries(filters.kwargs)) {
            const v = toIn(arr);
            if (v) kwargs[k] = v;
        }
    }

    // integration_return
    const integration_return: Record<string, any> = {};
    if (filters.returns) {
        for (const [k, arr] of Object.entries(filters.returns)) {
            const v = toIn(arr);
            if (v) integration_return[k] = v;
        }
    }

    // базовый payload — без пустых полей
    // Примечание: у тебя здесь было `login: glagolParent` — сохраняю семантику.
    // Если код-сервис ожидает ключ 'glagol_parent', замени 'login' на 'glagol_parent'.
    const payload: Record<string, any> = {
        login: glagol_parent,
        directory: "main",
    };

    if (filters.project)  payload.project  = filters.project;
    if (filters.filename) payload.filename = withPy(filters.filename); // строго .py
    if (filters.offset != null)           payload.offset = filters.offset;
    if (filters.dateFrom)                 payload.logs_timestamp_from = filters.dateFrom;
    if (filters.dateTo)                   payload.logs_timestamp_to   = filters.dateTo;
    if (Object.keys(kwargs).length)             payload.kwargs             = kwargs;
    if (Object.keys(integration_return).length) payload.integration_return = integration_return;

    const url = buildUrl(codeBase, "integrations/file/logs");

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

    // ожидаемый массив { datetime, integration_key } или { items: [...] }
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

        const items: LogItem[] = rows
            .map((r, i) => {
                const iso = toIso(r.datetime);
                return {
                    id: r.integration_key || String(i + 1),
                    timestamp: iso,
                    filename: filters.filename,
                    project:  filters.project,
                    text: `${fmt(iso)} — ${r.integration_key}`,
                };
            })
            .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

        return { items, total: items.length };
    }

    return JSON.stringify(json);
}

export function trySplitPlainTextIntoItems(raw: string): LogItem[] {
    const chunks = raw.split(/\n{2,}|^-{3,}\n/m).map((s) => s.trim()).filter(Boolean);
    return chunks.map((t, i) => ({ id: String(i + 1), text: t }));
}

/**
 * Возвращает массив подробных модулей:
 * [{ filename: "complete", button_name: "Синхронизировать", kwargs: {...}, return_structure: {...} }, ...]
 */
export async function fetchProjectModules(params: {
    glagol_parent: string;
    project_name: string;
}): Promise<
    {
        id: number;
        filename: string;
        python_version?: string;
        kwargs?: Record<string, any>;
        return_structure?: Record<string, any>;
        button_name?: string | null;
    }[]
> {
    const { glagol_parent, project_name } = params;

    const { data } = await axios.get("/api/v1/modules", {
        params: { glagol_parent, project_name },
    });

    // ожидаемый формат:
    // { status: "success", modules: { <moduleName>: { button_name?: string, kwargs: {...}, return_structure: {...} }, ... } }
    const mods = data?.modules && typeof data.modules === "object" ? data.modules : {};
    const list: {
        id: number;
        filename: string;
        python_version?: string;
        kwargs?: Record<string, any>;
        return_structure?: Record<string, any>;
        button_name?: string | null;
    }[] = [];

    let i = 1;
    for (const [name, def] of Object.entries(mods)) {
        if (!def || typeof def !== "object") continue;
        const block = def as any;

        const btn =
            typeof block.button_name === "string" && block.button_name.trim()
                ? block.button_name.trim()
                : null;

        list.push({
            id: i++,
            filename: String(name), // ЛОГИЧЕСКОЕ ИМЯ МОДУЛЯ
            python_version: block.python_version,
            kwargs: block.kwargs || undefined,
            return_structure: block.return_structure || undefined,
            button_name: btn,
        });
    }

    list.sort((a, b) => (a.button_name || a.filename).localeCompare(b.button_name || b.filename));
    return list;
}
