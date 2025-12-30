import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";

/**
 * ManagerDashboards.tsx (axios edition, no cookies)
 */

const EMPTY_TEXT = "За выбранный промежуток времени ничего не найдено";

const THEME = {
    cardBg: "#ffffff",
    cardBorder: "#E5E7EB",   // gray-200
    cardRadius: 14,
    cardPad: 12,

    text: "#111827",         // gray-900
    muted: "#6B7280",        // gray-500
    icon: "#0EA5E9",         // sky-500
    gridDash: "3 3",
};

// ===== Types =====
export type UserGrid = Record<string, { x: number; y: number }>;

export type DashCard = {
    id: number;
    glagol_parent: string;
    project: string;
    user_grid: UserGrid;
    height: number;
    width: number;
    icon?: string;
    color?: string;
    name: string;
    description?: string | null;
    type: "number" | "table" | "graph";
    data_sources: any;
    method: "GET" | "POST";
    endpoint: string;
    params: any | null; // querystring
    json: any | null;   // body
    headers: Record<string, string> | null;
};

export type DashBoardsResponse = { dash_boards: DashCard[] };

// ===== Utils =====
const COLORS = [
    "#F54927", "#64F000", "#008CFF", "#8B5CF6", "#FF9800",
    "#009688", "#795548", "#E91E63", "#9E9E9E", "#111111",
];

function formatDateYYYYMMDD(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Рекурсивная подстановка {from_dt}/{to_dt} */
function deepReplacePlaceholders(value: string, map: Record<string, string>): string;
function deepReplacePlaceholders<T extends any[]>(value: T, map: Record<string, string>): T;
function deepReplacePlaceholders<T extends Record<string, any>>(value: T, map: Record<string, string>): T;
function deepReplacePlaceholders<T>(value: T, map: Record<string, string>): T {
    if (value == null) return value;
    if (typeof value === "string") {
        let s = value as string;
        for (const [k, v] of Object.entries(map)) s = s.split(`{${k}}`).join(v);
        return s as unknown as T;
    }
    if (Array.isArray(value)) {
        return value.map((v) => deepReplacePlaceholders(v, map)) as unknown as T;
    }
    if (typeof value === "object") {
        const out: Record<string, any> = {};
        for (const [k, v] of Object.entries(value as Record<string, any>)) out[k] = deepReplacePlaceholders(v, map);
        return out as unknown as T;
    }
    return value;
}

/** Разбор PG-пути `'data'->>'spec'->>'inbound'->>'count'` */
function resolvePgPath(data: any, path: string | null | undefined): any {
    if (!path || data == null) return undefined;
    const parts = String(path).split(/->>?/g).map((p) => p.trim());
    let cur: any = data;
    for (let raw of parts) {
        if (!raw) continue;
        const key = raw.replace(/^'+|'+$/g, "").trim();
        if (!key) continue;

        const idx = Number(key);
        if (Array.isArray(cur) && Number.isInteger(idx)) cur = cur[idx];
        else if (cur && typeof cur === "object") cur = cur[key];
        else return undefined;

        if (cur == null) break;
    }
    return cur;
}
function normalizeQueryParams(input: any): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [rawKey, v] of Object.entries(input || {})) {
        const key = rawKey.endsWith("[]") ? rawKey.slice(0, -2) : rawKey;
        if (v == null) continue;
        out[key] = Array.isArray(v) ? v.map(String) : String(v);
    }
    return out;
}


/** Загрузка данных для карточки — axios, без cookies */
async function fetchCardPayload(card: DashCard, fromISO: string, toISO: string) {
    const placeholders = { from_dt: fromISO, to_dt: toISO };

    const endpoint = deepReplacePlaceholders(card.endpoint, placeholders);
    const paramsRaw = deepReplacePlaceholders(card.params ?? {}, placeholders);
    const params    = paramsRaw;              // 👈 вот так
    const data      = deepReplacePlaceholders(card.json ?? {}, placeholders);
    const headers   = deepReplacePlaceholders(card.headers ?? {}, placeholders);

    try {
        const resp = await axios.request({
            url: endpoint,
            method: card.method,        // "GET" | "POST"
            params,
            // гарантируем без [] и без индексов
            paramsSerializer: (p) => {
                const usp = new URLSearchParams();
                Object.entries(p || {}).forEach(([k, v]) => {
                    if (Array.isArray(v)) {
                        for (const it of v) {
                            usp.append(k, String(it));        // projects=spec
                            usp.append(`${k}[]`, String(it)); // и дублируем на всякий случай projects[]=spec
                        }
                    } else if (v != null) {
                        usp.append(k, String(v));
                    }
                });
                return usp.toString();
            },

            data: card.method === "POST" ? data : undefined,
            headers: headers || undefined,
        });
        return resp.data ?? {};
    } catch (e: any) {
        console.warn("[dash] fetchCardPayload error", {
            endpoint,
            status: e?.response?.status,
            data: e?.response?.data,
            message: e?.message
        });
        throw new Error(EMPTY_TEXT);
    }
}

