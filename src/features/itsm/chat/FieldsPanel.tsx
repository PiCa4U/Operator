/* ======= общий список файлов по GUID’ам контактов (всегда открываемый по желанию) ======= */

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { chatApi } from "./api";

const DOWNLOAD_HOST_CC = "https://my.glagol.ai";

/** host[:port]/chat из data-атрибутов (без протокола), ровно один раз */
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
        return `${u.host}/chat`;
    } catch {
        const noProto = raw.replace(/^[a-zA-Z][\w+.-]*:\/\//, "");
        const host = noProto.split("/")[0];
        return `${host}/chat`;
    }
}

/** https://my.glagol.ai/get_cc_files/{ENCODED_CHAT_BASE}/{guid}/{filename} */
function buildContactDownloadUrl(chatBaseUrl: string, guid: string, filename: string) {
    const encBase = encodeURIComponent((chatBaseUrl || "").replace(/\/+$/, ""));
    const encGuid = encodeURIComponent(guid);
    const encFile = encodeURIComponent(filename);
    return `${DOWNLOAD_HOST_CC}/get_cc_files/${encBase}/${encGuid}/${encFile}`;
}

function fileEmojiByExt(name: string) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return "🖼️";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc", "docx", "odt", "rtf"].includes(ext)) return "📝";
    if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
    if (["ppt", "pptx", "odp"].includes(ext)) return "📈";
    if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "🗜️";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "🎵";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "🎞️";
    return "📎";
}

/** GUID строго из строки контакта */
function getContactGuid(c: any): string | null {
    return (
        (c?.guid && String(c.guid)) ||
        (c?.contact_info?.guid && String(c.contact_info.guid)) ||
        (c?.b_uuid && String(c.b_uuid)) ||
        (c?.uuid && String(c.uuid)) ||
        null
    );
}

/** Нормализуем storage: ["a.txt"] или [{name:"a.txt"}] */
function normalizeStorage(storage: any): string[] {
    if (!Array.isArray(storage)) return [];
    return storage
        .map((it) => (typeof it === "string" ? it : it?.name ?? it?.filename ?? ""))
        .filter((s: string) => !!s);
}

type FlatFile = { guid: string; fname: string };

