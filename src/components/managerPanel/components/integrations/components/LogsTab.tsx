// src/features/manager/components/LogsTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
    getIntegrationLogs,
    getIntegrationLogByKey,
    trySplitPlainTextIntoItems,
    type LogItem,
    type LogFilters,
} from "../api/integrations";

import SearchableSelect from "../../../../callControlPanel/components/select";
import { useSelector } from "react-redux";
import { store } from "../../../../../redux/store";
import { makeSelectFullProjectPool } from "../../../../../redux/operatorSlice";
import { socket } from "../../../../../socket";

type KVRow = { id: string; key: string; values: string };


/* ---- метаданные модуля: теперь берём kwargs/return_structure, чтобы строить селекты ---- */
type ModuleKwargMeta = {
    name?: string;
    type?: string;
    source?: string;
    default?: any;
    structure?: any;
};
type ModuleInfo = {
    id: number;
    filename: string;              // без ".py"
    python_version?: string;
    kwargs?: Record<string, ModuleKwargMeta>;
    return_structure?: Record<string, any>;
};

const emptyFilters: LogFilters = {
    project: "",
    filename: undefined, // выбираем из селекта
    dateFrom: null,
    dateTo: null,
    kwargs: {},
    returns: {},
    limit: 100,
    offset: 0,
};

const withPy = (s: string) => {
    const v = (s || "").trim();
    if (!v) return "";
    return v.toLowerCase().endsWith(".py") ? v : `${v}.py`;
};