// ===== Card chrome =====
function CardChrome({
                        icon, color, title, description, children,
                    }: {
    icon?: string; color?: string; title: string; description?: string | null; children: React.ReactNode;
}) {
    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: THEME.cardBg,
                border: `1px solid ${THEME.cardBorder}`,
                borderRadius: THEME.cardRadius,
                padding: THEME.cardPad,
                display: "flex",
                flexDirection: "column",
                gap: 12,
                overflow: "hidden",
                boxShadow: "0 1px 2px rgba(0,0,0,.03)",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {icon ? (
                    <span
                        className="material-icons"
                        style={{ color: color || THEME.icon }}
                        aria-hidden
                    >
            {icon}
          </span>
                ) : null}
                <div style={{ fontWeight: 700, color: THEME.text }}>{title}</div>
                {description ? (
                    <span
                        title={description || undefined}
                        className="material-icons"
                        style={{ marginLeft: 4, fontSize: 18, color: THEME.muted, cursor: "help" }}
                    >
            help_outline
          </span>
                ) : null}
            </div>

            <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
        </div>
    );
}

// ===== Renderers =====
function NumberCard({ card, payload }: { card: DashCard; payload: any }) {
    const entries = useMemo(() => Object.entries(card.data_sources || {}), [card.data_sources]);
    return (
        <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                {entries.map(([label, pgPath]) => {
                    const value = resolvePgPath(payload, String(pgPath));
                    return (
                        <React.Fragment key={label}>
                            <div style={{ color: THEME.muted }}>{label}</div>
                            <div style={{ textAlign: "right", fontWeight: 700 }}>{String(value ?? "—")}</div>
                        </React.Fragment>
                    );
                })}
            </div>
        </CardChrome>
    );
}

