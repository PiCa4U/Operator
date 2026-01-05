import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getActivityLog } from "../../api";
import type { ActivityItem, ActivityInterval } from "../../types";
import Swal from "sweetalert2";


const APP_TZ: string = (() => {
    const root = document.getElementById("root") as HTMLElement | null;
    const fromData = root?.dataset?.tz?.trim();
    return fromData || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
})();

const NAIVE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

function normalizeToISO(input: string): string {
    if (NAIVE_RE.test(input)) {
        const iso = input.replace(" ", "T");
        return `${iso}Z`;
    }
    return input;
}

function toMillis(dLike: Date | number | string): number {
    if (dLike instanceof Date) return dLike.getTime();
    if (typeof dLike === "number") return dLike < 1e12 ? dLike * 1000 : dLike;
    if (typeof dLike === "string") {
        const norm = normalizeToISO(dLike.trim());
        const t = Date.parse(norm);
        if (!Number.isNaN(t)) return t;
    }
    return NaN;
}

function toYMD(dLike: Date | number | string, tz: string = APP_TZ): string {
    const d = new Date(dLike);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")!.value;
    const m = parts.find((p) => p.type === "month")!.value;
    const day = parts.find((p) => p.type === "day")!.value;
    return `${y}-${m}-${day}`;
}

function formatTz(dLike: Date | number | string, tz: string = APP_TZ): string {
    const ms = toMillis(dLike);
    const d = Number.isFinite(ms) ? new Date(ms) : new Date(dLike);
    const opts: Intl.DateTimeFormatOptions = {
        timeZone: tz,
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    };
    return new Intl.DateTimeFormat("ru-RU", opts).format(d).replace(",", "");
}

const CloseIconButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label="Закрыть"
        title="Закрыть"
        style={{
            border: "none",
            background: "transparent",
            padding: 0,
            width: 28,
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#6c757d",
        }}
    >
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    </button>
);

function durationSeconds(from: string, to: string): number {
    const a = toMillis(from);
    const b = toMillis(to);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
    return (b - a) / 1000;
}

function mean(arr: number[] | undefined | null): number | null {
    if (!arr || !arr.length) return null;
    const sum = arr.reduce((s, v) => s + v, 0);
    return sum / arr.length;
}

const ACTIVITY_BASE_URL = "https://my.glagol.ai/operator_online";


