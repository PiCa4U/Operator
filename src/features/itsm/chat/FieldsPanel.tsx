// src/features/itsm/chat/FieldsPanel.tsx
/* ======= общий список файлов по GUID’ам контактов (сворачиваемый список) ======= */

import Swal from "sweetalert2";
import { chatApi } from "./api";
import { useEffect, useMemo, useRef, useState } from "react";

const DOWNLOAD_HOST_CC = "https://my.glagol.ai";
const SOCKET_HOST_CC = "wwstest.glagol.ai/chat";

/** https://my.glagol.ai/get_cc_files/{SOCKET_HOST}/{guid}/{filename} */
function buildContactDownloadUrl(hostOnly: string, guid: string, filename: string) {
    const encFile = encodeURIComponent(filename);
    const encGuid = encodeURIComponent(guid);
    return `${DOWNLOAD_HOST_CC}/get_cc_files/${hostOnly}/${encGuid}/${encFile}`;
}

function fileEmojiByExt(name: string) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (["png","jpg","jpeg","gif","webp","bmp","svg"].includes(ext)) return "🖼️";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc","docx","odt","rtf"].includes(ext)) return "📝";
    if (["xls","xlsx","ods","csv"].includes(ext)) return "📊";
    if (["ppt","pptx","odp"].includes(ext)) return "📈";
    if (["zip","rar","7z","gz","tar"].includes(ext)) return "🗜️";
    if (["mp3","wav","ogg","m4a"].includes(ext)) return "🎵";
    if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎞️";
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
        .map((it) => (typeof it === "string" ? it : (it?.name ?? it?.filename ?? "")))
        .filter((s: string) => !!s);
}

type FlatFile = { guid: string; fname: string };

export function ContactFilesPanel({
                                      contacts,
                                      serverFilesByGuid,
                                  }: {
    contacts: any[];
    /** опциональный override: актуальные файлы по GUID из бэка, не трогает openedPhones */
    serverFilesByGuid?: Record<string, string[]>;
}) {
    // плоский список всех файлов
    const [filesFlat, setFilesFlat] = useState<FlatFile[]>([]);
    // ключи “guid::filename”, по которым крутится спиннер удаления
    const [busy, setBusy] = useState<Set<string>>(new Set());

    // 🔽 состояние аккордеона (по умолчанию свернуто)
    const [isOpen, setIsOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);

    // пересобираем плоский список при изменениях
    useEffect(() => {
        const out: FlatFile[] = [];
        const seen = new Set<string>();

        for (const c of contacts ?? []) {
            const guid = getContactGuid(c);
            if (!guid) continue;

            const override = serverFilesByGuid?.[guid];
            const files = (override && override.length) ? override : normalizeStorage(c?.storage);
            if (!files?.length) continue;

            for (const fname of files) {
                const key = `${guid}::${fname}`;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ guid: String(guid), fname: String(fname) });
            }
        }

        // можно отсортировать по имени (по желанию)
        // out.sort((a, b) => a.fname.localeCompare(b.fname, undefined, { sensitivity: "base" }));

        setFilesFlat(out);
    }, [contacts, serverFilesByGuid]);

    // плавная анимация высоты
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        if (isOpen) {
            // сначала ставим реальную высоту, затем после перехода сбрасываем на 'auto'
            el.style.maxHeight = el.scrollHeight + "px";
            const onEnd = () => {
                el.style.maxHeight = "9999px"; // фактически как auto, чтобы не «обрезать» при динамике
                el.removeEventListener("transitionend", onEnd);
            };
            el.addEventListener("transitionend", onEnd);
        } else {
            // для сворачивания: выставляем текущую высоту, а в следующем тике — 0
            const h = el.scrollHeight;
            el.style.maxHeight = h + "px";
            // следующий кадр
            requestAnimationFrame(() => {
                el.style.maxHeight = "0px";
            });
        }
    }, [isOpen, filesFlat.length]);

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

        // отметить как busy
        setBusy((prev) => new Set(prev).add(key));

        // оптимистично убираем из UI сразу
        setFilesFlat((prev) => prev.filter((f) => !(f.guid === guid && f.fname === fname)));

        try {
            // 1) удалить из storage задач (таблица)
            await chatApi.delete("/api/v1/contacts/storage/remove", {
                data: { guid, storage: [fname] },
            });

            // 2) удалить физически из /storage/{guid}
            await chatApi.delete("/api/v1/storage/delete", {
                data: { guid, storage: [fname] },
            });

            await Swal.fire({
                icon: "success",
                title: "Готово",
                text: "Файл удалён",
                timer: 1200,
                showConfirmButton: false,
            });
        } catch (e: any) {
            // вернуть файл обратно при ошибке
            setFilesFlat((prev) => {
                const exists = prev.some((f) => f.guid === guid && f.fname === fname);
                return exists ? prev : [...prev, { guid, fname }];
            });

            console.error("delete file failed", e);
            await Swal.fire({
                icon: "error",
                title: "Не удалось удалить",
                text:
                    e?.response?.data?.detail ||
                    e?.message ||
                    "Попробуйте ещё раз или обратитесь к администратору",
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
        // показываем только заголовок с нулём и выключенной стрелкой
        return (
            <div>
                <div className="d-flex align-items-center gap-2 mb-3">
                    <h5 className="mb-0">Файлы</h5>
                    <span>({filesFlat.length})</span>
                    <button
                        type="button"
                        className="btn btn-link btn-sm p-0 ms-1"
                        style={{ opacity: 0.4, cursor: "not-allowed" }}
                        aria-disabled
                        aria-label="Нет файлов"
                    >
                        {/* стрелка вниз (неактивная) */}
                        <svg width="18" height="18" viewBox="0 0 20 20" style={{ transform: "rotate(0deg)" }}>
                            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Заголовок и переключатель */}
            <div className="d-flex align-items-center gap-2 mb-2">
                <h5 className="mb-0">Файлы</h5>
                <span>({filesFlat.length})</span>

                <button
                    type="button"
                    onClick={() => setIsOpen((v) => !v)}
                    className="btn btn-link btn-sm p-0 ms-1"
                    aria-expanded={isOpen}
                    aria-controls="files-collapse"
                    title={isOpen ? "Свернуть" : "Развернуть"}
                    style={{ display: "inline-flex", alignItems: "center" }}
                >
                    {/* стрелка; при открытии поворачиваем на 180° */}
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 20 20"
                        style={{
                            transition: "transform 180ms ease",
                            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                        }}
                    >
                        <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                    </svg>
                </button>
            </div>

            {/* Контент с плавной анимацией высоты */}
            <div
                id="files-collapse"
                ref={contentRef}
                style={{
                    overflow: "hidden",
                    maxHeight: isOpen ? "9999px" : "0px", // будет сразу скорректирован эффектом
                    transition: "max-height 220ms ease",
                }}
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
                                }}
                            >
                                <div style={{ fontSize: 22, lineHeight: 1 }}>{emoji}</div>

                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noreferrer"
                                        download={fname}
                                        className="stretched-link text-decoration-none"
                                        style={{ color: "inherit" }}
                                        title={fname}
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
                                    <div className="text-muted" style={{ fontSize: 12 }}>Скачать</div>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    aria-label="Удалить файл"
                                    title="Удалить файл"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
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