function TableCard({ card, payload }: { card: DashCard; payload: any }) {
    const columns = useMemo(() => Object.entries(card.data_sources || {}), [card.data_sources]);
    const colArrays = columns.map(([label, pgPath]) => {
        const val = resolvePgPath(payload, String(pgPath));
        return [label, Array.isArray(val) ? val : [val]] as const;
    });
    const rowCount = colArrays.reduce((m, [, arr]) => Math.max(m, arr.length), 0);

    return (
        <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
            <div style={{ width: "100%", height: "100%", overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                    <tr>
                        {colArrays.map(([label]) => (
                            <th key={label} style={{
                                position: "sticky",
                                top: 0,
                                background: THEME.cardBg,
                                color: THEME.muted,
                                textAlign: "left",
                                fontWeight: 600,
                                borderBottom: `1px solid ${THEME.cardBorder}`,
                                padding: "6px 8px",
                                zIndex: 1,
                            }}>
                                {label}
                            </th>
                        ))}
                    </tr>
                    </thead>
                    <tbody>
                    {Array.from({ length: rowCount }).map((_, i) => (
                        <tr key={i}>
                            {colArrays.map(([label, arr]) => (
                                <td key={label} style={{ borderBottom: `1px dashed ${THEME.cardBorder}`, padding: "6px 8px", color: THEME.text }}>
                                    {arr[i] != null ? String(arr[i]) : ""}
                                </td>
                            ))}
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </CardChrome>
    );
}

function GraphCard({ card, payload }: { card: DashCard; payload: any }) {
    const labelsPath = card.data_sources?.labels as string | undefined;
    const seriesObj = card.data_sources?.data as Record<string, string> | undefined;

    const labels = (resolvePgPath(payload, labelsPath || "") ?? []) as any[];
    const seriesEntries = Object.entries(seriesObj || {});
    const seriesArrays = seriesEntries.map(
        ([name, pgPath]) => [name, resolvePgPath(payload, String(pgPath))] as const
    );

    const data = labels.map((label, idx) => {
        const point: any = { label };
        for (const [name, arr] of seriesArrays) {
            const a = Array.isArray(arr) ? arr : [];
            point[name] = a[idx] ?? null;
        }
        return point;
    });

    return (
        <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
            <div style={{ width: "100%", height: "100%" }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray={THEME.gridDash} />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals />
                        <Tooltip />
                        <Legend />
                        {seriesEntries.map(([name], i) => (
                            <Line
                                key={name}
                                type="monotone"
                                dataKey={name}
                                stroke={COLORS[i % COLORS.length]}
                                dot={false}
                                strokeWidth={2}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </CardChrome>
    );
}

function OneCard({ card, payload }: { card: DashCard; payload: any }) {
    if (card.type === "number") return <NumberCard card={card} payload={payload} />;
    if (card.type === "table") return <TableCard card={card} payload={payload} />;
    if (card.type === "graph") return <GraphCard card={card} payload={payload} />;
    return (
        <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
            <div style={{ color: "#AAB1BB" }}>Неизвестный тип карточки: {card.type}</div>
        </CardChrome>
    );
}

function useCardData(card: DashCard, fromISO: string, toISO: string) {
    return useQuery({
        queryKey: ["dash-card", card.id, fromISO, toISO],
        queryFn: () => fetchCardPayload(card, fromISO, toISO),
        staleTime: 30_000,
    });
}

/** Отдельная карточка — хук наверху компонента */
function CardItem({
                      card, userLogin, fromISO, toISO,
                  }: { card: DashCard; userLogin: string; fromISO: string; toISO: string; }) {
    const pos = card.user_grid?.[userLogin] ?? { x: 0, y: 0 };
    const { data: payload, isLoading, isError, error } = useCardData(card, fromISO, toISO);

    return (
        <div
            style={{
                gridColumn: `${(pos.x ?? 0) + 1} / span ${card.width || 1}`,
                gridRow: `${(pos.y ?? 0) + 1} / span ${card.height || 1}`,
                minWidth: 0, minHeight: 0,
            }}
        >
            {isLoading && (
                <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
                        Загрузка…
                    </div>
                </CardChrome>
            )}
            {isError && (
                <CardChrome icon={card.icon} color={card.color} title={card.name} description={card.description}>
                    <div style={{ color: "#F54927" }}>{EMPTY_TEXT}</div>
                </CardChrome>
            )}
            {!isLoading && !isError && payload && <OneCard card={card} payload={payload} />}
        </div>
    );
}

function formatLocalDateTime(d: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== Main component =====
export default function ManagerDashboards({
                                              listEndpoint = "https://tmpapi.glagol.ai/get_dash_boards",
                                              glagolParent,
                                              userLogin,
                                              gridRowHeight = 120,
                                          }: {
    listEndpoint?: string;
    glagolParent: string;
    userLogin: string;
    gridRowHeight?: number;
}) {
// дефолт: сегодня 00:00 — сегодня 23:59 (локально)
    const pad = (n: number) => String(n).padStart(2, "0");
    const toInputDate = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const today = new Date();
    const [fromDate, setFromDate] = useState<string>(() => toInputDate(today));
    const [toDate, setToDate]     = useState<string>(() => toInputDate(today));

// для плейсхолдеров API нужны только даты
    const fromISO = fromDate; // "YYYY-MM-DD"
    const toISO   = toDate;   // "YYYY-MM-DD"

    const { data, isLoading, isError, error, refetch } = useQuery<DashBoardsResponse>({
        queryKey: ["dash-list", glagolParent, userLogin],
        queryFn: async () => {
            const resp = await axios.get<DashBoardsResponse>(listEndpoint, {
                params: { glagol_parent: glagolParent, user: userLogin },
                // withCredentials: false (по умолчанию)
            });
            return resp.data;
        },
        staleTime: 60_000,
    });

    const cards = data?.dash_boards || [];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
            <div className="row g-3 align-items-end mb-2">
                <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                    <label className="form-label mb-1">Дата с</label>
                    <input
                        type="date"
                        className="form-control"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                    />
                </div>

                <div className="col-12 col-sm-6 col-md-3 col-lg-2">
                    <label className="form-label mb-1">Дата по</label>
                    <input
                        type="date"
                        className="form-control"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                    />
                </div>

                {/* Кнопка: узкая колонка, прижата вниз, с отступом слева на >= sm */}
                <div className="col-auto align-self-end ms-sm-3">
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => refetch()}>
                        Обновить список дашбордов
                    </button>
                </div>
            </div>

            {/* Grid 5 cols */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                    gridAutoRows: `${gridRowHeight}px`,
                    gap: 12,
                    overflow: "auto",
                    paddingBottom: 12,
                    height: "100%",
                }}
            >
                {isLoading && <div style={{ gridColumn: "1 / -1", color: "#AAB1BB" }}>Загрузка списка…</div>}
                {isError && (
                    <div style={{ gridColumn: "1 / -1", color: "#F54927" }}>
                        Ошибка списка: {(error as Error)?.message}
                    </div>
                )}

                {cards.map((card) => (
                    <CardItem key={card.id} card={card} userLogin={userLogin} fromISO={fromISO} toISO={toISO} />
                ))}
            </div>
        </div>
    );
}
