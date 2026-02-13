import { useEffect, useRef, useState } from "react";
import { createChatSocket } from "./socket";
import { uploadAndAttach, type UploadItem } from "./api";
import { store } from "../../../redux/store";

export type UiAttachment = { id: string; name: string; url?: string };
export type Role = "client" | "operator" | "manager";
export type UiMessage = {
    id: string;
    text: string;
    created_at: string;
    authorLogin: string | null;
    authorName: string;
    authorRole: Role;
    attachments: UiAttachment[];
    tempId?: string;
    status?: "pending" | "sent";
    isRead?: boolean;
    message_type?: string;
};

function toIso(s: string): string {
    const [d, t = "00:00:00"] = s.trim().split(" ");
    const [y, m, day] = d.split("-").map(Number);
    const [hh, mm, ss] = t.split(":").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, day || 1, hh || 0, mm || 0, ss || 0)).toISOString();
}

/** коллбэки событий */
type Handlers = {
    onIncoming?: (msg: UiMessage) => void;
    onAck?: (ack: { tempId: string; message_id: number }) => void;
    onRead?: (e: ReadEvent) => void;
    onUploaded?: (p: { tempId: string; filenames: string[] }) => void;
};

export type ReadByType = Record<string, number[]>;
export type ReadEvent = {
    ids: number[];
    byType: ReadByType;
    /** кто прочитал (как на скрине login: "1000") */
    login?: string | null;
};

