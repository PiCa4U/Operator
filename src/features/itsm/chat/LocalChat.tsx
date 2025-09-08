import { useEffect, useMemo, useRef, useState } from "react";
import {
    MainContainer,
    ChatContainer,
    ConversationHeader,
    MessageList,
    Message,
    MessageSeparator,
} from "@chatscope/chat-ui-kit-react";
import styles from "./style.module.css";

export type Role = "client" | "operator" | "manager";

/* ===== скачивание вложений через my.glagol.ai/get_cc_files ===== */
const DOWNLOAD_HOST = "https://my.glagol.ai";
// адрес сокет-сервера как host[:port] БЕЗ протокола
const SOCKET_HOST = "wwstest.glagol.ai/chat";

/** https://my.glagol.ai/get_cc_files/{SOCKET_HOST}/{guid}/{filename} */
function buildDownloadUrl(hostOnly: string, guid: string, filename: string) {
    const encFile = encodeURIComponent(filename);
    const encGuid = encodeURIComponent(guid);
    return `${DOWNLOAD_HOST}/get_cc_files/${hostOnly}/${encGuid}/${encFile}`;
}

const PaperclipIcon = ({ className }: { className?: string }) => (
    <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M21.44 11.05l-9.19 9.19a6 6 0 1 1-8.49-8.49L14.8 0.71a4 4 0 1 1 5.66 5.66L9.88 16.95a2 2 0 1 1-2.83-2.83l9.19-9.19" />
    </svg>
);

function useAutoResize(
    ref: React.RefObject<HTMLTextAreaElement | null>,
    value: string,
    maxVh = 40
) {
    useEffect(() => {
        const el = ref?.current;
        if (!el) return;

        el.style.height = "auto";
        const maxPx = Math.max(120, Math.round((window.innerHeight * maxVh) / 100));
        const next = Math.min(el.scrollHeight, maxPx);

        el.style.height = `${next}px`;
        el.style.overflowY = el.scrollHeight > next ? "auto" : "hidden";
    }, [ref, value, maxVh]);
}

export type UiAttachment = { id: string; name: string; url?: string; file?: File };
export type UiMessage = {
    id: string;
    text: string;
    created_at: string;
    authorLogin?: string | null;
    authorName?: string;
    authorRole: Role;
    attachments: UiAttachment[];
    tempId?: string;
    isRead?: boolean;
    status?: "pending" | "sent" | "failed";
    errorText?: string;
};

/* ===== типы статусов прочтения ===== */
type ReadStatus = { watched: string[]; responsible_watch: boolean };
type ReadMap = Record<string, ReadStatus>;

// ===== helpers (русское форматирование) =====
const ruDate = (d: Date) =>
    d.toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: new Date().getFullYear() === d.getFullYear() ? undefined : "numeric",
    });

const ruTime = (d: Date) =>
    d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

function isOutgoing(
    m: UiMessage,
    selfLogin?: string | null,
    selfRole: Role = "client"
) {
    if (selfLogin) return (m.authorLogin ?? null) === selfLogin;
    return m.authorRole === selfRole;
}

type KitPosition = "single" | "first" | "normal" | "last";
function positionsOf(
    list: UiMessage[],
    selfLogin?: string | null,
    selfRole: Role = "client"
): KitPosition[] {
    const dir = (m: UiMessage) =>
        isOutgoing(m, selfLogin, selfRole) ? "outgoing" : "incoming";
    const same = (i: number, j: number) =>
        list[i]?.authorLogin === list[j]?.authorLogin && dir(list[i]) === dir(list[j]);
    return list.map((_, i) => {
        const prev = i > 0 && same(i, i - 1);
        const next = i < list.length - 1 && same(i, i + 1);
        if (prev && next) return "normal";
        if (prev && !next) return "last";
        if (!prev && next) return "first";
        return "single";
    });
}

function displayReader(login: string, dict?: Record<string, string>) {
    if (!login) return "";
    if (login === "client") return "Клиент";
    return dict?.[login] || login;
}

