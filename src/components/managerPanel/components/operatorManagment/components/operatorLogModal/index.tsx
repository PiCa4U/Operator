import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {getOperatorLog} from "../../api";
import {OperatorLogEntry} from "../../types";

type Props = {
    open: boolean;
    userId: string;          // a.login
    loginForTitle?: string;  // можно тоже a.login, если хочешь — ФИО
    onClose: () => void;
};
const formatDateTimeRu = (s: string) => {
    const d = new Date(s.replace(" ", "T"));
    const p = (n: number) => String(n).padStart(2,"0");
    return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// Делает Uint8Array (UTF-16LE + BOM) из строки
function toUTF16LEBytes(s: string): Uint8Array {
    const out = new Uint8Array(2 + s.length * 2);
    out[0] = 0xFF; out[1] = 0xFE; // BOM
    for (let i = 0; i < s.length; i++) {
        const code = s.charCodeAt(i);       // ок: русские буквы в BMP
        out[2 + i * 2] = code & 0xFF;       // low byte
        out[3 + i * 2] = (code >> 8) & 0xFF;// high byte
    }
    return out;
}

// ===== RU dictionaries =====
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

// универсальный перевод с фолбэком
const t = (map: Record<string, string>, v?: string | null) =>
    v ? (map[v] ?? v) : "—";

const todayStr = () => new Date().toISOString().slice(0, 10);

export const OperatorLogModal: React.FC<Props> = ({ open, userId, loginForTitle, onClose }) => {
    const [start, setStart] = useState<string>(todayStr());
    const [end, setEnd] = useState<string>(todayStr());

    // при каждом открытии сбрасываем на «сегодня»
    useEffect(() => {
        if (open) {
            const t = todayStr();
            setStart(t);
            setEnd(t);
        }
    }, [open]);

    const enabled = open && !!userId && start <= end;

    const query = useQuery({
        queryKey: ["operator-log", userId, start, end],
        queryFn: async () => {
            const data = await getOperatorLog({
                users: userId,
                date_start: start,
                date_end: end,
            });
            return data[userId] ?? [];
        },
        enabled,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const rows = query.data ?? [];

    const csvHref = useMemo(() => {
        if (!rows.length) return null;

        const SEP = ";";                                 // для русской локали Excel
        const header = ["Дата/время", "Статус", "Состояние", "Причина"];
        const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

        const lines = [
            "sep=;",                                       // подсказка Excelу про разделитель
            header.join(SEP),
            ...rows.map(r =>
                [ r.datetime,
                    t(STATUS_RU, r.status),
                    t(STATE_RU, r.state),
                    t(REASON_RU, r.reason)
                ].map(esc).join(SEP)
            ),
        ];

        // Windows-строки + UTF-16LE + BOM
        const content = lines.join("\r\n");
        const bytes = new Uint8Array(2 + content.length * 2);
        bytes[0] = 0xFF; bytes[1] = 0xFE;               // BOM (LE)
        for (let i = 0; i < content.length; i++) {
            const code = content.charCodeAt(i);
            bytes[2 + i * 2] = code & 0xFF;               // low byte
            bytes[3 + i * 2] = code >> 8;                 // high byte
        }

        const blob = new Blob([bytes], { type: "text/csv;charset=utf-16le" });
        return URL.createObjectURL(blob);
    }, [rows]);
// // формат DD.MM.YYYY HH:mm:ss
//     function formatDateTimeRu(s: string) {
//         const d = new Date(s.replace(" ", "T")); // на всякий
//         const pad = (n: number) => String(n).padStart(2, "0");
//         return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
//     }

// Excel-«безопасная» строка (формула ="...")
    const excelText = (s: string) => `="${s}"`;

// универсальный экранировщик
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;

// ===== CSV для Excel (UTF-16LE + sep=;) =====
    const csvHrefExcel = useMemo(() => {
        if (!rows.length) return null;
        const SEP = ";";
        const header = ["Дата/время", "Статус", "Состояние", "Причина"];

        const lines = [
            "sep=;",
            header.join(SEP),
            ...rows.map(r => [
                excelText(formatDateTimeRu(r.datetime)),   // <-- ДАТА КАК ТЕКСТ
                t(STATUS_RU, r.status),
                t(STATE_RU, r.state),
                t(REASON_RU, r.reason),
            ].map(esc).join(SEP)),
        ];

        const content = lines.join("\r\n");
        const bytes = new Uint8Array(2 + content.length * 2);
        bytes[0] = 0xFF; bytes[1] = 0xFE; // BOM
        for (let i = 0; i < content.length; i++) {
            const code = content.charCodeAt(i);
            bytes[2 + i * 2] = code & 0xFF;
            bytes[3 + i * 2] = code >> 8;
        }
        return URL.createObjectURL(new Blob([bytes], { type: "text/csv;charset=utf-16le" }));
    }, [rows]);

    const makeXlsx = async () => {
        const XLSX = await import("xlsx");                 // динамический импорт
        const aoa = [
            ["Дата/время","Статус","Состояние","Причина"],
            ...rows.map(r => [
                formatDateTimeRu(r.datetime),
                t(STATUS_RU, r.status),
                t(STATE_RU, r.state),
                t(REASON_RU, r.reason),
            ])
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // Всё — как строки
        Object.keys(ws).forEach(k => { if (k[0] !== "!") (ws as any)[k].t = "s"; });

        // Ширина колонок (в символах)
        (ws as any)["!cols"] = [{wch:19},{wch:26},{wch:18},{wch:32}];

        XLSX.utils.book_append_sheet(wb, ws, "Лог");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `log_${userId}_${start}_${end}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

// ===== Универсальный CSV (UTF-8 + BOM, без sep=;) =====
    const csvHrefUtf8 = useMemo(() => {
        if (!rows.length) return null;
        const SEP = ";";
        const header = ["Дата/время", "Статус", "Состояние", "Причина"];

        const body = rows.map(r => [
            formatDateTimeRu(r.datetime),               // обычная строка
            t(STATUS_RU, r.status),
            t(STATE_RU, r.state),
            t(REASON_RU, r.reason),
        ].map(esc).join(SEP)).join("\n");

        const csv = "\uFEFF" + [header.join(SEP), body].join("\n"); // UTF-8 BOM
        return URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    }, [rows]);

    if (!open) return null;

    const badge = (val: string | null, kind: "status" | "state" = "status") => {
        const raw = val ?? null;
        const label = kind === "status" ? t(STATUS_RU, raw) : t(STATE_RU, raw);

        const base = "badge";
        const cls =
            raw === "available" ? "bg-success" :
                raw === "available_on_demand" ? "bg-primary" :
                    raw === "on_break" ? "bg-warning text-dark" :
                        raw === "logged_out" ? "bg-danger" :
                            "bg-light text-dark border";

        return <span className={`${base} ${cls}`} title={raw ?? "—"}>{label}</span>;
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
        className="d-flex align-items-center gap-2"
        style={{ padding: "12px 16px", borderBottom: "1px solid #eee", background: "#f9fafb", gap:10 }}
    >
        <div className="fw-semibold me-auto">
            Лог оператора · <span className="text-muted">{loginForTitle ?? userId}</span>
        </div>

        <div className="d-flex align-items-center gap-2" style={{gap: 5}}>
            <label className="form-label m-0">с</label>
            <input type="date" className="form-control" value={start} onChange={(e) => setStart(e.target.value)} />
            <label className="form-label m-0">по</label>
            <input type="date" className="form-control" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>

        <div className="btn-group">
            {/*{csvHrefUtf8 && (*/}
            {/*    <a className="btn btn-outline-secondary btn-sm" href={csvHrefUtf8}*/}
            {/*       download={`log_${userId}_${start}_${end}.csv`}>*/}
            {/*        CSV (UTF-8)*/}
            {/*    </a>*/}
            {/*)}*/}
            {/*<button className="btn btn-outline-secondary btn-sm" onClick={makeXlsx}>*/}
            {/*    Excel (XLSX)*/}
            {/*</button>*/}
            <button className="btn btn-outline-dark btn-sm" onClick={onClose}>Закрыть</button>
        </div>

    </div>

    {/* content */}
    <div style={{ overflow: "auto", padding: 12 }}>
    {start > end && (
        <div className="alert alert-danger py-2">Дата «по» раньше, чем дата «с».</div>
    )}

    {query.isLoading && <div className="text-muted p-2">Загрузка…</div>}
        {query.isError && (
            <div className="alert alert-danger py-2">
                Не удалось получить лог: {(query.error as Error)?.message || "ошибка"}
            </div>
        )}
        {!query.isLoading && !query.isError && rows.length === 0 && (
            <div className="text-muted p-2">Нет записей за выбранный период.</div>
        )}

        {rows.length > 0 && (
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
        {rows.map((r: OperatorLogEntry, i: number) => (
                <tr key={i}>
                <td className="text-muted">{r.datetime}</td>
                    <td>{badge(r.status, "status")}</td>
                    <td>{badge(r.state, "state")}</td>
                    <td>{t(REASON_RU, r.reason)}</td>
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