export function useChatSocket(
    opts: { guid: string; login: string | null; glagol_parent: string | null } & Handlers
) {
    const { guid, login, glagol_parent, onIncoming, onAck, onRead, onUploaded } = opts;

    const { sipLogin = "", worker = "" } = store.getState().credentials;
    const { sessionKey } = store.getState().operator;

    const sockRef = useRef<ReturnType<typeof createChatSocket> | null>(null);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pendingQueue = useRef<string[]>([]);

    const handlersRef = useRef<Handlers>({});
    useEffect(() => {
        handlersRef.current = { onIncoming, onAck, onRead, onUploaded };
    }, [onIncoming, onAck, onRead, onUploaded]);

    useEffect(() => {
        if (!guid) return;

        const s = createChatSocket();
        sockRef.current = s;

        const doLogin = () => s.emit("login", { guid, login, worker, session_key: sessionKey });

        s.on("connect", () => {
            setConnected(true);
            setError(null);
            doLogin();
        });
        s.on("disconnect", () => setConnected(false));
        s.on("connect_error", (e: any) => setError(e?.message || "connect_error"));

        // ACK на наш message:send
        s.on("message:sent", (payload: { status: "ok"; message_id: number }) => {
            const tempId = pendingQueue.current.shift();
            handlersRef.current.onAck?.({ tempId: tempId ?? "", message_id: payload.message_id });
        });

        s.on("message", (p: {
            login: string;
            message_id: number;
            message: string;
            storage: string[] | null;
            created_dt?: string;
            message_type?: string | null;
        }) => {
            const isClient = p.login === "client";
            const role: Role = isClient ? "client" : "operator";
            const attachments = Array.isArray(p.storage)
                ? p.storage.map((name, i) => ({ id: `${p.message_id}:${i}`, name }))
                : [];

            const created_at = p.created_dt ? toIso(p.created_dt) : new Date().toISOString();

            const ui: UiMessage = {
                id: String(p.message_id),
                text: p.message ?? "",
                created_at,
                authorLogin: isClient ? null : p.login,
                authorName: p.login,
                authorRole: role,
                attachments,
                isRead: false,
                message_type: (p.message_type ?? "message"),
            };

            handlersRef.current.onIncoming?.(ui);
        });

        // ✅ READ RECEIPTS (кто прочитал)
        s.on("message:read", (p: any) => {
            // варианты входа:
            // 1) { ids:[1,2], login:"1000" }
            // 2) { ids:{ message:[1,2], comment:[3] }, login:"1000" }
            // 3) { message:[1,2], comment:[3], login:"1000" } (редко, но поддержим)

            let reader: string | null | undefined =
                (typeof p?.login === "string" && p.login.trim()) ? p.login.trim()
                    : (typeof p?.reader === "string" && p.reader.trim()) ? p.reader.trim()
                        : undefined;

            const byType: ReadByType = {};
            let flat: number[] = [];

            const takeArray = (arr: any): number[] =>
                (Array.isArray(arr) ? arr : [])
                    .map((n) => +n)
                    .filter((n) => Number.isFinite(n));

            // src — то, где реально лежат ids: либо p.ids, либо p сам
            const src = (p && typeof p === "object" && "ids" in p) ? p.ids : p;

            if (Array.isArray(src)) {
                flat = takeArray(src);
            } else if (src && typeof src === "object" && !Array.isArray(src)) {
                for (const [k, v] of Object.entries(src)) {
                    // пропускаем служебные ключи
                    if (k === "login" || k === "reader") continue;

                    // если это { ids: { message:[..] } } — сюда попадёт message/comment/...
                    if (!Array.isArray(v)) continue;

                    const arr = takeArray(v);
                    if (arr.length) byType[k] = arr;
                }
                flat = Object.values(byType).flat();
            }

            // fallback: если пришло { ids:[..], login:"..." } мы уже обработали,
            // если вдруг ничего не распарсили — попробуем p.ids как массив
            if (!flat.length && Array.isArray(p?.ids)) {
                flat = takeArray(p.ids);
            }

            const ids = Array.from(new Set(flat));
            if (!ids.length) return;

            handlersRef.current.onRead?.({ ids, byType, login: reader ?? null });
        });

        if ((s as any).connected === false && typeof s.connect === "function") {
            s.connect();
        }

        return () => {
            s.removeAllListeners();
            s.disconnect();
            sockRef.current = null;
            setConnected(false);
        };
    }, [guid, login, sessionKey, worker]);

    async function send(tempId: string, text: string, files: File[] = [], messageType: string = "msg") {
        try {
            if (files.length) {
                if (!login) throw new Error("send(): login is required for file upload");
                if (!glagol_parent) throw new Error("send(): glagol_parent is required for file upload");
            }

            let storageNames: string[] = [];

            if (files.length) {
                const items: UploadItem[] = await uploadAndAttach(guid, files, login!, glagol_parent!);
                storageNames = items.map((i) => i.filename);
                handlersRef.current.onUploaded?.({ tempId, filenames: storageNames });
            }

            pendingQueue.current.push(tempId);

            sockRef.current?.emit("message:send", {
                message: text,
                storage: storageNames.length ? storageNames : undefined,
                message_type: messageType,
            });
        } catch (e) {
            console.error("Не удалось отправить сообщение/загрузить файлы", e);
            throw e;
        }
    }

    function normalizeReadKey(t?: string | null) {
        const s = String(t ?? "message").trim().toLowerCase();
        if (s === "msg" || s === "chat") return "message";
        return s || "message";
    }

    function markRead(message_id: number, messageType?: string) {
        const id = +message_id;
        if (!Number.isFinite(id)) return;

        const key = normalizeReadKey(messageType);
        sockRef.current?.emit("message:read", { ids: { [key]: [id] } });
    }

    function markManyReadByType(byType: ReadByType) {
        const payload: ReadByType = {};

        for (const [k, ids] of Object.entries(byType || {})) {
            const key = normalizeReadKey(k);

            const arr = Array.from(
                new Set(
                    (ids || [])
                        .map((n: any) => +n)
                        .filter((n: any) => Number.isFinite(n))
                )
            );

            if (arr.length) payload[key] = arr;
        }

        if (!Object.keys(payload).length) return;

        sockRef.current?.emit("message:read", { ids: payload });
    }

    function markManyRead(ids: number[]) {
        const distinct = Array.from(new Set((ids || []).map((n: any) => +n).filter((n: any) => Number.isFinite(n))));
        if (!distinct.length) return;
        markManyReadByType({ message: distinct });
    }

    return { connected, error, send, markRead, markManyRead, markManyReadByType };
}
