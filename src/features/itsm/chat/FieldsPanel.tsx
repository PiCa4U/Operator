import React, { useEffect, useMemo, useRef, useState } from "react";
import Swal from "sweetalert2";
import { buildChatDownloadUrl, chatApi } from "./api";
import ReactDOM from "react-dom";
import { useOperatorsDirectory } from "../../signals/useOperatorsDirectory";
import { store } from "../../../redux/store";


function fileEmojiByExt(name: string) {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return "🖼️";
    if (["pdf"].includes(ext)) return "📄";
    if (["doc", "docx", "odt", "rtf"].includes(ext)) return "📝";
    if (["xls", "xlsx", "ods", "csv"].includes(ext)) return "📊";
    if (["ppt", "pptx", "odp"].includes(ext)) return "📈";
    if (["zip", "rar", "7z", "gz", "tar"].includes(ext)) return "🗜️";
    if (["mp3", "wav", "ogg", "m4a"].includes(ext)) return "🎵";
    if (["mp4", "mov", "avi", "mkv", "webm"].includes(ext)) return "🎞️";
    return "📎";
}

const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];
const extOf = (n: string) => (n.split(".").pop() || "").toLowerCase();
const isImage = (n: string) => IMAGE_EXTS.includes(extOf(n));
const isPdf = (n: string) => extOf(n) === "pdf";

/** кто загрузил (оператор/клиент) */
function formatCreatedBy(createdBy?: string, dict?: Record<string, string>) {
    const raw = String(createdBy ?? "").trim();
    if (!raw) return "—";

    const low = raw.toLowerCase();
    if (low === "client" || low === "customer" || low === "клиент") return "Клиент";

    const direct = dict?.[raw];
    if (direct) return direct;

    const beforeAt = raw.includes("@") ? raw.split("@")[0] : raw;
    const byBeforeAt = dict?.[beforeAt];
    if (byBeforeAt) return byBeforeAt;

    const m = raw.match(/\b\d{3,}\b/);
    if (m?.[0] && dict?.[m[0]]) return dict[m[0]];

    if (/^\d+$/.test(raw)) return `Оператор ${raw}`;

    return raw;
}

/** --- DATE/TIME: backend stores UTC, we must show in CLIENT local timezone --- */
function hasExplicitTz(s: string): boolean {
    return /([zZ]|[+\-]\d{2}:?\d{2})$/.test(s.trim());
}

function parseBackendUtcMs(s?: string): number {
    if (!s) return 0;
    const str = String(s).trim();
    if (!str) return 0;

    // unix seconds / ms (на всякий)
    if (/^\d{10}$/.test(str)) return Number(str) * 1000;
    if (/^\d{13}$/.test(str)) return Number(str);

    // если вдруг сервер начал отдавать ISO с TZ — доверяем
    if (hasExplicitTz(str)) {
        const ms = new Date(str.replace(" ", "T")).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    // "YYYY-MM-DD HH:mm:ss(.fffffffff)" без TZ => считаем, что это UTC
    const m = str.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?$/
    );
    if (!m) return 0;

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] ?? "0");

    // дробные секунды 1..9 знаков — берём миллисекунды (первые 3)
    const frac = m[7] ?? "";
    const milli = frac ? Number((frac + "000").slice(0, 3)) : 0;

    const ms = Date.UTC(year, month - 1, day, hour, minute, second, milli);
    return Number.isFinite(ms) ? ms : 0;
}

/** дата добавления: показываем в TZ клиента */
function formatDt(s?: string) {
    if (!s) return "—";

    const ms = parseBackendUtcMs(s);
    if (!ms) return String(s);

    const d = new Date(ms);

    const parts = new Intl.DateTimeFormat("ru-RU", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        // timeZone не задаём => локальная TZ клиента
    }).formatToParts(d);

    const p: Record<string, string> = {};
    for (const it of parts) if (it.type !== "literal") p[it.type] = it.value;

    return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}

function getContactGuid(c: any): string | null {
    return (
        (c?.guid && String(c.guid)) ||
        (c?.contact_info?.guid && String(c.contact_info.guid)) ||
        (c?.b_uuid && String(c.b_uuid)) ||
        (c?.uuid && String(c.uuid)) ||
        null
    );
}