function formatBytes(n: number) {
    if (!Number.isFinite(n)) return "";
    const u = ["B", "KB", "MB", "GB", "TB"];
    let i = 0,
        v = n;
    while (v >= 1024 && i < u.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export default function LocalChat({
                                      guid,
                                      selfLogin,
                                      selfName,
                                      selfRole = "client",
                                      collapsed,
                                      onToggle,
                                      onSend,
                                      messages,
                                      initialMessages = [],
                                      height = "65vh",
                                      operatorDict,
                                      formatOperatorFn,
                                      title,
                                      subtitle,
                                      readMap,
                                  }: {
    guid: string;
    selfLogin?: string | null;
    selfName?: string;
    selfRole?: Role;
    collapsed: boolean;
    onToggle(): void;
    onSend?: (text: string, files: File[]) => void | Promise<void>;
    messages?: UiMessage[];
    initialMessages?: UiMessage[];
    height?: string;
    operatorDict?: Record<string, string>;
    formatOperatorFn?: (login: string, dict?: Record<string, string>) => string;
    title?: string;
    subtitle?: string;
    readMap?: ReadMap;
}) {
    const isControlled = Array.isArray(messages);
    const [internal, setInternal] = useState<UiMessage[]>(initialMessages);

    useEffect(() => {
        if (!isControlled) setInternal(initialMessages);
    }, [initialMessages]);

    const list = isControlled ? (messages as UiMessage[]) : internal;

    const [text, setText] = useState("");
    const [pendingFiles, setPendingFiles] = useState<File[]>([]);
    const [pendingUrls, setPendingUrls] = useState<string[]>([]);
    const fileRef = useRef<HTMLInputElement | null>(null);

    const [isDragging, setDragging] = useState(false);
    const dragCounter = useRef(0);

    const taRef = useRef<HTMLTextAreaElement | null>(null);
    useAutoResize(taRef, text, 40);

    const dropZoneRef = useRef<HTMLDivElement | null>(null);

    function dzDragEnter(e: React.DragEvent) {
        e.preventDefault(); e.stopPropagation();
        dragCounter.current += 1;
        setDragging(true);
    }
    function dzDragLeave(e: React.DragEvent) {
        e.preventDefault(); e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) { setDragging(false); dragCounter.current = 0; }
    }
    function dzDragOver(e: React.DragEvent) {
        // не мешаем обычному перетаскиванию текста: реагируем только на файлы
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
    }
    function dzDrop(e: React.DragEvent) {
        e.preventDefault(); e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        addPending(files);
        dragCounter.current = 0;
        setDragging(false);
    }

    const pos = useMemo(
        () => positionsOf(list, selfLogin ?? null, selfRole),
        [list, selfLogin, selfRole]
    );

    function addPending(fs: File[]) {
        if (!fs.length) return;
        setPendingFiles((prev) => [...prev, ...fs]);
        setPendingUrls((prev) => [...prev, ...fs.map((f) => URL.createObjectURL(f))]);
    }
    function removePending(idx: number) {
        setPendingFiles((prev) => prev.filter((_, i) => i !== idx));
        setPendingUrls((prev) => {
            const u = prev[idx];
            if (u) URL.revokeObjectURL(u);
            return prev.filter((_, i) => i !== idx);
        });
    }
    useEffect(
        () => () => {
            pendingUrls.forEach((u) => URL.revokeObjectURL(u));
        },
        [] // cleanup on unmount
    );

    function onDragEnter(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        setDragging(true);
    }
    function onDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            setDragging(false);
            dragCounter.current = 0;
        }
    }
    function onDragOver(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
    }
    function onDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        addPending(files);
        dragCounter.current = 0;
        setDragging(false);
    }

    async function sendNow() {
        const trimmed = text.trim();
        if (!trimmed) return; // 🔒 обязательно нужен текст (даже если есть файлы)

        const id = crypto.randomUUID();
        const atts: UiAttachment[] = pendingFiles.map((f, i) => ({
            id: `${id}:${i}`,
            name: f.name,
            url: pendingUrls[i],
            file: f,
        }));

        const msg: UiMessage = {
            id,
            tempId: id,
            status: "pending",
            text: trimmed,
            created_at: new Date().toISOString(),
            authorLogin: selfLogin ?? null,
            authorName: selfName ?? (selfRole === "client" ? "Клиент" : "Оператор"),
            authorRole: selfRole,
            attachments: atts,
            isRead: false,
        };

        if (!isControlled) setInternal((prev) => [...prev, msg]);
        try {
            await onSend?.(trimmed, pendingFiles);
        } catch {}

        setText("");
        setPendingFiles([]);
        pendingUrls.forEach((u) => URL.revokeObjectURL(u));
        setPendingUrls([]);
        if (fileRef.current) fileRef.current.value = "";
    }
    function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendNow();
        }
    }

    return (
        <div
            className={`${styles.chatShell} border rounded-3 ${collapsed ? "h-12 overflow-hidden" : "min-h-80 d-flex flex-column"}`}
            style={collapsed ? undefined : { height }}
        >
            <div className="p-2 border-bottom d-flex justify-content-between align-items-center">
                <b>Чат</b>
                <button className="btn btn-sm btn-outline-secondary" onClick={onToggle}>
                    {collapsed ? "Открыть" : "Свернуть"}
                </button>
            </div>

            {!collapsed && (
                <div style={{ position: "relative", display: "flex", flexDirection: "column", flex: 1, minHeight: 360 }}>
                    {/* локальная drop-зона только вокруг чата */}
                    <div
                        ref={dropZoneRef}
                        className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ""}`}
                        onDragEnter={dzDragEnter}
                        onDragLeave={dzDragLeave}
                        onDragOver={dzDragOver}
                        onDrop={dzDrop}
                    >
                        {isDragging && (
                            <div className={styles.dragOverlay} aria-hidden>
                                <div className={styles.dropHere}>Отпустите файлы, чтобы прикрепить</div>
                            </div>
                        )}

                        <MainContainer>
                            <ChatContainer style={{ height: "100%" }} className={styles.chat}>
                                <ConversationHeader>
                                    <ConversationHeader.Content
                                        userName={title ?? "Чат"}
                                        info={subtitle ?? `${list.length} сообщений`}
                                    />
                                </ConversationHeader>

                                <MessageList autoScrollToBottom>
                                    {list.map((m, i) => {
                                        const direction = isOutgoing(m, selfLogin ?? null, selfRole) ? "outgoing" : "incoming";
                                        const cur = new Date(m.created_at);
                                        const prev = i > 0 ? new Date(list[i - 1].created_at) : null;
                                        const showDayDivider = !prev || !sameDay(prev, cur);

                                        const rawName =
                                            (m.authorLogin && operatorDict?.[m.authorLogin]) ||
                                            m.authorName || m.authorLogin || "";
                                        const looksLikeClient = (s: string) => !!s && /^(k|к)l?i?e?n?t$/i.test(s.replace(/\s+/g, ""));
                                        const name = m.authorRole === "client" || looksLikeClient(rawName) ? "Клиент" : rawName;

                                        const hasAtt = m.attachments?.length > 0;

                                        const readers = readMap?.[m.id]?.watched ?? [];
                                        const readersExceptAuthor = readers.filter(r => (selfLogin ? r !== selfLogin : r !== "client"));
                                        const isReadByOthers = readersExceptAuthor.length > 0;
                                        const readTooltip = readersExceptAuthor.length
                                            ? `Прочитано: ${readersExceptAuthor.map(r => displayReader(r, operatorDict)).join(", ")}`
                                            : "";

                                        return (
                                            <div key={m.id}>
                                                {showDayDivider && <MessageSeparator content={ruDate(cur)} />}

                                                <Message
                                                    model={{
                                                        message: hasAtt ? "" : (m.text || ""),
                                                        sentTime: ruTime(cur),
                                                        sender: name,
                                                        direction,
                                                        position: pos[i],
                                                    }}
                                                    title={readTooltip || undefined}
                                                >
                                                    {direction === "incoming" && name && (
                                                        <Message.Header>
                                                            <span className="small" style={{ fontWeight: 600 }}>{name}</span>
                                                        </Message.Header>
                                                    )}

                                                    {hasAtt && (
                                                        <Message.CustomContent>
                                                            {m.text && <div className={styles.msgText}>{m.text}</div>}

                                                            {!!m.attachments.length && (
                                                                <div className={styles.filesBlock}>
                                                                    <div className={styles.filesTitle}>
                                                                        <PaperclipIcon className={styles.iconXs} />
                                                                        Файлы ({m.attachments.length})
                                                                    </div>
                                                                    <div className={styles.filesChips}>
                                                                        {m.attachments.map(a => {
                                                                            const isPendingLocal = !!a.file && !!a.url;
                                                                            const href = isPendingLocal
                                                                                ? a.url!
                                                                                : buildDownloadUrl(SOCKET_HOST, guid, a.name);
                                                                            return (
                                                                                <a key={a.id} href={href} target="_blank" rel="noreferrer"
                                                                                   className="badge bg-secondary text-decoration-none"
                                                                                   title={a.name} {...(!isPendingLocal ? { download: a.name } : {})}>
                                                                                    {a.name}
                                                                                </a>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Message.CustomContent>
                                                    )}

                                                    <Message.Footer>
                                                        <span className="text-muted small" style={{ display: "inline-block", marginLeft: "auto" }}
                                                              title={readTooltip || undefined}>
                                                            {ruTime(cur)}
                                                            {direction === "outgoing" && (m.isRead || isReadByOthers) ? " · ✓" : ""}
                                                        </span>
                                                    </Message.Footer>
                                                </Message>
                                            </div>
                                        );
                                    })}
                                </MessageList>
                            </ChatContainer>
                        </MainContainer>
                    </div>

                    {/* инпут */}
                    <div className={`p-2 border-top ${styles.inputRow} ${isDragging ? styles.inputRowDragging : ""}`}>
                        <input
                            ref={fileRef}
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                                const fs = Array.from(e.target.files ?? []);
                                if (!fs.length) return;
                                addPending(fs);
                            }}
                        />
                        <button
                            type="button"
                            className={`btn btn-outline-secondary ${styles.iconBtn}`}
                            onClick={() => fileRef.current?.click()}
                            title="Прикрепить файлы"
                            aria-label="Прикрепить файлы"
                        >
                            <PaperclipIcon className={styles.icon} />
                        </button>

                        <div className={styles.inputGrow}>
                            {pendingFiles.length > 0 && (
                                <div className={styles.pendingWrap}>
                                    {pendingFiles.map((f, i) => (
                                        <span key={`${f.name}-${i}`} className={styles.pendingChip} title={f.name}>
                                          <PaperclipIcon className={styles.iconXs} />
                                          <span className={styles.ellipsis}>{f.name}</span>
                                          <span className={styles.sizeMuted}>· {formatBytes(f.size)}</span>
                                          <button type="button" className={styles.removeBtn} onClick={() => removePending(i)} aria-label="Убрать файл">×</button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <textarea
                                ref={taRef}
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                onKeyDown={onKeyDown}
                                className={`form-control ${styles.autoTextarea}`}
                                rows={1}
                                placeholder={
                                    pendingFiles.length
                                        ? "Добавлены файлы — напишите текст и нажмите Enter для отправки"
                                        : "Напишите сообщение… (Enter — отправить, Shift+Enter — перенос)"
                                }
                            />
                        </div>

                        <button
                            type="button"
                            className="btn btn-dark"
                            onClick={sendNow}
                            disabled={!text.trim()}   // только если есть текст
                            title="Отправить (Enter)"
                        >
                            Отправить
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

