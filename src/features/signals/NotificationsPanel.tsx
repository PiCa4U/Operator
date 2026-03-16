import React, { useEffect, useMemo, useRef } from "react";
import { useManagerSignals } from "./useManagerSignals";
import { readHistory, readMeta } from "./local";
import type { SignalItem } from "./api";
import { formatOperatorLine, useOperatorsDirectory } from "./useOperatorsDirectory";

const color = (t: string) =>
    t === "warning" ? "#f59e0b" :
        t === "error" ? "#ef4444" :
            t === "success" ? "#10b981" : "#3b82f6";

const fmtDT = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
};

const ISO_RX = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+\-]\d{2}:\d{2})/g;
const localizeMessageDates = (s: string) =>
    String(s || "").replace(ISO_RX, (m) => fmtDT(m));

export const NotificationsPanel: React.FC<{
    managerLogin?: string;
    open: boolean;
    onClose: () => void;
}> = ({ managerLogin, open, onClose }) => {
    const { query, markAllAsReadNow } = useManagerSignals(managerLogin);
    const { data: opDir } = useOperatorsDirectory();

    const enteredUnread = useRef<number[] | null>(null);

    useEffect(() => {
        if (!open) {
            enteredUnread.current = null;
            return;
        }

        const ids = (query.data ?? []).map((n) => n.id);

        if (!enteredUnread.current) {
            enteredUnread.current = ids;
            markAllAsReadNow();
        }
    }, [open, query.data, markAllAsReadNow]);

    const all: SignalItem[] = useMemo(() => {
        const hist = managerLogin ? readHistory(managerLogin) : [];
        const unread = query.data ?? [];

        const map = new Map<number, SignalItem>();
        for (const item of hist) map.set(item.id, item);
        for (const item of unread) map.set(item.id, item);

        return Array.from(map.values()).sort((a, b) => b.id - a.id);
    }, [managerLogin, query.data]);

    const meta = useMemo(
        () => (managerLogin ? readMeta(managerLogin) : {}),
        [managerLogin, open, query.data]
    );

    const unreadIds = useMemo(
        () => new Set((query.data ?? []).map((x) => x.id)),
        [query.data]
    );

    if (!open) return null;

    return (
        <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.3)", zIndex: 9998 }}
            onClick={onClose}
        >
            <div
                className="bg-white shadow p-3"
                style={{
                    position: "absolute",
                    right: 16,
                    top: 64,
                    bottom: 16,
                    width: 520,
                    borderRadius: 12,
                    overflow: "auto",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="m-0">Уведомления</h5>
                    <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>
                        Закрыть
                    </button>
                </div>

                {!all.length && <div className="text-muted">Уведомлений нет</div>}

                <div className="list-group">
                    {all.map((n) => {
                        const wasUnreadAtEnter = enteredUnread.current?.includes(n.id);
                        const m = meta[String(n.id)] || {};
                        const receivedAt = m.receivedAt;
                        const readAt = m.readAt;
                        const isUnread = unreadIds.has(n.id) && !readAt;

                        const operatorText = n.login
                            ? formatOperatorLine(n.login, opDir, n.department, true)
                            : "";

                        return (
                            <div
                                key={n.id}
                                className="list-group-item"
                                style={{
                                    borderLeft: `4px solid ${color(n.signal_type)}`,
                                    background: wasUnreadAtEnter ? "rgba(253, 230, 138, .25)" : "#fff",
                                }}
                            >
                                {(n.title || n.signal_type) && (
                                    <div className="d-flex align-items-center gap-2 mb-1">
                                        <span>
                                            {n.signal_type === "warning"
                                                ? "⚠️"
                                                : n.signal_type === "error"
                                                    ? "⛔"
                                                    : n.signal_type === "success"
                                                        ? "✅"
                                                        : "ℹ️"}
                                        </span>
                                        {n.title && <strong>{n.title}</strong>}
                                    </div>
                                )}

                                {n.message && (
                                    <div className="text-muted" style={{ whiteSpace: "pre-wrap" }}>
                                        {localizeMessageDates(n.message)}
                                    </div>
                                )}

                                <div
                                    className="mt-2 d-flex justify-content-between align-items-start"
                                    style={{ fontSize: 12, color: "#6b7280" }}
                                >
                                    <div>
                                        <div>
                                            Получено: <span className="text-monospace">{fmtDT(receivedAt) || "—"}</span>
                                        </div>

                                        <div>
                                            Статус:{" "}
                                            {isUnread ? (
                                                <span className="badge bg-primary">Не прочитано</span>
                                            ) : (
                                                <span className="badge bg-light text-dark border">Прочитано</span>
                                            )}
                                            {readAt && <span className="ms-2">({fmtDT(readAt)})</span>}
                                        </div>
                                    </div>
                                </div>

                                {operatorText && (
                                    <div className="mt-1" style={{ fontSize: 12, color: "#6b7280" }}>
                                        Оператор: {operatorText}
                                    </div>
                                )}

                                {!operatorText && n.department && (
                                    <div className="mt-1" style={{ fontSize: 12, color: "#6b7280" }}>
                                        Отдел: {n.department}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};