function normalizeStorage(storage: any): string[] {
    if (!Array.isArray(storage)) return [];
    return storage
        .map((it) => (typeof it === "string" ? it : it?.name ?? it?.filename ?? ""))
        .filter((s: string) => !!s);
}

async function openPdfPreview(urlPreview: string, urlDownload: string) {
    try {
        const resp = await fetch(urlPreview, { credentials: "omit" });
        const ct = (resp.headers.get("content-type") || "").toLowerCase();
        if (!resp.ok || !ct.includes("application/pdf")) throw new Error(`Bad status ${resp.status}`);
        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
        window.open(urlDownload, "_blank", "noopener,noreferrer");
    }
}

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
                        onClick={(e) => {
                            e.stopPropagation();
                            onPrev();
                        }}
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
                        onClick={(e) => {
                            e.stopPropagation();
                            onNext();
                        }}
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

/** данные, которые приходит с GET /api/v1/storage */
type StorageFileRow = {
    id?: number;
    glagol_parent?: string;
    guid: string;

    filename: string; // отображение
    inner_name: string; // ключ

    created_by?: string;
    filetype?: string;
    description?: string | null;
    file_size?: number;
    created_dt?: string;
    modified_dt?: string;
};

const rowKeyOf = (r: StorageFileRow) => `${r.guid}::${r.inner_name || r.filename}`;

