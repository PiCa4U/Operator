// src/features/signals/NotificationsPanel.tsx
import React, { useEffect, useMemo, useRef } from "react";
import { useManagerSignals } from "./useManagerSignals";
import { readHistory } from "./local";
import type { SignalItem } from "./api";

const color = (t:string) =>
    t==="warning" ? "#f59e0b" :
        t==="error"   ? "#ef4444" :
            t==="success" ? "#10b981" : "#3b82f6";

export const NotificationsPanel: React.FC<{ managerLogin?: string; open: boolean; onClose: () => void }> = ({ managerLogin, open, onClose }) => {
    const { query, markAllAsReadNow } = useManagerSignals(managerLogin);
    const enteredUnread = useRef<number[] | null>(null);

    // при открытии один раз фиксируем «кто непрочитан» и шлём массовую прочитку
    useEffect(() => {
        if (!open) return;
        const ids = (query.data ?? []).map(n=>n.id);
        if (!enteredUnread.current) {
            enteredUnread.current = ids;
            markAllAsReadNow();
        }
    }, [open, query.data]);

    // «полный список» = локальная история (то, что уже всплывало в тостах/сессии) + текущие непрочитанные
    const all: SignalItem[] = useMemo(() => {
        const hist = managerLogin ? readHistory(managerLogin) : [];
        const unread = (query.data ?? []);

        const map = new Map<number, SignalItem>();
        for (const i of hist)   map.set(i.id, i);
        for (const i of unread) map.set(i.id, i);

        // было: [...map.values()].sort(...)
        return Array.from(map.values()).sort((a, b) => b.id - a.id);
    }, [managerLogin, query.data]);

    if (!open) return null;

    return (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.3)",zIndex:9998}} onClick={onClose}>
            <div className="bg-white shadow p-3"
                 style={{position:"absolute",right:16,top:64,bottom:16,width:520,borderRadius:12,overflow:"auto"}}
                 onClick={e=>e.stopPropagation()}
            >
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h5 className="m-0">Уведомления</h5>
                    <button className="btn btn-outline-secondary btn-sm" onClick={onClose}>Закрыть</button>
                </div>

                {!all.length && <div className="text-muted">Уведомлений нет</div>}

                <div className="list-group">
                    {all.map(n=>{
                        const wasUnreadAtEnter = enteredUnread.current?.includes(n.id);
                        return (
                            <div key={n.id} className="list-group-item"
                                 style={{borderLeft:`4px solid ${color(n.signal_type)}`, background: wasUnreadAtEnter ? "rgba(253, 230, 138, .25)" : "#fff"}}
                            >
                                <div className="d-flex align-items-center gap-2 mb-1">
                                    <span>{n.signal_type==="warning"?"⚠️":n.signal_type==="error"?"⛔":n.signal_type==="success"?"✅":"ℹ️"}</span>
                                    <strong>{n.title}</strong>
                                </div>
                                <div className="text-muted" style={{whiteSpace:"pre-wrap"}}>{n.message}</div>
                                <div className="mt-1" style={{fontSize:12,color:"#6b7280"}}>
                                    Оператор: {n.login}{n.department ? ` · Отдел: ${n.department}` : ""}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
