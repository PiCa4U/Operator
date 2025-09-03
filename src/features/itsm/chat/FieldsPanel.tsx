/* ======= файлы контактов по storage (жёсткая привязка к GUID контакта) + удаление ======= */

import Swal from "sweetalert2";
import {chatApi} from "./api";
import {useEffect, useState} from "react";

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
        .map((it) => (typeof it === "string" ? it : (it?.name ?? it?.filename ?? "")))
        .filter((s: string) => !!s);
}

type PanelItem = { c: any; guid: string; files: string[] };

export function ContactFilesPanel({ contacts }: { contacts: any[] }) {
    // локальное состояние — чтобы мы могли оптимистично убирать файлы
    const [rows, setRows] = useState<PanelItem[]>([]);
    // ключи “guid::filename”, по которым крутится спиннер удаления
    const [busy, setBusy] = useState<Set<string>>(new Set());

    // синхронизация при изменении входных contacts
    useEffect(() => {
        const items = contacts
            .map((c) => ({ c, guid: getContactGuid(c), files: normalizeStorage(c?.storage) }))
            .filter((x) => !!x.guid && x.files.length > 0) as PanelItem[];
        setRows(items);
    }, [contacts]);

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
        setRows((prev) =>
            prev
                .map((row) =>
                    row.guid === guid
                        ? { ...row, files: row.files.filter((f) => f !== fname) }
                        : row
                )
                .filter((row) => row.files.length > 0)
        );

        try {
            // 1) удалить из storage задач (таблица)
            await chatApi.delete("/api/v1/contacts/storage/remove", {
                data: { guid, storage: [fname] },
            });

            // 2) удалить физически из /storage/{guid}
            await chatApi.delete("/api/v1/storage/delete", {
                data: { guid, storage: [fname] },
            });

            // успех
            await Swal.fire({
                icon: "success",
                title: "Готово",
                text: "Файл удалён",
                timer: 1200,
                showConfirmButton: false,
            });
        } catch (e: any) {
            // вернуть файл обратно при ошибке
            setRows((prev) => {
                const copy = [...prev];
                const idx = copy.findIndex((r) => r.guid === guid);
                if (idx >= 0 && !copy[idx].files.includes(fname)) {
                    copy[idx] = { ...copy[idx], files: [...copy[idx].files, fname] };
                }
                return copy;
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

    if (!rows.length) return null;

    return (
        <div className="p-3">
            <h5 className="mb-3">Файлы, прикреплённые к контактам</h5>

            {rows.map(({ c, guid, files }, i) => {
                const titleParts = [
                    c?.name || c?.contact_info?.name,
                    c?.phone || c?.contact_info?.phone || c?.msisdn || c?.phone_number,
                    c?.project || c?.contact_info?.project,
                ].filter(Boolean);
                const contactTitle = titleParts.join(" · ") || `Контакт #${c?.id ?? i + 1}`;

                return (
                    <div key={`${guid}-${i}`} className="mb-3 border rounded">
                        <div className="px-3 py-2 border-bottom bg-light">
                            <b className="me-2">{contactTitle}</b>
                            <span className="text-muted small">GUID: {String(guid).slice(0, 8)}…</span>
                        </div>

                        <div className="p-2">
                            <div className="d-flex flex-wrap gap-2">
                                {files.map((fname) => {
                                    const href = buildContactDownloadUrl(SOCKET_HOST_CC, String(guid), fname);
                                    const emoji = fileEmojiByExt(fname);
                                    const key = `${guid}::${fname}`;
                                    const isBusy = busy.has(key);

                                    return (
                                        <div
                                            key={key}
                                            className="text-decoration-none"
                                            title={fname}
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                gap: 8,
                                                padding: "8px 10px",
                                                border: "1px solid var(--bs-border-color, #dee2e6)",
                                                borderRadius: 10,
                                                maxWidth: 420,
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                background: "white",
                                            }}
                                        >
                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                download={fname}
                                                style={{
                                                    display: "inline-flex",
                                                    alignItems: "center",
                                                    gap: 8,
                                                    textDecoration: "none",
                                                    color: "inherit",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                <span style={{ fontSize: 18, lineHeight: 1 }}>{emoji}</span>
                                                <span
                                                    style={{
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        maxWidth: 300,
                                                    }}
                                                >
                                                  {fname}
                                                </span>
                                            </a>

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
                                                style={{ padding: "2px 6px" }}
                                            >
                                                {isBusy ? (
                                                    // мини-спиннер
                                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                                ) : (
                                                    <span
                                                        style={{
                                                            fontWeight: 700,
                                                            fontSize: 16,
                                                            lineHeight: 1,
                                                            display: "inline-block",
                                                        }}
                                                    >
                                                        ×
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