export function ContactFilesPanel({
                                      contacts,
                                      serverFilesByGuid,
                                      /** если true — панель всегда открыта, без кнопки-стрелки и без анимации */
                                      alwaysOpen = false,
                                  }: {
    contacts: any[];
    serverFilesByGuid?: Record<string, string[]>;
    alwaysOpen?: boolean;
}) {
    const [filesFlat, setFilesFlat] = useState<FlatFile[]>([]);
    const [busy, setBusy] = useState<Set<string>>(new Set());
    const [isOpen, setIsOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);

    // host[:port]/chat
    const SOCKET_HOST_CC = readSocketHostForDownloads();

    // пересобираем список файлов
    useEffect(() => {
        const out: FlatFile[] = [];
        const seen = new Set<string>();

        for (const c of contacts ?? []) {
            const guid = getContactGuid(c);
            if (!guid) continue;

            const override = serverFilesByGuid?.[guid];
            const files = override?.length ? override : normalizeStorage(c?.storage);
            if (!files?.length) continue;

            for (const fname of files) {
                const key = `${guid}::${fname}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ guid: String(guid), fname: String(fname) });
            }
        }
        setFilesFlat(out);
    }, [contacts, serverFilesByGuid]);

    // плавная анимация высоты (если не alwaysOpen)
    useEffect(() => {
        if (alwaysOpen) return;
        const el = contentRef.current;
        if (!el) return;
        if (isOpen) {
            el.style.maxHeight = el.scrollHeight + "px";
            const onEnd = () => {
                el.style.maxHeight = "9999px";
                el.removeEventListener("transitionend", onEnd);
            };
            el.addEventListener("transitionend", onEnd);
        } else {
            const h = el.scrollHeight;
            el.style.maxHeight = h + "px";
            requestAnimationFrame(() => {
                el.style.maxHeight = "0px";
            });
        }
    }, [isOpen, filesFlat.length, alwaysOpen]);

    async function handleDelete(guid: string, fname: string) {
        const key = `${guid}::${fname}`;

        const res = await Swal.fire({
            title: "Удалить файл?",
            text: fname,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Удалить",
            cancelButtonText: "Отмена",
            reverseButtons: true,
            focusCancel: true,
        });
        if (!res.isConfirmed) return;

        setBusy((prev) => new Set(prev).add(key));
        setFilesFlat((prev) => prev.filter((f) => !(f.guid === guid && f.fname === fname)));

        try {
            await chatApi.delete("/api/v1/contacts/storage/remove", { data: { guid, storage: [fname] } });
            await chatApi.delete("/api/v1/storage/delete", { data: { guid, storage: [fname] } });
            await Swal.fire({ icon: "success", title: "Готово", text: "Файл удалён", timer: 1200, showConfirmButton: false });
        } catch (e: any) {
            setFilesFlat((prev) => {
                const exists = prev.some((f) => f.guid === guid && f.fname === fname);
                return exists ? prev : [...prev, { guid, fname }];
            });
            console.error("delete file failed", e);
            await Swal.fire({
                icon: "error",
                title: "Не удалось удалить",
                text: e?.response?.data?.detail || e?.message || "Попробуйте ещё раз или обратитесь к администратору",
            });
        } finally {
            setBusy((prev) => {
                const next = new Set(prev);
                next.delete(key);
                return next;
            });
        }
    }

    if (!filesFlat.length) {
        return (
            <div>
                <div className="d-flex align-items-center gap-2 mb-2">
                    <h5 className="mb-0">Файлы</h5>
                    <span>(0)</span>
                </div>
                <div className="text-muted" style={{ paddingTop: 4 }}>
                    Файлы не найдены
                </div>
            </div>
        );
    }

    const opened = alwaysOpen || isOpen;

    return (
        <div>
            <div className="d-flex align-items-center gap-2 mb-2">
                <h5 className="mb-0">Файлы</h5>
                <span>({filesFlat.length})</span>

                {!alwaysOpen && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // @ts-ignore
                            e.nativeEvent?.stopImmediatePropagation?.();
                            setIsOpen((v) => !v);
                        }}
                        className="btn btn-link btn-sm p-0 ms-1"
                        aria-expanded={opened}
                        aria-controls="files-collapse"
                        title={opened ? "Свернуть" : "Развернуть"}
                        style={{ display: "inline-flex", alignItems: "center", position: "relative", zIndex: 2 }}
                    >
                        <svg width="18" height="18" viewBox="0 0 20 20" style={{ transition: "transform 180ms ease", transform: opened ? "rotate(180deg)" : "rotate(0deg)" }}>
                            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </button>
                )}
            </div>

            <div
                id="files-collapse"
                ref={contentRef}
                style={
                    alwaysOpen
                        ? {}
                        : { overflow: "hidden", maxHeight: opened ? "9999px" : "0px", transition: "max-height 220ms ease" }
                }
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 12,
                        paddingTop: 6,
                    }}
                >
                    {filesFlat.map(({ guid, fname }) => {
                        const href = buildContactDownloadUrl(SOCKET_HOST_CC, String(guid), fname);
                        const emoji = fileEmojiByExt(fname);
                        const key = `${guid}::${fname}`;
                        const isBusy = busy.has(key);

                        return (
                            <div
                                key={key}
                                className="border rounded-3 bg-white"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "10px 12px",
                                    boxShadow: "0 1px 2px rgba(15,23,42,.06)",
                                    position: "relative",
                                }}
                            >
                                <div style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</div>

                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={fname}
                                        className="text-decoration-none"
                                        style={{ color: "inherit" }}
                                        title={fname}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            // @ts-ignore
                                            e.nativeEvent?.stopImmediatePropagation?.();
                                        }}
                                    >
                                        <div
                                            style={{
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {fname}
                                        </div>
                                    </a>
                                    <div className="text-muted" style={{ fontSize: 12 }}>
                                        Скачать
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    aria-label="Удалить файл"
                                    title="Удалить файл"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        // @ts-ignore
                                        e.nativeEvent?.stopImmediatePropagation?.();
                                        if (!isBusy) void handleDelete(String(guid), fname);
                                    }}
                                    disabled={isBusy}
                                >
                                    {isBusy ? (
                                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                    ) : (
                                        "Удалить"
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
