import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import {
    MainContainer,
    ChatContainer,
    ConversationHeader,
    MessageList,
    Message,
    MessageSeparator,
} from "@chatscope/chat-ui-kit-react";
import ReactDOM from "react-dom";
import styles from "./style.module.css";

export type Role = "client" | "operator" | "manager";

/* ===== ЛЕГАСИ-СКАЧИВАНИЕ через my.glagol.ai/get_cc_files ===== */
const DOWNLOAD_HOST = "https://my.glagol.ai";

/** host[:port]/chat из data-* (без протокола), чтобы собрать get_cc_files */
function readSocketHostForDownloads(): string {
    const el = document.getElementById("root") as HTMLElement | null;
    let raw =
        (el?.dataset?.chatServer ||
            el?.dataset?.chatApiBase ||
            el?.dataset?.fsServer ||
            "")!.trim();

    if (!raw) return "wwstest.glagol.ai/chat";

    if (raw.startsWith("//")) raw = `${window.location.protocol}${raw}`;
    if (!/^[a-zA-Z][\w+.-]*:\/\//.test(raw)) raw = `${window.location.protocol}//${raw}`;

    try {
        const u = new URL(raw);
        // берём только host и приклеиваем /chat ровно один раз
        return `${u.host}/chat`;
    } catch {
        const noProto = raw.replace(/^[a-zA-Z][\w+.-]*:\/\//, "");
        const host = noProto.split("/")[0];
        return `${host}/chat`;
    }
}
const SOCKET_HOST = readSocketHostForDownloads();

/** https://my.glagol.ai/get_cc_files/{SOCKET_HOST}/{guid}/{filename} */
function buildDownloadUrl(hostOnly: string, guid: string, filename: string) {
    const encFile = encodeURIComponent(filename);
    const encGuid = encodeURIComponent(guid);
    return `${DOWNLOAD_HOST}/get_cc_files/${hostOnly}/${encGuid}/${encFile}`;
}

/* ===== НОВОЕ ПРЕВЬЮ через fs_server (Redux + data-fs-server) ===== */
function readFilesApiBaseFallback(): string {
    const el = document.getElementById("root") as HTMLElement | null;
    let raw = (
        el?.dataset?.fsServer || // <div id="root" data-fs-server="https://fs.host">
        el?.dataset?.filesApiBase ||
        el?.dataset?.chatApiBase ||
        ""
    ).trim();

    if (!raw) return "";
    if (raw.startsWith("//")) raw = `${window.location.protocol}${raw}`;
    if (!/^https?:\/\//i.test(raw)) raw = `${window.location.protocol}//${raw}`;
    return raw.replace(/\/+$/, "");
}

function trimRightSlashes(s: string) {
    return s.replace(/\/+$/, "");
}

/** /api/v1/download/<guid>/<filename> — inline с корректным Content-Type */
function buildPreviewUrl(filesApiBase: string, guid: string, filename: string) {
    return `${trimRightSlashes(filesApiBase)}/api/v1/download/${encodeURIComponent(
        guid
    )}/${encodeURIComponent(filename)}`;
}

async function openPdfPreview(urlPreview: string, urlDownload: string) {
    try {
        const resp = await fetch(urlPreview, { credentials: "omit" });
        const ct = (resp.headers.get("content-type") || "").toLowerCase();
        if (!resp.ok || !ct.includes("application/pdf")) {
            throw new Error(`Not a PDF or bad status: ${resp.status}`);
        }
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
        // Фолбэк — старое скачивание
        window.open(urlDownload, "_blank", "noopener,noreferrer");
    }
}

/* ===== Хелперы ===== */
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
const extOf = (name: string) => (name.split(".").pop() || "").toLowerCase();
const isImageName = (name: string) => IMAGE_EXTS.includes(extOf(name));
const isPdfName = (name: string) => extOf(name) === "pdf";

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

/* ===== Типы ===== */
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

type ReadStatus = { watched: string[]; responsible_watch: boolean };
type ReadMap = Record<string, ReadStatus>;

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

function isOutgoing(m: UiMessage, selfLogin?: string | null, selfRole: Role = "client") {
    if (selfLogin) return (m.authorLogin ?? null) === selfLogin;
    return m.authorRole === selfRole;
}

type KitPosition = "single" | "first" | "normal" | "last";
function positionsOf(
    list: UiMessage[],
    selfLogin?: string | null,
    selfRole: Role = "client"
): KitPosition[] {
    const dir = (m: UiMessage) => (isOutgoing(m, selfLogin, selfRole) ? "outgoing" : "incoming");
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

/* ===== Лайтбокс для картинок ===== */
type LightboxItem = { url: string; title?: string };

function Lightbox({
                      items,
                      index,
                      onClose,
                      onPrev,
                      onNext,
                  }: {
    items: LightboxItem[];
    index: number;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
}) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            if (e.key === "ArrowLeft") onPrev();
            if (e.key === "ArrowRight") onNext();
        };
        document.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [onClose, onPrev, onNext]);

    if (!items.length) return null;
    const item = items[index];

    const node = (
        <div
            aria-modal
            role="dialog"
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <img
                src={item.url}
                alt={item.title || ""}
                style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain" }}
                onClick={(e) => e.stopPropagation()}
                onError={() => {
                    window.open(item.url, "_blank", "noopener,noreferrer");
                    onClose();
                }}
            />
            <button
                aria-label="Close"
                onClick={onClose}
                style={{
                    position: "fixed",
                    top: 16,
                    right: 16,
                    border: "none",
                    background: "rgba(255,255,255,0.15)",
                    padding: "8px 10px",
                    borderRadius: 8,
                    cursor: "pointer",
                    color: "#fff",
                    fontSize: 14,
                }}
            >
                ✕
            </button>

            {items.length > 1 && (
                <>
                    <button
                        onClick={(e) => (e.stopPropagation(), onPrev())}
                        style={{
                            position: "fixed",
                            left: 16,
                            top: "50%",
                            transform: "translateY(-50%)",
                            border: "none",
                            background: "rgba(255,255,255,0.15)",
                            padding: "8px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            color: "#fff",
                        }}
                    >
                        ←
                    </button>
                    <button
                        onClick={(e) => (e.stopPropagation(), onNext())}
                        style={{
                            position: "fixed",
                            right: 16,
                            top: "50%",
                            transform: "translateY(-50%)",
                            border: "none",
                            background: "rgba(255,255,255,0.15)",
                            padding: "8px 10px",
                            borderRadius: 8,
                            cursor: "pointer",
                            color: "#fff",
                        }}
                    >
                        →
                    </button>
                </>
            )}
        </div>
    );

    return ReactDOM.createPortal(node, document.body);
}

/* ===== Основной компонент ===== */
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
                                      title,
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
    title?: string;
    readMap?: ReadMap;
}) {
    const isControlled = Array.isArray(messages);
    const [internal, setInternal] = useState<UiMessage[]>(initialMessages);

    // Берём fs_server из Redux (snake_case + camelCase во всех типичных ветках)
    const fsServerFromRedux = useSelector((state: any) =>
        state?.common?.fs_server ?? state?.common?.fsServer ??
        state?.app?.fs_server ?? state?.app?.fsServer ??
        state?.config?.fs_server ?? state?.config?.fsServer ??
        state?.settings?.fs_server ?? state?.settings?.fsServer
    ) as string | undefined;

    // Нормализуем базу; если её нет — превью отключим и вернёмся к старому скачиванию.
    const filesApiBase = useMemo(() => {
        const fromRedux = typeof fsServerFromRedux === "string" ? fsServerFromRedux.trim() : "";
        const base = fromRedux || readFilesApiBaseFallback();
        const norm = base ? base.replace(/\/+$/, "") : "";
        console.debug("filesApiBase =", norm || "(empty)");
        return norm;
    }, [fsServerFromRedux]);

    useEffect(() => {
        if (!isControlled) setInternal(initialMessages);
    }, [initialMessages]);

    useEffect(() => {
        if (!filesApiBase) {
            console.warn(
                "[chat] filesApiBase is empty — using legacy get_cc_files. " +
                "Проверь Redux: fs_server/fsServer или data-fs-server на #root."
            );
        }
    }, [filesApiBase]);

    const list = isControlled ? (messages as UiMessage[]) : internal;

    const [lb, setLb] = useState<{ items: LightboxItem[]; index: number } | null>(null);

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
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        setDragging(true);
    }
    function dzDragLeave(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            setDragging(false);
            dragCounter.current = 0;
        }
    }
    function dzDragOver(e: React.DragEvent) {
        if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
    }
    function dzDrop(e: React.DragEvent) {
        e.preventDefault();
        e.stopPropagation();
        const files = Array.from(e.dataTransfer?.files ?? []);
        addPending(files);
        dragCounter.current = 0;
        setDragging(false);
    }

    const pos = useMemo(() => positionsOf(list, selfLogin ?? null, selfRole), [list, selfLogin, selfRole]);

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

    async function sendNow() {
        const trimmed = text.trim();
        if (!trimmed) return;

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
                                    <ConversationHeader.Content userName={title ?? "Чат"} />
                                </ConversationHeader>

                                <MessageList autoScrollToBottom>
                                    {list.map((m, i) => {
                                        const direction = isOutgoing(m, selfLogin ?? null, selfRole) ? "outgoing" : "incoming";
                                        const cur = new Date(m.created_at);
                                        const prev = i > 0 ? new Date(list[i - 1].created_at) : null;
                                        const showDayDivider = !prev || !sameDay(prev, cur);

                                        const rawName =
                                            (m.authorLogin && operatorDict?.[m.authorLogin]) || m.authorName || m.authorLogin || "";
                                        const looksLikeClient = (s: string) => !!s && /^(k|к)l?i?e?n?t$/i.test(s.replace(/\s+/g, ""));
                                        const name = m.authorRole === "client" || looksLikeClient(rawName) ? "Клиент" : rawName;

                                        const hasAtt = m.attachments?.length > 0;

                                        const readers = readMap?.[m.id]?.watched ?? [];
                                        const readersExceptAuthor = readers.filter((r) => (selfLogin ? r !== selfLogin : r !== "client"));
                                        const isReadByOthers = readersExceptAuthor.length > 0;
                                        const readTooltip = readersExceptAuthor.length
                                            ? `Прочитано: ${readersExceptAuthor.map((r) => displayReader(r, operatorDict)).join(", ")}`
                                            : "";

                                        // список картинок для лайтбокса
                                        const messageImageItems: LightboxItem[] = (m.attachments || [])
                                            .filter((att) => (att.file?.type ? att.file.type.startsWith("image/") : isImageName(att.name)))
                                            .map((att) => ({
                                                url: (!!att.file && !!att.url) ? att.url! : buildDownloadUrl(SOCKET_HOST, guid, att.name),
                                                title: att.name,
                                            }));

                                        return (
                                            <div key={m.id}>
                                                {showDayDivider && <MessageSeparator content={ruDate(cur)} />}

                                                <Message
                                                    model={{
                                                        message: hasAtt ? "" : m.text || "",
                                                        sentTime: ruTime(cur),
                                                        sender: name,
                                                        direction,
                                                        position: pos[i],
                                                    }}
                                                    title={readTooltip || undefined}
                                                >
                                                    {direction === "incoming" && name && (
                                                        <Message.Header>
                              <span className="small" style={{ fontWeight: 600 }}>
                                {name}
                              </span>
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
                                                                        {m.attachments.map((a) => {
                                                                            const isLocal = !!a.file && !!a.url;

                                                                            // URL для ПРОСМОТРА (через fs_server) и для СТАРОГО СКАЧИВАНИЯ
                                                                            const baseUrl = isLocal ? a.url! : buildDownloadUrl(SOCKET_HOST, guid, a.name);
                                                                            const urlPreview  = baseUrl;
                                                                            const urlDownload = baseUrl;

                                                                            // тип
                                                                            const isImg = isLocal
                                                                                ? (a.file?.type || "").startsWith("image/")
                                                                                : isImageName(a.name);
                                                                            const isPdf = isLocal
                                                                                ? a.file?.type === "application/pdf"
                                                                                : isPdfName(a.name);

                                                                            if (isImg) {
                                                                                const idx = messageImageItems.findIndex((i) => i.url === urlPreview);
                                                                                return (
                                                                                    <span
                                                                                        key={a.id}
                                                                                        style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                                                                                    >
                                            <button
                                                type="button"
                                                className={`${styles.fileChip} badge bg-secondary`}
                                                title={`Просмотр: ${a.name}`}
                                                onClick={() =>
                                                    setLb({
                                                        items: messageImageItems.length
                                                            ? messageImageItems
                                                            : [{ url: urlPreview, title: a.name }],
                                                        index: idx >= 0 ? idx : 0,
                                                    })
                                                }
                                                style={{ cursor: "zoom-in" }}
                                            >
                                              <span className={styles.fileChipText}>{a.name}</span>
                                            </button>

                                                                                        {!isLocal && (
                                                                                            <a
                                                                                                href={urlDownload}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                className={`${styles.fileChip} badge bg-light text-dark`}
                                                                                                title={`Скачать: ${a.name}`}
                                                                                                download={a.name}
                                                                                                style={{ lineHeight: 1, padding: "0.2rem 0.45rem" }}
                                                                                            >
                                                                                                ⬇
                                                                                            </a>
                                                                                        )}
                                          </span>
                                                                                );
                                                                            }

                                                                            if (isPdf) {
                                                                                return (
                                                                                    <span
                                                                                        key={a.id}
                                                                                        style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
                                                                                    >
                                                                                        <button
                                                                                            type="button"
                                                                                            className={`${styles.fileChip} badge bg-secondary`}
                                                                                            title={`Открыть PDF: ${a.name}`}
                                                                                            onClick={() => openPdfPreview(urlPreview, urlDownload)}
                                                                                            style={{ cursor: "zoom-in" }}
                                                                                        >
                                                                                          <span className={styles.fileChipText}>📄 {a.name}</span>
                                                                                        </button>
                                                                                        {!isLocal && (
                                                                                            <a
                                                                                                href={urlDownload}
                                                                                                target="_blank"
                                                                                                rel="noreferrer"
                                                                                                className={`${styles.fileChip} badge bg-light text-dark`}
                                                                                                title={`Скачать: ${a.name}`}
                                                                                                download={a.name}
                                                                                                style={{ lineHeight: 1, padding: "0.2rem 0.45rem" }}
                                                                                            >
                                                                                                ⬇
                                                                                            </a>
                                                                                        )}
                                          </span>
                                                                                );
                                                                            }

                                                                            // всё остальное — сразу скачивание старым способом
                                                                            return (
                                                                                <a
                                                                                    key={a.id}
                                                                                    href={urlDownload}
                                                                                    target="_blank"
                                                                                    rel="noreferrer"
                                                                                    className={`${styles.fileChip} badge bg-secondary`}
                                                                                    title={a.name}
                                                                                    {...(!isLocal ? { download: a.name } : {})}
                                                                                >
                                                                                    <span className={styles.fileChipText}>{a.name}</span>
                                                                                </a>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </Message.CustomContent>
                                                    )}

                                                    <Message.Footer>
                            <span
                                className="text-muted small"
                                style={{ display: "inline-block", marginLeft: "auto" }}
                                title={readTooltip || undefined}
                            >
                              {ruTime(cur)}
                                {direction === "outgoing" && isReadByOthers ? " · ✓" : ""}
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
                      <span className={styles.sizeMuted}>· {f.size ? `${(f.size / 1024).toFixed(0)} KB` : ""}</span>
                      <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => removePending(i)}
                          aria-label="Убрать файл"
                      >
                        ×
                      </button>
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
                            disabled={!text.trim()}
                            title="Отправить (Enter)"
                        >
                            Отправить
                        </button>
                    </div>
                </div>
            )}

            {lb && (
                <Lightbox
                    items={lb.items}
                    index={lb.index}
                    onClose={() => setLb(null)}
                    onPrev={() =>
                        setLb((v) => (v ? { ...v, index: (v.index - 1 + v.items.length) % v.items.length } : v))
                    }
                    onNext={() => setLb((v) => (v ? { ...v, index: (v.index + 1) % v.items.length } : v))}
                />
            )}
        </div>
    );
}
