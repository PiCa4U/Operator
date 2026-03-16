import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SignalItem } from "./api";
import { readShown, writeShown } from "./local";
import { useManagerSignals } from "./useManagerSignals";
import { formatOperatorLine, useOperatorsDirectory } from "./useOperatorsDirectory";

const icon: Record<string, string> = {
    info: "ℹ️",
    warning: "⚠️",
    error: "⛔",
    success: "✅",
};

export const SignalsToaster: React.FC<{ managerLogin?: string }> = ({ managerLogin }) => {
    const { newForUi, markOneAsRead } = useManagerSignals(managerLogin);
    const { data: opDir } = useOperatorsDirectory();
    const [stack, setStack] = useState<SignalItem[]>([]);

    useEffect(() => {
        if (!newForUi.length) return;

        setStack((prev) => {
            const ids = new Set(prev.map((item) => item.id));
            const add = newForUi.filter((item) => !ids.has(item.id));
            return [...add, ...prev].slice(0, 6);
        });
    }, [newForUi]);

    const removeFromStack = (id: number) => {
        setStack((prev) => prev.filter((item) => item.id !== id));
    };

    const hideOnly = (id: number) => {
        removeFromStack(id);

        if (!managerLogin) return;

        const shown = readShown(managerLogin);
        shown.add(id);
        writeShown(managerLogin, shown);
    };

    const closeAndRead = (id: number) => {
        removeFromStack(id);
        markOneAsRead(id);
    };

    return createPortal(
        <div
            style={{
                position: "fixed",
                right: 16,
                bottom: 16,
                zIndex: 9999,
                display: "flex",
                flexDirection: "column-reverse",
                gap: 12,
            }}
        >
            {stack.map((n) => {
                const operatorText = n.login
                    ? formatOperatorLine(n.login, opDir, n.department, true)
                    : "";

                return (
                    <div
                        key={n.id}
                        onClick={() => closeAndRead(n.id)}
                        style={{
                            width: 360,
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            boxShadow: "0 8px 20px rgba(0,0,0,.12)",
                            padding: "12px 14px",
                            cursor: "pointer",
                        }}
                    >
                        {(n.title || n.signal_type) && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 18 }}>{icon[n.signal_type] ?? "🔔"}</span>
                                {n.title && <strong style={{ fontSize: 14 }}>{n.title}</strong>}
                            </div>
                        )}

                        {n.message && (
                            <div style={{ fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                                {n.message}
                            </div>
                        )}

                        {operatorText && (
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                                Оператор: {operatorText}
                            </div>
                        )}

                        {!operatorText && n.department && (
                            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                                Отдел: {n.department}
                            </div>
                        )}

                        <div className="text-end mt-2">
                            <button
                                className="btn btn-link btn-sm"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    hideOnly(n.id);
                                }}
                            >
                                Скрыть
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>,
        document.body
    );
};