import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperatorLog } from "../../api";
import { OperatorLogEntry } from "../../types";

type Props = {
    open: boolean;
    userId: string;          // a.login
    loginForTitle?: string;  // можно ФИО
    onClose: () => void;
};

/* ================= TZ & parsing utils ================= */
const APP_TZ: string = (() => {
    const root = document.getElementById("root") as HTMLElement | null;
    const fromData = root?.dataset?.tz?.trim();
    return fromData || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
})();

// распознаём наивные строки "YYYY-MM-DD HH:mm:ss" / "YYYY-MM-DDTHH:mm:ss"
const NAIVE_RE =
    /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

// нормализуем строку к ISO: если наивная — считаем её UTC и добавляем "Z"
function normalizeToISO(input: string): string {
    if (NAIVE_RE.test(input)) {
        const iso = input.replace(" ", "T");
        return `${iso}Z`; // трактуем как UTC
    }
    return input;
}

// YYYY-MM-DD в нужном поясе
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

// из любого входа -> миллисекунды
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

// DD.MM.YYYY HH:mm:ss в нужном поясе
function formatTz(dLike: Date | number | string, tz: string = APP_TZ): string {
    // сначала жёстко парсим как описано выше (учитывая наивные строки)
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

/* ================= Словари ================= */
const STATUS_RU: Record<string, string> = {
    available: "На линии",
    available_on_demand: "На линии",
    on_break: "Перерыв",
    logged_out: "Вышел",
};

const STATE_RU: Record<string, string> = {
    waiting: "На линии",
    idle: "Постобработка",
    ringing: "Вызов (звонит)",
    queue_call: "В активном звонке",
    busy: "Занято",
};

const REASON_RU: Record<string, string> = {
    manual_start: "Ручной старт",
    manual_return: "Возврат из постобработки",
    call_manual_stop: "Завершение вызова вручную",
    postobrabotka: "Постобработка",
    db_compare: "принудительный перерыв",
    break: "Перерыв",
    study: "Обучение",
    admin: "Административный",
    lunch: "Обед",
};

const t = (map: Record<string, string>, v?: string | null) => (v ? map[v] ?? v : "—");

/* ================= Компонент ================= */
export const OperatorLogModal: React.FC<Props> = ({ open, userId, loginForTitle, onClose }) => {
    // по умолчанию — сегодня в твоём TZ
    const [start, setStart] = useState<string>(() => toYMD(Date.now()));
    const [end, setEnd] = useState<string>(() => toYMD(Date.now()));

    // при каждом открытии сбрасываем на «сегодня»
    useEffect(() => {
        if (open) {
            const today = toYMD(Date.now());
            setStart(today);
            setEnd(today);
        }
    }, [open]);

    const enabled = open && !!userId && start <= end;

    const query = useQuery({
        queryKey: ["operator-log", userId, start, end, APP_TZ],
        queryFn: async () => {
            const data = await getOperatorLog({
                users: userId,
                date_start: start,
                date_end: end,
                tz: APP_TZ, // если бэк не ждёт — игнорирует
            } as any);
            return (data?.[userId] ?? []) as OperatorLogEntry[];
        },
        enabled,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const rows = query.data ?? [];

    // новые сверху
    const sortedRows = useMemo(
        () =>
            rows
                .slice()
                .sort(
                    (a, b) =>
                        (toMillis((b as any).datetime) || 0) -
                        (toMillis((a as any).datetime) || 0)
                ),
        [rows]
    );

    if (!open) return null;

    const badge = (val: string | null | undefined, kind: "status" | "state" = "status") => {
        const raw = val ?? null;
        const label = kind === "status" ? t(STATUS_RU, raw) : t(STATE_RU, raw);

        const base = "badge";
        const cls =
            raw === "available"
                ? "bg-success"
                : raw === "available_on_demand"
                    ? "bg-primary"
                    : raw === "on_break"
                        ? "bg-warning text-dark"
                        : raw === "logged_out"
                            ? "bg-danger"
                            : "bg-light text-dark border";

        return (
            <span className={`${base} ${cls}`} title={raw ?? "—"}>
        {label}
      </span>
        );
    };

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
                    width: "92vw",
                    maxWidth: 1000,
                    maxHeight: "85vh",
                    borderRadius: 16,
                    overflow: "hidden",
                    boxShadow: "0 20px 50px rgba(0,0,0,.25)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* header */}
                <div
                    className="d-flex align-items-center"
                    style={{ padding: "12px 16px", borderBottom: "1px solid #eee", background: "#f9fafb", gap: 10 }}
                >
                    <div className="fw-semibold me-auto">
                        Лог оператора · <span className="text-muted">{loginForTitle ?? userId}</span>
                        {/*<div className="small text-muted" style={{ lineHeight: 1 }}>*/}
                        {/*    Часовой пояс: {APP_TZ}*/}
                        {/*</div>*/}
                    </div>

                    <div className="d-flex align-items-center" style={{ gap: 6 }}>
                        <label className="form-label m-0">с</label>
                        <input type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
                        <label className="form-label m-0">по</label>
                        <input type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
                    </div>

                    <div className="btn-group" style={{ marginLeft: 8 }}>
                        <button className="btn btn-outline-dark btn-sm" onClick={onClose}>
                            Закрыть
                        </button>
                    </div>
                </div>

                {/* content */}
                <div style={{ overflow: "auto", padding: 12 }}>
                    {start > end && <div className="alert alert-danger py-2">Дата «по» раньше, чем дата «с».</div>}

                    {query.isLoading && <div className="text-muted p-2">Загрузка…</div>}
                    {query.isError && (
                        <div className="alert alert-danger py-2">
                            Не удалось получить лог: {(query.error as Error)?.message || "ошибка"}
                        </div>
                    )}
                    {!query.isLoading && !query.isError && sortedRows.length === 0 && (
                        <div className="text-muted p-2">Нет записей за выбранный период.</div>
                    )}

                    {sortedRows.length > 0 && (
                        <div className="table-responsive">
                            <table className="table table-sm">
                                <thead style={{ position: "sticky", top: 0, background: "#fff" }}>
                                <tr>
                                    <th style={{ width: 190 }}>Дата/время</th>
                                    <th style={{ width: 160 }}>Статус</th>
                                    <th style={{ width: 160 }}>Состояние</th>
                                    <th>Причина</th>
                                </tr>
                                </thead>
                                <tbody>
                                {sortedRows.map((r: OperatorLogEntry, i: number) => (
                                    <tr key={i}>
                                        <td className="text-muted">
                                            {formatTz((r as any).datetime, APP_TZ)}
                                        </td>
                                        <td>{badge((r as any).status, "status")}</td>
                                        <td>{badge((r as any).state, "state")}</td>
                                        <td>{t(REASON_RU, (r as any).reason)}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