export function ContactFilesPanel({
                                      contacts,
                                      serverFilesByGuid,
                                      alwaysOpen = false,
                                      glagolParent,
                                  }: {
    contacts: any[];
    serverFilesByGuid?: Record<string, string[]>;
    alwaysOpen?: boolean;
    glagolParent: string;
}) {
    const [rows, setRows] = useState<StorageFileRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [loadErr, setLoadErr] = useState<string | null>(null);

    const { data: operatorDict = {} } = useOperatorsDirectory();

    const [busyDelete, setBusyDelete] = useState<Set<string>>(new Set());
    const [busyPut, setBusyPut] = useState<Set<string>>(new Set());

    const [isOpen, setIsOpen] = useState(false);
    const contentRef = useRef<HTMLDivElement | null>(null);

    // refresh (после upload можно дергать window.dispatchEvent(new CustomEvent('contact-files:refresh')))
    const [reloadTick, setReloadTick] = useState(0);
    useEffect(() => {
        const onRefresh = () => setReloadTick((v) => v + 1);
        window.addEventListener("contact-files:refresh", onRefresh as any);
        return () => window.removeEventListener("contact-files:refresh", onRefresh as any);
    }, []);

    // --- load rows from API + fallback from contacts.storage
    useEffect(() => {
        const guids = Array.from(new Set((contacts ?? []).map(getContactGuid).filter(Boolean))) as string[];

        const fallbackFromContacts = () => {
            const out: StorageFileRow[] = [];
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
                    out.push({
                        guid: String(guid),
                        filename: String(fname),
                        inner_name: String(fname),
                        description: null,
                    });
                }
            }
            return out;
        };

        if (!guids.length) {
            setRows([]);
            return;
        }

        let cancelled = false;

        (async () => {
            setLoading(true);
            setLoadErr(null);

            try {
                const results = await Promise.allSettled(
                    guids.map(async (guid) => {
                        const { data } = await chatApi.get("/api/v1/storage", {
                            params: { glagol_parent: glagolParent, guid },
                        });
                        return { guid, data };
                    })
                );

                const out: StorageFileRow[] = [];
                const seen = new Set<string>();

                for (const r of results) {
                    if (r.status !== "fulfilled") continue;

                    const list = Array.isArray(r.value.data) ? r.value.data : [];
                    for (const it of list) {
                        const row: StorageFileRow = {
                            id: it?.id,
                            glagol_parent: it?.glagol_parent,
                            guid: String(it?.guid ?? r.value.guid),

                            filename: String(it?.filename ?? it?.inner_name ?? ""),
                            inner_name: String(it?.inner_name ?? it?.filename ?? ""),

                            created_by: it?.created_by,
                            filetype: it?.filetype,
                            description: it?.description ?? null,
                            file_size: it?.file_size,
                            created_dt: it?.created_dt,
                            modified_dt: it?.modified_dt,
                        };

                        if (!row.guid || (!row.inner_name && !row.filename)) continue;

                        const k = rowKeyOf(row);
                        if (seen.has(k)) continue;
                        seen.add(k);
                        out.push(row);
                    }
                }

                // merge fallback files (если в storage API чего-то нет)
                const fb = fallbackFromContacts();
                for (const f of fb) {
                    const k = rowKeyOf(f);
                    if (seen.has(k)) continue;
                    seen.add(k);
                    out.push(f);
                }

                // сортировка: новые сверху (по сырой строке, достаточно)
                out.sort((a, b) => {
                    const da = String(a.modified_dt || a.created_dt || "");
                    const db = String(b.modified_dt || b.created_dt || "");
                    return db.localeCompare(da);
                });

                if (!cancelled) setRows(out);
            } catch (e: any) {
                const fb = fallbackFromContacts();
                if (!cancelled) {
                    setRows(fb);
                    setLoadErr(
                        e?.response?.data?.detail ||
                        e?.response?.data?.message ||
                        e?.message ||
                        "Не удалось загрузить файлы"
                    );
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [contacts, serverFilesByGuid, glagolParent, reloadTick]);

    const imageItems = useMemo<LightboxItem[]>(
        () =>
            rows
                .filter((r) => isImage(r.inner_name || r.filename))
                .map((r) => {
                    const nameForUrl = r.inner_name || r.filename;
                    return {
                        url: buildChatDownloadUrl(r.guid, nameForUrl),
                        title: r.filename || r.inner_name,
                    };
                }),
        [rows]
    );

    const [lb, setLb] = useState<{ items: LightboxItem[]; index: number } | null>(null);

    // collapse animation
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
    }, [isOpen, rows.length, alwaysOpen]);

    const stop = (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        // @ts-ignore
        e.nativeEvent?.stopImmediatePropagation?.();
    };

    const stopBubble = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    };

    // --- description editing
    const [editingKey, setEditingKey] = useState<string | null>(null);
    const [draftDesc, setDraftDesc] = useState("");

    const lastSavedRef = useRef<string>(""); // чтобы не стрелять PUT если ничего не менялось
    const savingRef = useRef(false);

    const beginEdit = (r: StorageFileRow) => {
        const k = rowKeyOf(r);
        setEditingKey(k);
        const v = r.description ?? "";
        setDraftDesc(v);
        lastSavedRef.current = v;
    };

    const commitEdit = async (r: StorageFileRow) => {
        const k = rowKeyOf(r);
        if (savingRef.current) return;

        // если уже вышли из режима редактирования — ничего не делаем
        if (editingKey !== k) return;

        const cur = (draftDesc ?? "").trim();
        const prev = (lastSavedRef.current ?? "").trim();

        // если не менялось — просто закрываем редактирование
        if (cur === prev) {
            setEditingKey(null);
            return;
        }

        const payloadDesc = cur ? cur : null; // пусто => стираем

        savingRef.current = true;
        setBusyPut((p) => new Set(p).add(k));

        try {
            await chatApi.put("/api/v1/storage/file", {
                glagol_parent: glagolParent,
                guid: r.guid,
                inner_name: r.inner_name,
                description: payloadDesc,
            });

            setRows((prevRows) =>
                prevRows.map((x) => (rowKeyOf(x) === k ? { ...x, description: payloadDesc } : x))
            );

            lastSavedRef.current = payloadDesc ?? "";
            setEditingKey(null);
        } catch (e: any) {
            await Swal.fire({
                icon: "error",
                title: "Не удалось сохранить описание",
                text: e?.response?.data?.detail || e?.response?.data?.message || e?.message || "Ошибка",
            });

            // откатим draft к последнему сохранённому и выйдем из редактирования
            setDraftDesc(lastSavedRef.current);
            setEditingKey(null);
        } finally {
            savingRef.current = false;
            setBusyPut((prev) => {
                const n = new Set(prev);
                n.delete(k);
                return n;
            });
        }
    };

    const cancelEditOnEsc = () => {
        setDraftDesc(lastSavedRef.current);
        setEditingKey(null);
    };

    const Ico = {
        Eye: (p: React.SVGProps<SVGSVGElement>) => (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
                <path
                    fill="currentColor"
                    d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"
                />
            </svg>
        ),
        Pdf: (p: React.SVGProps<SVGSVGElement>) => (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
                <path
                    fill="currentColor"
                    d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 13h3a2 2 0 0 1 0 4H9v2H7v-6zm2 2v1h1a.5.5 0 0 0 0-1H9zm5-2h2.2c1.6 0 2.8 1.2 2.8 3s-1.2 3-2.8 3H14v-6zm2.2 5c.8 0 1.3-.7 1.3-2s-.5-2-1.3-2H16v4h.2z"
                />
            </svg>
        ),
        Download: (p: React.SVGProps<SVGSVGElement>) => (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
                <path
                    fill="currentColor"
                    d="M12 3a1 1 0 0 1 1 1v9.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4.01 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.42-1.42L11 13.59V4a1 1 0 0 1 1-1zm-7 16a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"
                />
            </svg>
        ),
        Trash: (p: React.SVGProps<SVGSVGElement>) => (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
                <path
                    fill="currentColor"
                    d="M9 3h6l1 2h4a1 1 0 1 1 0 2h-1l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 7H4a1 1 0 1 1 0-2h4l1-2zm-1 4 1 14h6l1-14H8zm2 2a1 1 0 0 1 1 1v9a1 1 0 1 1-2 0v-9a1 1 0 0 1 1-1zm4 0a1 1 0 0 1 1 1v9a1 1 0 1 1-2 0v-9a1 1 0 0 1 1-1z"
                />
            </svg>
        ),
    };

    const iconBtnSx: React.CSSProperties = {
        width: 32,
        height: 32,
        padding: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
    };

    async function handleDelete(r: StorageFileRow) {
        const k = rowKeyOf(r);
        const state = store.getState();
        const token = String(state.operator?.sessionKey || state.credentials?.sessionKey || "").trim();
        const authHeaders = token ? { Authorization: `Bearer ${token}` } : undefined;
        const nameForOps = r.inner_name || r.filename; // на удаление/скачивание лучше inner_name

        const res = await Swal.fire({
            title: "Удалить файл?",
            text: r.filename || r.inner_name,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Удалить",
            cancelButtonText: "Отмена",
            reverseButtons: true,
            focusCancel: true,
        });
        if (!res.isConfirmed) return;

        setBusyDelete((prev) => new Set(prev).add(k));
        setRows((prev) => prev.filter((x) => rowKeyOf(x) !== k));

        try {
            await chatApi.delete("/api/v1/contacts/storage/remove", {
                data: { guid: r.guid, storage: [nameForOps] },
                headers: authHeaders,
            });
            await chatApi.delete("/api/v1/storage/delete", {
                data: { guid: r.guid, storage: [nameForOps] },
                headers: authHeaders,
            });

            await Swal.fire({
                icon: "success",
                title: "Готово",
                text: "Файл удалён",
                timer: 1200,
                showConfirmButton: false,
            });
        } catch (e: any) {
            setRows((prev) => {
                const exists = prev.some((x) => rowKeyOf(x) === k);
                return exists ? prev : [r, ...prev];
            });

            await Swal.fire({
                icon: "error",
                title: "Не удалось удалить",
                text: e?.response?.data?.detail || e?.response?.data?.message || e?.message || "Попробуйте ещё раз",
            });
        } finally {
            setBusyDelete((prev) => {
                const n = new Set(prev);
                n.delete(k);
                return n;
            });
        }
    }

    if (loading) {
        return (
            <div className="text-muted" style={{ paddingTop: 6 }}>
                <span className="spinner-border spinner-border-sm me-2" /> Загрузка файлов…
            </div>
        );
    }

    if (!rows.length) {
        return (
            <div>
                <div className="d-flex align-items-center gap-2 mb-2">
                    <h5 className="mb-0">Файлы</h5>
                    <span>(0)</span>
                </div>
                <div className="text-muted" style={{ paddingTop: 4 }}>
                    Файлы не найдены
                    {loadErr ? <div className="text-danger mt-2">{loadErr}</div> : null}
                </div>
            </div>
        );
    }

    const opened = alwaysOpen || isOpen;

    return (
        <div>
            <div className="d-flex align-items-center gap-2 mb-2">
                <h5 className="mb-0">Файлы</h5>
                <span>({rows.length})</span>

                <div className="ms-auto d-flex align-items-center gap-2">
                    {loadErr ? (
                        <span className="text-danger" style={{ fontSize: 12 }}>
              {loadErr}
            </span>
                    ) : null}

                    {!alwaysOpen && (
                        <button
                            type="button"
                            onClick={(e) => {
                                stop(e);
                                setIsOpen((v) => !v);
                            }}
                            className="btn btn-link btn-sm p-0 ms-1"
                            aria-expanded={opened}
                            aria-controls="files-collapse"
                            title={opened ? "Свернуть" : "Развернуть"}
                            style={{ display: "inline-flex", alignItems: "center", position: "relative", zIndex: 2 }}
                        >
                            <svg
                                width="18"
                                height="18"
                                viewBox="0 0 20 20"
                                style={{
                                    transition: "transform 180ms ease",
                                    transform: opened ? "rotate(180deg)" : "rotate(0deg)",
                                }}
                            >
                                <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                        </button>
                    )}
                </div>
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
                <div className="table-responsive" style={{ paddingTop: 6 }}>
                    <table className="table table-sm align-middle mb-0" style={{ tableLayout: "fixed", width: "100%" }}>
                        <colgroup>
                            <col style={{ width: 44 }} />
                            <col style={{ width: 260 }} />
                            <col style={{ width: 180 }} />
                            <col style={{ width: 160 }} />
                            <col style={{ width: 360 }} />
                            <col style={{ width: 260 }} />
                        </colgroup>

                        <thead>
                        <tr className="text-muted">
                            <th style={{ width: 44 }}>Тип</th>
                            <th style={{ width: 260 }}>Файл</th>
                            <th style={{ width: 180 }}>Кто добавил</th>
                            <th style={{ width: 160 }}>Когда</th>
                            <th style={{ width: 360 }}>Описание</th>
                            <th style={{ width: 260, textAlign: "right" }}>Действия</th>
                        </tr>
                        </thead>

                        <tbody>
                        {rows.map((r) => {
                            const k = rowKeyOf(r);
                            const delBusy = busyDelete.has(k);
                            const putBusy = busyPut.has(k);
                            const isEditing = editingKey === k;

                            const displayName = r.filename || r.inner_name;
                            const nameForUrl = r.inner_name || r.filename;

                            const href = buildChatDownloadUrl(r.guid, nameForUrl);

                            const emoji = fileEmojiByExt(nameForUrl);
                            const img = isImage(nameForUrl);
                            const pdf = isPdf(nameForUrl);

                            const lbIndex = img ? imageItems.findIndex((i) => i.url === href) : -1;

                            const openMain = async () => {
                                if (img) {
                                    setLb({
                                        items: imageItems.length ? imageItems : [{ url: href, title: displayName }],
                                        index: lbIndex >= 0 ? lbIndex : 0,
                                    });
                                    return;
                                }
                                if (pdf) {
                                    await openPdfPreview(href, href);
                                    return;
                                }
                                window.open(href, "_blank", "noopener,noreferrer");
                            };

                            return (
                                <tr key={k} style={{ opacity: delBusy ? 0.7 : 1 }}>
                                    <td style={{ fontSize: 18, lineHeight: 1, verticalAlign: "top" }}>{emoji}</td>

                                    <td style={{ overflow: "hidden", textAlign: "left", verticalAlign: "top" }}>
                                        <button
                                            type="button"
                                            className="btn btn-link p-0"
                                            style={{
                                                width: "100%",
                                                display: "block",
                                                textAlign: "left",
                                                color: "inherit",
                                                textDecoration: "none",
                                                fontWeight: 600,
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                            title={displayName}
                                            onClick={(e) => {
                                                stop(e);
                                                void openMain();
                                            }}
                                        >
                                            {displayName}
                                        </button>
                                    </td>

                                    <td
                                        style={{ verticalAlign: "top", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                        title={r.created_by ? String(r.created_by) : ""}
                                    >
                                        {formatCreatedBy(r.created_by, operatorDict)}
                                    </td>

                                    <td
                                        style={{ verticalAlign: "top", whiteSpace: "nowrap" }}
                                        title={String(r.created_dt || r.modified_dt || "")}
                                    >
                                        {formatDt(r.created_dt || r.modified_dt)}
                                    </td>

                                    <td
                                        style={{
                                            textAlign: "left",
                                            verticalAlign: "top",
                                            whiteSpace: "normal",
                                            overflowWrap: "anywhere",
                                            wordBreak: "break-word",
                                        }}
                                    >
                                        {!isEditing ? (
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => {
                                                    stop(e);
                                                    beginEdit(r);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        stop(e);
                                                        beginEdit(r);
                                                    }
                                                }}
                                                title="Клик — редактировать. Esc — отмена. Blur — сохранить"
                                                style={{
                                                    cursor: "text",
                                                    padding: "2px 4px",
                                                    borderRadius: 6,
                                                    minHeight: 22,
                                                }}
                                            >
                                                {r.description ? r.description : <span className="text-muted">—</span>}
                                            </div>
                                        ) : (
                                            <textarea
                                                className="form-control form-control-sm"
                                                rows={2}
                                                value={draftDesc}
                                                autoFocus
                                                placeholder="Описание… (пусто = удалить)"
                                                style={{ resize: "vertical" }}
                                                onChange={(e) => setDraftDesc(e.target.value)}
                                                onBlur={() => {
                                                    void commitEdit(r);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Escape") {
                                                        stop(e);
                                                        cancelEditOnEsc();
                                                    }
                                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                                        stop(e);
                                                        void commitEdit(r);
                                                    }
                                                }}
                                                disabled={putBusy}
                                            />
                                        )}
                                    </td>

                                    <td style={{ verticalAlign: "top" }}>
                                        <div className="d-flex justify-content-end flex-wrap" style={{ gap: 10 }}>
                                            {(img || pdf) && (
                                                <button
                                                    type="button"
                                                    className="btn btn-sm btn-outline-secondary"
                                                    style={iconBtnSx}
                                                    title={img ? "Просмотр" : "Открыть PDF"}
                                                    onClick={(e) => {
                                                        stop(e);
                                                        if (img) {
                                                            setLb({
                                                                items: imageItems.length ? imageItems : [{ url: href, title: displayName }],
                                                                index: lbIndex >= 0 ? lbIndex : 0,
                                                            });
                                                            return;
                                                        }
                                                        void openPdfPreview(href, href);
                                                    }}
                                                >
                                                    {img ? <Ico.Eye /> : <Ico.Pdf />}
                                                </button>
                                            )}

                                            <a
                                                href={href}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="btn btn-sm btn-outline-secondary"
                                                style={iconBtnSx}
                                                title="Скачать"
                                                download={displayName}
                                                onClick={stopBubble}
                                            >
                                                <Ico.Download />
                                            </a>

                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                style={iconBtnSx}
                                                aria-label="Удалить файл"
                                                title="Удалить"
                                                onClick={(e) => {
                                                    stop(e);
                                                    if (!delBusy) void handleDelete(r);
                                                }}
                                                disabled={delBusy}
                                            >
                                                {delBusy ? (
                                                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                                                ) : (
                                                    <Ico.Trash />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </table>
                </div>
            </div>

            {lb && (
                <Lightbox
                    items={lb.items}
                    index={lb.index}
                    onClose={() => setLb(null)}
                    onPrev={() => setLb((v) => (v ? { ...v, index: (v.index - 1 + v.items.length) % v.items.length } : v))}
                    onNext={() => setLb((v) => (v ? { ...v, index: (v.index + 1) % v.items.length } : v))}
                />
            )}
        </div>
    );
}