function buildHref(url: string): string {
    if (!url) return ACTIVITY_BASE_URL;

    const trimmed = url.trim();

    if (/^https?:\/\//i.test(trimmed)) return trimmed;

    const base = ACTIVITY_BASE_URL.replace(/\/+$/, "");

    if (trimmed.startsWith("/")) {
        return base + trimmed;
    }

    return `${base}/${trimmed}`;
}


type ActivitySection = {
    id: string;
    labels: string[];
    labelSummary: string;
    url: string;
    sessionId: string;
    totalSeconds: number;
    intervalsCount: number;
    avgScore: number | null;
    lastEndMs: number;
    intervals: ActivityInterval[];
};

function flattenActivity(items: ActivityItem[]): ActivitySection[] {
    const sections: ActivitySection[] = [];

    items.forEach((item, idx) => {
        const labels = Array.isArray(item.activity_labels) ? item.activity_labels : [];
        const labelSummary = labels.length ? labels.join(" · ") : "Без меток";
        const urlSessions = item.url_session || {};

        Object.entries(urlSessions).forEach(([sessionId, sess]) => {
            const intervals = Array.isArray(sess.activity_intervals) ? sess.activity_intervals : [];
            if (!intervals.length) return;

            let totalSeconds = 0;
            let allScores: number[] = [];
            let lastEndMs = 0;

            for (const iv of intervals) {
                totalSeconds += durationSeconds(iv.from, iv.to);
                if (Array.isArray(iv.score)) {
                    allScores = allScores.concat(
                        iv.score.filter((v) => typeof v === "number")
                    );
                }
                const endMs = toMillis(iv.to);
                if (Number.isFinite(endMs) && endMs > lastEndMs) lastEndMs = endMs;
            }

            const avgScore = allScores.length
                ? allScores.reduce((s, v) => s + v, 0) / allScores.length
                : null;

            sections.push({
                id: `${idx}-${sessionId}`,
                labels,
                labelSummary,
                url: sess.url || "/",
                sessionId,
                totalSeconds,
                intervalsCount: intervals.length,
                avgScore,
                lastEndMs,
                intervals,
            });
        });
    });

    sections.sort(
        (a, b) =>
            (b.lastEndMs || 0) - (a.lastEndMs || 0) ||
            b.totalSeconds - a.totalSeconds
    );

    return sections;
}


type Props = {
    open: boolean;
    userId: string;
    loginForTitle?: string;
    onClose: () => void;
};

export const OperatorActivityModal: React.FC<Props> = ({
                                                           open,
                                                           userId,
                                                           loginForTitle,
                                                           onClose,
                                                       }) => {
    const [start, setStart] = useState<string>(() => toYMD(Date.now()));
    const [end, setEnd] = useState<string>(() => toYMD(Date.now()));

    useEffect(() => {
        if (open) {
            const today = toYMD(Date.now());
            setStart(today);
            setEnd(today);
        }
    }, [open]);

    const enabled = open && !!userId && start <= end;

    const query = useQuery({
        queryKey: ["operator-activity", userId, start, end, APP_TZ],
        queryFn: async () => {
            // Берём весь день
            const from_dt = `${start} 00:00:00`;
            const to_dt = `${end} 23:59:59`;
            const data = await getActivityLog({
                users: userId,
                from_dt,
                to_dt,
            });
            return (data?.[userId] ?? []) as ActivityItem[];
        },
        enabled,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const items = query.data ?? [];
    const sections = useMemo(() => flattenActivity(items), [items]);

    const [labelFilter, setLabelFilter] = useState<string>("");

    const filteredSections = useMemo(() => {
        const q = labelFilter.trim().toLowerCase();
        if (!q) return sections;

        return sections.filter((s) =>
            s.labels.some((l) => l.toLowerCase().includes(q))
        );
    }, [sections, labelFilter]);

    const [selectedId, setSelectedId] = useState<string | null>(null);


    const handleOpenCard = () => {
        if (!selectedSection) return;
        const href = buildHref(selectedSection.url);
        window.open(href, "_blank", "noopener,noreferrer");
    };

    const handleCopyLink = async () => {
        if (!selectedSection) return;
        const href = buildHref(selectedSection.url);

        try {
            await navigator.clipboard.writeText(href);
            Swal.fire({
                icon: "success",
                title: "Ссылка скопирована",
                text: href,
                timer: 1500,
                showConfirmButton: false,
            });
        } catch (e) {
            console.error(e);
            Swal.fire({
                icon: "error",
                title: "Не удалось скопировать ссылку",
                text: String((e as Error)?.message || e),
            });
        }
    };
    useEffect(() => {
        if (!filteredSections.length) {
            setSelectedId(null);
            return;
        }
        if (!selectedId || !filteredSections.find((s) => s.id === selectedId)) {
            setSelectedId(filteredSections[0].id);
        }
    }, [filteredSections, selectedId]);

    const selectedSection =
        filteredSections.find((s) => s.id === selectedId) || null;
    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
        >
            <div
                className="bg-white"
                style={{
                    width: "94vw",
                    maxWidth: 2000,
                    maxHeight: "88vh",
                    borderRadius: 16,
                    overflow: "hidden",
                    boxShadow: "0 20px 50px rgba(0,0,0,.25)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div
                    style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #eee",
                        background: "#f9fafb",
                    }}
                >
                    <div className="d-flex align-items-center mb-2" style={{ justifyContent: "space-between" }}>
                        <div className="fw-semibold">
                            Активность оператора ·{" "}
                            <span className="text-muted">{loginForTitle ?? userId}</span>
                        </div>

                        <div className="ms-auto">
                            <CloseIconButton onClick={onClose} />
                        </div>
                    </div>

                    <div
                        className="d-flex align-items-center flex-wrap"
                        style={{ gap: 8 }}
                    >
                        <label className="form-label m-0">с</label>
                        <input
                            type="date"
                            className="form-control"
                            style={{ maxWidth: 170 }}
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                        />
                        <label className="form-label m-0">по</label>
                        <input
                            type="date"
                            className="form-control"
                            style={{ maxWidth: 170 }}
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                        />
                    </div>
                </div>

                <div
                    style={{
                        flex: 1,
                        display: "flex",
                        minHeight: 0,
                        padding: 12,
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            flex: "0 0 360px",
                            maxWidth: 380,
                            borderRight: "1px solid #eee",
                            paddingRight: 8,
                            display: "flex",
                            flexDirection: "column",
                            minHeight: 0,
                        }}
                    >
                        {start > end && (
                            <div className="alert alert-danger py-2">
                                Дата «по» раньше, чем дата «с».
                            </div>
                        )}

                        {query.isLoading && (
                            <div className="text-muted p-2">Загрузка…</div>
                        )}

                        {query.isError && (
                            <div className="alert alert-danger py-2">
                                Не удалось получить активность:{" "}
                                {(query.error as Error)?.message || "ошибка"}
                            </div>
                        )}

                        {!query.isLoading &&
                            !query.isError &&
                            sections.length === 0 && (
                                <div className="text-muted p-2">
                                    Нет активности за выбранный период.
                                </div>
                            )}

                        {sections.length > 0 && (
                            <div className="mb-2">
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder="Фильтр по меткам…"
                                    value={labelFilter}
                                    onChange={(e) => setLabelFilter(e.target.value)}
                                />
                                {labelFilter.trim() && (
                                    <div className="small text-muted mt-1">
                                        Найдено сессий: {filteredSections.length}
                                    </div>
                                )}
                            </div>
                        )}

                        {sections.length > 0 &&
                            !query.isLoading &&
                            !query.isError &&
                            filteredSections.length === 0 &&
                            labelFilter.trim() && (
                                <div className="text-muted p-2">
                                    По заданным меткам ничего не найдено.
                                </div>
                            )}

                        {filteredSections.length > 0 && (
                            <div
                                style={{
                                    overflowY: "auto",
                                    paddingRight: 4,
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 8,
                                }}
                            >
                                {filteredSections.map((s) => {
                                    const totalMin = s.totalSeconds / 60;
                                    const scorePercent = s.avgScore
                                        ? Math.round(s.avgScore * 100)
                                        : null;

                                    return (
                                        <button
                                            key={s.id}
                                            type="button"
                                            className="btn btn-light text-start w-100"
                                            onClick={() => setSelectedId(s.id)}
                                            style={{
                                                borderRadius: 10,
                                                border:
                                                    s.id === selectedId
                                                        ? "1px solid #0d6efd"
                                                        : "1px solid #dee2e6",
                                                boxShadow:
                                                    s.id === selectedId
                                                        ? "0 0 0 2px rgba(13,110,253,.2)"
                                                        : "none",
                                                padding: "8px 10px",
                                            }}
                                        >
                                            <div
                                                className="small text-muted text-truncate"
                                                title={s.url}
                                            >
                                                Сессия: {s.sessionId}
                                            </div>
                                            <div
                                                className="small"
                                                style={{
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                }}
                                                title={s.labelSummary}
                                            >
                                                {s.labelSummary}
                                            </div>
                                            <div
                                                className="d-flex align-items-center mt-1"
                                                style={{ gap: 6 }}
                                            >
                            <span className="badge bg-light text-dark border">
                                интервалов: {s.intervalsCount}
                            </span>
                                                <span className="badge bg-light text-dark border">
                                ~ {totalMin.toFixed(1)} мин
                            </span>
                                                {scorePercent !== null && (
                                                    <span className="badge bg-success text-white">
                                    Активность ~ {scorePercent}%
                                </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* правая колонка — детализация */}
                    <div
                        style={{
                            flex: "1 1 auto",
                            minWidth: 0,
                            display: "flex",
                            flexDirection: "column",
                        }}
                    >
                        {!selectedSection && (
                            <div className="text-muted p-2">
                                Выберите секцию слева, чтобы увидеть детализацию.
                            </div>
                        )}

                        {selectedSection && (
                            <>
                                <div
                                    className="mb-2"
                                    style={{
                                        borderBottom: "1px solid #eee",
                                        paddingBottom: 8,
                                    }}
                                >
                                    <div className="small text-muted">Карточка</div>
                                    <div className="d-flex flex-wrap align-items-center gap-2">
                                        <button
                                            type="button"
                                            className="btn btn-outline-primary btn-sm"
                                            onClick={handleOpenCard}
                                        >
                                            Открыть карточку
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-outline-secondary btn-sm"
                                            onClick={handleCopyLink}
                                        >
                                            Скопировать ссылку
                                        </button>
                                    </div>

                                    <div className="mt-2">
                                        {selectedSection.labels.map((l) => (
                                            <span
                                                key={l}
                                                className="badge bg-light text-dark border me-1"
                                            >
                                                {l}
                                            </span>
                                        ))}
                                        {selectedSection.labels.length === 0 && (
                                            <span className="text-muted small">Без меток</span>
                                        )}
                                    </div>

                                </div>

                                {/* псевдо-график по интервалам */}
                                <div className="mb-3">
                                    <div className="small text-muted mb-1">
                                        Динамика score по интервалам
                                    </div>
                                    <div
                                        className="d-flex flex-column"
                                        style={{ gap: 4 }}
                                    >
                                        {selectedSection.intervals.map((iv, idx) => {
                                            const avgScore = mean(iv.score);
                                            const widthPct =
                                                avgScore === null
                                                    ? 0
                                                    : Math.min(
                                                        100,
                                                        Math.max(
                                                            5,
                                                            Math.round(
                                                                avgScore * 100
                                                            )
                                                        )
                                                    );
                                            const label = `#${idx + 1} · ${formatTz(
                                                iv.from,
                                                APP_TZ
                                            )}`;

                                            return (
                                                <div key={idx}>
                                                    <div
                                                        className="d-flex justify-content-between small text-muted"
                                                        style={{ marginBottom: 2 }}
                                                    >
                                                        <span>{label}</span>
                                                        {avgScore !== null && (
                                                            <span>
                                                                ~{" "}
                                                                {Math.round(
                                                                    avgScore * 100
                                                                )}
                                                                %
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div
                                                        style={{
                                                            height: 8,
                                                            borderRadius: 999,
                                                            background:
                                                                "#f1f3f5",
                                                            overflow: "hidden",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                width: `${widthPct}%`,
                                                                height: "100%",
                                                                background:
                                                                    "#0d6efd",
                                                                transition:
                                                                    "width .2s ease-out",
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div
                                    className="table-responsive"
                                    style={{ minHeight: 0, maxHeight: "50vh", overflowX: "auto" }}

                                >
                                    <table className="table table-sm" style={{ minWidth: 950 }}>
                                        <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Начало</th>
                                            <th>Конец</th>
                                            <th>Длительность</th>
                                            <th>Активность в Окне</th>
                                            <th>Скролл</th>
                                            <th>Ввод</th>
                                            <th>Общее значение</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {selectedSection.intervals.map(
                                            (iv, idx) => {
                                                const dSec = durationSeconds(
                                                    iv.from,
                                                    iv.to
                                                );
                                                const dMin =
                                                    dSec / 60 || 0;
                                                const avgWindow =
                                                    mean(iv.window_active);
                                                const avgScroll =
                                                    mean(iv.scroll_active);
                                                const avgInput =
                                                    mean(iv.input_active);
                                                const avgScore =
                                                    mean(iv.score);

                                                const fmtPct = (
                                                    v: number | null
                                                ) =>
                                                    v === null
                                                        ? "—"
                                                        : `${Math.round(
                                                            v * 100
                                                        )}%`;

                                                return (
                                                    <tr key={idx}>
                                                        <td>{idx + 1}</td>
                                                        <td>
                                                            {formatTz(
                                                                iv.from,
                                                                APP_TZ
                                                            )}
                                                        </td>
                                                        <td>
                                                            {formatTz(
                                                                iv.to,
                                                                APP_TZ
                                                            )}
                                                        </td>
                                                        <td>
                                                            {dMin.toFixed(
                                                                1
                                                            )}{" "}
                                                            мин
                                                        </td>
                                                        <td>
                                                            {fmtPct(
                                                                avgWindow
                                                            )}
                                                        </td>
                                                        <td>
                                                            {fmtPct(
                                                                avgScroll
                                                            )}
                                                        </td>
                                                        <td>
                                                            {fmtPct(
                                                                avgInput
                                                            )}
                                                        </td>
                                                        <td>
                                                            {fmtPct(
                                                                avgScore
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                        )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