/* ---------- Красивый рендер деталей лога ---------- */
function LogDetails({ raw }: { raw: string }) {
    const [showRaw, setShowRaw] = React.useState(false);
    const [showReturnStruct, setShowReturnStruct] = React.useState(false);
    const [showLogs, setShowLogs] = React.useState(false);
    const [showIntegrationReturn, setShowIntegrationReturn] = React.useState(false);
    const [showErrors, setShowErrors] = useState(false);

    let parsed: any = null;
    try {
        parsed = JSON.parse(raw);
    } catch {}

    if (!parsed) {
        return <pre className="mb-0">{raw || <span className="text-muted">Пусто</span>}</pre>;
    }

    const {
        kwargs,
        directory,
        python_version,
        max_memory_mb,
        timeout,
        return_structure,
        integration_key,
        integration_log,
        integration_return,
        return_errors,
        error,
        error_text,
        execution_time,
        ...rest
    } = parsed ?? {};

    const hasObj = (o: any) => !!o && typeof o === "object" && Object.keys(o).length > 0;
    const asPre = (o: any) => <pre className="mb-0">{JSON.stringify(o, null, 2)}</pre>;

    const Arrow: React.FC<{ open: boolean }> = ({ open }) => (
        <span
            style={{
                display: "inline-block",
                transition: "transform 0.2s",
                transform: open ? "rotate(90deg)" : "rotate(0deg)",
                marginRight: 6,
            }}
        >
      ▶
    </span>
    );

    return (
        <div>
            {/* Статусы/ключ/время */}
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                {error ? <span className="badge bg-danger">Ошибка</span> : <span className="badge bg-success">OK</span>}
                {integration_key && <span className="badge text-bg-secondary">{/* key hidden as badge */}</span>}
                {execution_time && <span className="badge bg-success">Время: {execution_time}</span>}
            </div>

            {/* Ошибка */}
            {error && error_text && (
                <div className="alert alert-danger mb-0" style={{ padding: 8, marginTop: 8 }}>
                    <div className="fw-semibold mb-1">Ошибка: </div>
                    <div style={{ whiteSpace: "pre-wrap", marginLeft: 8 }}>{error_text}</div>
                </div>
            )}

            {/* Основные поля */}
            <div>
                {directory && (
                    <div className="col" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <div className="small text-muted">Директория: </div>
                        <div className="fw-semibold" style={{ marginBottom: 2 }}>{directory}</div>
                    </div>
                )}
                {python_version && (
                    <div className="col" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <div className="small text-muted">Версия python:</div>
                        <div className="fw-semibold" style={{ marginBottom: 2 }}>{python_version}</div>
                    </div>
                )}
                {typeof timeout === "number" && (
                    <div className="col" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <div className="small text-muted">Таймаут:</div>
                        <div className="fw-semibold" style={{ marginBottom: 2 }}>{timeout}s</div>
                    </div>
                )}
                {typeof max_memory_mb === "number" && (
                    <div className="col" style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <div className="small text-muted">Макс. память:</div>
                        <div className="fw-semibold" style={{ marginBottom: 2 }}>{max_memory_mb} MB</div>
                    </div>
                )}
            </div>

            {/* kwargs — простые пары "key = value" */}
            {hasObj(kwargs) && (
                <div>
                    <div className="fw-semibold mb-1" style={{ fontWeight: 700 }}>kwargs‑переменные:</div>
                    <div
                        className="p-2 bg-light rounded"
                        style={{
                            whiteSpace: "pre-wrap",
                            fontFamily:
                                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        }}
                    >
                        {Object.entries(kwargs).map(([k, v]) => {
                            const isPrimitive = v == null || ["string", "number", "boolean"].includes(typeof v);
                            return (
                                <div key={k}>
                                    <code>{k}</code>{" = "}{isPrimitive ? String(v ?? "") : <code>{JSON.stringify(v)}</code>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Логи (collapsible) */}
            {integration_log != null && (
                <div>
                    <div
                        className="fw-semibold mb-1 d-flex align-items-center"
                        style={{ fontWeight: 700, cursor: "pointer" }}
                    >
                        Логи:
                    </div>
                        <div className="p-2 bg-light rounded">
                            {Array.isArray(integration_log) ? (
                                integration_log.length ? (
                                    <ul className="mb-0 small">
                                        {integration_log.map((ln: any, i: number) => (
                                            <li key={i} style={{ whiteSpace: "pre-wrap" }}>
                                                {typeof ln === "string" ? ln : JSON.stringify(ln)}
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <span className="text-muted">пусто</span>
                                )
                            ) : (
                                asPre(integration_log)
                            )}
                        </div>
                </div>
            )}

            {/* Возврат интеграции (collapsible) */}
            {hasObj(integration_return) && (
                <div>
                    <div
                        className="fw-semibold mb-1 d-flex align-items-center"
                        style={{ fontWeight: 700, cursor: "pointer" }}
                        onClick={() => setShowIntegrationReturn((s) => !s)}
                    >
                        <Arrow open={showIntegrationReturn} />
                        Возврат интеграции:
                    </div>
                    {showIntegrationReturn && (
                        <div className="p-2 bg-light rounded">{asPre(integration_return)}</div>
                    )}
                </div>
            )}

            {/* Ошибки возврата (оставил как было; можно тоже сделать collapsible при желании) */}
            {hasObj(return_errors) && (
                <div>
                    <div
                        className="fw-semibold mb-1 d-flex align-items-center"
                        style={{ fontWeight: 700, cursor: "pointer" }}
                        onClick={() => setShowErrors((s) => !s)}
                    >
                        <Arrow open={showReturnStruct} />
                        Возвращаемые ошибки:
                    </div>
                    {showErrors && <div className="p-2 bg-light rounded">{asPre(return_errors)}</div>}
                </div>
            )}

            {/* Прочие поля (сырой JSON) */}
            {hasObj(rest) && (
                <div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowRaw((s) => !s)}>
                        {showRaw ? "Скрыть сырой JSON" : "Показать сырой JSON"}
                    </button>
                    {showRaw && <div className="mt-2">{asPre(rest)}</div>}
                </div>
            )}

            {/* Структура возврата (collapsible) */}
            {hasObj(return_structure) && (
                <div>
                    <div
                        className="fw-semibold mb-1 d-flex align-items-center"
                        style={{ fontWeight: 700, cursor: "pointer" }}
                        onClick={() => setShowReturnStruct((s) => !s)}
                    >
                        <Arrow open={showReturnStruct} />
                        Структура возврата:
                    </div>
                    {showReturnStruct && (
                        <pre className="p-2 bg-light rounded mb-2">
              {JSON.stringify(return_structure, null, 2)}
            </pre>
                    )}
                </div>
            )}
        </div>
    );
}
/* -------------------------------------------------- */

export const LogsTab: React.FC = () => {
    const [filters, setFilters] = useState<LogFilters>(emptyFilters);
    const [kwRows, setKwRows] = useState<KVRow[]>([]);
    const [retRows, setRetRows] = useState<KVRow[]>([]);

    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<LogItem[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // детальный текст лога (кэш)
    const [detailsById, setDetailsById] = useState<Record<string, string>>({});
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);

    const filenameValueForSelect = (filters.filename ?? "").replace(/\.py$/i, "");

    // ===== проекты из redux =====
    const { sessionKey } = (store.getState() as any).operator || {};
    const { sipLogin = "", worker } = (store.getState() as any).credentials || {};

    const selectFullProjectPool = useMemo(
        () => makeSelectFullProjectPool(sipLogin),
        [sipLogin]
    );
    const projectPool = useSelector(selectFullProjectPool) || [];
    const projectOptions = useMemo(
        () =>
            projectPool.map((p: any) => ({
                id: p.project_name as string,
                name: (p.glagol_name as string) || (p.project_name as string),
            })),
        [projectPool]
    );

    // ===== модули по проектам =====
    const [modulesByProject, setModulesByProject] = useState<
        Record<string, ModuleInfo[]>
    >({});
    const [modulesLoading, setModulesLoading] = useState(false);

    function normalizeModules(raw: any): Record<string, ModuleInfo[]> {
        const out: Record<string, ModuleInfo[]> = {};
        if (raw && typeof raw === "object") {
            for (const [proj, arr] of Object.entries(raw)) {
                if (Array.isArray(arr)) {
                    out[proj] = (arr as any[]).map((m) => ({
                        id: Number((m as any).id),
                        filename: String((m as any).filename),
                        python_version: (m as any).python_version,
                        kwargs: (m as any).kwargs || undefined,
                        return_structure: (m as any).return_structure || undefined,
                    }));
                }
            }
        }
        return out;
    }

    // запросим модули для всех проектов, что есть в селекте
    useEffect(() => {
        const projects = projectOptions.map((p) => p.id);
        if (!projects.length) return;

        const handler = (payload: any) => {
            setModulesByProject((prev) => ({ ...prev, ...normalizeModules(payload) }));
            setModulesLoading(false);
        };

        setModulesLoading(true);
        socket.on("get_modules", handler);
        socket.emit("get_modules", {
            projects,
            session_key: sessionKey,
            worker,
        });

        return () => {
            socket.off("get_modules", handler);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectOptions, sessionKey, worker]);

    // если сменили проект и текущего filename среди модулей нет — очистим его
    useEffect(() => {
        const proj = filters.project ?? "";
        const list = modulesByProject[proj] || [];
        if (!filters.filename) return;
        const ok = list.some((m) => m.filename === filenameValueForSelect);
        if (!ok) setFilters((f) => ({ ...f, filename: undefined }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters.project, modulesByProject]);

    // текущий модуль и списки его переменных
    const currentModule = useMemo(() => {
        const proj = filters.project ?? "";
        const list = modulesByProject[proj] || [];
        const fnNoExt = filenameValueForSelect;
        return list.find((m) => m.filename === fnNoExt) || null;
    }, [filters.project, filenameValueForSelect, modulesByProject]);

    const kwKeys = useMemo(
        () => (currentModule?.kwargs ? Object.keys(currentModule.kwargs) : []),
        [currentModule]
    );

    const retKeys = useMemo(
        () =>
            currentModule?.return_structure
                ? Object.keys(currentModule.return_structure)
                : [],
        [currentModule]
    );

    // при смене модуля — оставляем только существующие ключи
    useEffect(() => {
        const allowed = new Set(kwKeys);
        setKwRows((rows) =>
            rows.map((r) => (allowed.has(r.key) ? r : { ...r, key: "" }))
        );
        const allowedRet = new Set(retKeys);
        setRetRows((rows) =>
            rows.map((r) => (allowedRet.has(r.key) ? r : { ...r, key: "" }))
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentModule]);

    // выбранный элемент списка логов
    const selected = useMemo(
        () => items.find((i) => i.id === selectedId) || items[0],
        [items, selectedId]
    );

    function rowsToMap(rows: KVRow[] = []): Record<string, string[]> {
        const map: Record<string, string[]> = {};
        for (const r of rows) {
            const k = r.key.trim();
            if (!k) continue;
            const vals = r.values.split(",").map((s) => s.trim()).filter(Boolean);
            if (vals.length) map[k] = vals;
        }
        return map;
    }

    async function runSearch() {
        setLoading(true);
        setError(null);
        try {
            const f: LogFilters = {
                ...filters,
                kwargs: rowsToMap(kwRows),
                returns: rowsToMap(retRows),
            };

            const data = await getIntegrationLogs(f);

            let parsed: LogItem[] = [];
            if (typeof data === "string") {
                parsed = trySplitPlainTextIntoItems(data);
            } else if (Array.isArray((data as any).items)) {
                parsed = (data as any).items as LogItem[];
            } else if (Array.isArray(data)) {
                parsed = data as any;
            } else {
                parsed = [{ id: "1", text: JSON.stringify(data, null, 2) }];
            }

            parsed.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
            setItems(parsed);
            setSelectedId(parsed[0]?.id ?? null);

            // новый список — сброс кэша деталей
            setDetailsById({});
            setDetailsError(null);
        } catch (e: any) {
            setError(String(e?.message || e));
            setItems([]);
            setSelectedId(null);
        } finally {
            setLoading(false);
        }
    }

    // первичная загрузка
    useEffect(() => {
        runSearch();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // подтягиваем текст лога при выборе элемента
    useEffect(() => {
        const key = selected?.id;
        if (!key) return;
        if (detailsById[key]) return; // уже есть

        let cancelled = false;
        setDetailsLoading(true);
        setDetailsError(null);

        getIntegrationLogByKey(key)
            .then((txt) => {
                if (cancelled) return;
                setDetailsById((prev) => ({ ...prev, [key]: txt }));
            })
            .catch((err) => {
                if (cancelled) return;
                setDetailsError(err?.message || String(err));
            })
            .finally(() => {
                if (!cancelled) setDetailsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id]);

    const selectedText = selected?.id ? detailsById[selected.id] ?? "" : "";

    // опции модулей для выбранного проекта
    const moduleOptions = useMemo(() => {
        const proj = filters.project ?? "";
        const list = modulesByProject[proj] || [];
        return list
            .slice()
            .sort((a, b) => a.filename.localeCompare(b.filename))
            .map((m) => ({ id: m.filename, name: m.filename }));
    }, [filters.project, modulesByProject]);

    return (
        <div className="container-fluid">
            {/* Фильтры */}
            <div className="row g-2 align-items-end mb-3">
                <div className="col-md-3" style={{ position: "relative", zIndex: 10 }}>
                    <label className="form-label">Проект</label>
                    <SearchableSelect
                        value={filters.project ?? ""}
                        onChange={(val: string) =>
                            setFilters((f) => ({ ...f, project: val || undefined }))
                        }
                        options={projectOptions}
                        placeholder="Проект"
                    />
                </div>

                <div className="col-md-3" style={{ position: "relative", zIndex: 9 }}>
                    <label className="form-label">Модуль</label>
                    <SearchableSelect
                        value={filenameValueForSelect}
                        onChange={(val: string) =>
                            setFilters((f) => ({
                                ...f,
                                filename: val ? withPy(val) : undefined, // всегда с .py
                            }))
                        }
                        options={moduleOptions}
                        placeholder={
                            modulesLoading
                                ? "Загрузка модулей…"
                                : moduleOptions.length
                                    ? "Выберите модуль"
                                    : filters.project
                                        ? "Нет модулей"
                                        : "Сначала выберите проект"
                        }
                    />
                </div>

                <div className="col-md-2">
                    <label className="form-label">Дата с</label>
                    <input
                        type="datetime-local"
                        className="form-control"
                        value={filters.dateFrom ?? ""}
                        onChange={(e) =>
                            setFilters((f) => ({ ...f, dateFrom: e.target.value || null }))
                        }
                    />
                </div>
                <div className="col-md-2">
                    <label className="form-label">Дата по</label>
                    <input
                        type="datetime-local"
                        className="form-control"
                        value={filters.dateTo ?? ""}
                        onChange={(e) =>
                            setFilters((f) => ({ ...f, dateTo: e.target.value || null }))
                        }
                    />
                </div>
                <div className="col-md-1">
                    <label className="form-label">Лимит</label>
                    <input
                        type="number"
                        min={1}
                        className="form-control"
                        value={filters.limit ?? 100}
                        onChange={(e) =>
                            setFilters((f) => ({ ...f, limit: Number(e.target.value || 100) }))
                        }
                    />
                </div>
                <div className="col-md-1 d-flex">
                    <button
                        className="btn btn-primary w-100"
                        onClick={runSearch}
                        disabled={loading}
                    >
                        {loading ? "Поиск..." : "Искать"}
                    </button>
                </div>
            </div>

            {/* kwargs / return фильтры (ключи — из метаданных модуля) */}
            <div className="row g-3 mb-3">
                <div className="col-md-6">
                    <label className="form-label d-flex justify-content-between">
                        <span>Фильтры по kwargs</span>
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() =>
                                setKwRows((r) => [...r, { id: crypto.randomUUID(), key: "", values: "" }])
                            }
                            disabled={!currentModule}
                            title={!currentModule ? "Сначала выберите модуль" : ""}
                        >
                            + добавить
                        </button>
                    </label>

                    {!currentModule && (
                        <div className="text-muted small">Выберите модуль, чтобы задать условия.</div>
                    )}

                    {kwRows.length === 0 && currentModule && (
                        <div className="text-muted small">Нет условий</div>
                    )}

                    {kwRows.map((r) => (
                        <div key={r.id} style={{display: "flex", flexDirection: "row", gap: 8}}>
                            <div style={{ minWidth: 220, flex: "0 0 220px" }}>
                                <SearchableSelect
                                    value={r.key}
                                    onChange={(val: string) =>
                                        setKwRows((rows) =>
                                            rows.map((x) => (x.id === r.id ? { ...x, key: val } : x))
                                        )
                                    }
                                    options={kwKeys.map((k) => ({ id: k, name: k }))}
                                    placeholder="переменная"
                                />
                            </div>
                            <input
                                className="form-control"
                                placeholder="значения через запятую (1004,1101)"
                                value={r.values}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setKwRows((rows) =>
                                        rows.map((x) => (x.id === r.id ? { ...x, values: v } : x))
                                    );
                                }}
                            />
                            <button
                                className="btn btn-outline-danger"
                                onClick={() => setKwRows((rows) => rows.filter((x) => x.id !== r.id))}
                                title="Удалить условие"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                <div className="col-md-6">
                    <label className="form-label d-flex justify-content-between">
                        <span>Фильтры по return</span>
                        <button
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() =>
                                setRetRows((r) => [...r, { id: crypto.randomUUID(), key: "", values: "" }])
                            }
                            disabled={!currentModule}
                            title={!currentModule ? "Сначала выберите модуль" : ""}
                        >
                            + добавить
                        </button>
                    </label>

                    {!currentModule && (
                        <div className="text-muted small">Выберите модуль, чтобы задать условия.</div>
                    )}

                    {retRows.length === 0 && currentModule && (
                        <div className="text-muted small">Нет условий</div>
                    )}

                    {retRows.map((r) => (
                        <div key={r.id} style={{display: "flex", flexDirection: "row", gap: 8}}>
                            <div style={{ minWidth: 220, flex: "0 0 220px" }}>
                                <SearchableSelect
                                    value={r.key}
                                    onChange={(val: string) =>
                                        setRetRows((rows) =>
                                            rows.map((x) => (x.id === r.id ? { ...x, key: val } : x))
                                        )
                                    }
                                    options={retKeys.map((k) => ({ id: k, name: k }))}
                                    placeholder="return-поле"
                                />
                            </div>
                            <input
                                className="form-control"
                                placeholder="значения через запятую"
                                value={r.values}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    setRetRows((rows) =>
                                        rows.map((x) => (x.id === r.id ? { ...x, values: v } : x))
                                    );
                                }}
                            />
                            <button
                                className="btn btn-outline-danger"
                                onClick={() => setRetRows((rows) => rows.filter((x) => x.id !== r.id))}
                                title="Удалить условие"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            {/* список / детали */}
            <div className="row" style={{ minHeight: 480 }}>
                <div className="col-4">
                    <div className="list-group" style={{ maxHeight: 520, overflow: "auto" }}>
                        {items.map((it) => (
                            <button
                                key={it.id}
                                type="button"
                                className={`list-group-item list-group-item-action ${
                                    (selected?.id === it.id && "active") || ""
                                }`}
                                onClick={() => setSelectedId(it.id)}
                                title={it.id}
                            >
                                <div className="d-flex justify-content-between">
                                    <strong className="me-2">{it.filename ?? filters.filename}</strong>
                                    <small>{it.timestamp ? new Date(it.timestamp).toLocaleString() : ""}</small>
                                </div>
                                <div className="text-truncate small">{it.id}</div>
                            </button>
                        ))}
                        {items.length === 0 && !loading && (
                            <div className="text-muted p-3">Ничего не найдено</div>
                        )}
                    </div>
                </div>

                <div className="col-8">
                    <div className="card h-100">
                        <div className="card-header d-flex align-items-center justify-content-between">
                            <div>
                                <strong>{selected?.filename ?? filters.filename}</strong>{" "}
                                <span className="text-muted">
                                    {selected?.timestamp ? new Date(selected.timestamp).toLocaleString() : ""}
                                </span>
                            </div>

                            {/*<div className="d-flex gap-2">*/}
                            {/*    {selected?.id && (*/}
                            {/*        <button*/}
                            {/*            className="btn btn-sm btn-outline-secondary"*/}
                            {/*            onClick={() => navigator.clipboard.writeText(selected.id)}*/}
                            {/*            title="Скопировать integration_key"*/}
                            {/*        >*/}
                            {/*            Copy key*/}
                            {/*        </button>*/}
                            {/*    )}*/}
                            {/*    {selected?.id && (*/}
                            {/*        <button*/}
                            {/*            className="btn btn-sm btn-outline-secondary"*/}
                            {/*            onClick={() => {*/}
                            {/*                const key = selected.id!;*/}
                            {/*                setDetailsById((prev) => {*/}
                            {/*                    const { [key]: _, ...rest } = prev;*/}
                            {/*                    return rest;*/}
                            {/*                });*/}
                            {/*                setSelectedId((prev) => (prev ? `${prev}` : prev));*/}
                            {/*            }}*/}
                            {/*            title="Обновить лог"*/}
                            {/*        >*/}
                            {/*            Refresh*/}
                            {/*        </button>*/}
                            {/*    )}*/}
                            {/*    <button*/}
                            {/*        className="btn btn-sm btn-outline-secondary"*/}
                            {/*        onClick={() => navigator.clipboard.writeText(selectedText || "")}*/}
                            {/*        disabled={!selectedText}*/}
                            {/*    >*/}
                            {/*        Копировать текст*/}
                            {/*    </button>*/}
                            {/*</div>*/}
                        </div>

                        <div
                            className="card-body"
                            style={{
                                whiteSpace: "normal",
                                overflow: "auto",
                                fontFamily:
                                    "system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif",
                            }}
                        >
                            {!selected && <span className="text-muted">Выберите лог слева</span>}
                            {selected && detailsLoading && <span className="text-muted">Загрузка лога…</span>}
                            {selected && detailsError && <div className="text-danger">{detailsError}</div>}
                            {selected && !detailsLoading && !detailsError && (
                                <LogDetails raw={selectedText} />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
