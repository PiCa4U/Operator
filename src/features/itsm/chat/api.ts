import axios from "axios";

const DEFAULT_CHAT_BASE = "https://wwstest.glagol.ai/chat";

function trimRightSlashes(value: string): string {
    return value.replace(/\/+$/, "");
}

export function toChatIso(value?: string | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) return new Date().toISOString();

    if (/^\d{13}$/.test(raw)) {
        const ms = Number(raw);
        if (Number.isFinite(ms)) return new Date(ms).toISOString();
    }
    if (/^\d{10}$/.test(raw)) {
        const sec = Number(raw);
        if (Number.isFinite(sec)) return new Date(sec * 1000).toISOString();
    }

    const m = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?)?(?:([zZ]|[+\-]\d{2}:?\d{2}))?$/
    );
    if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]) - 1;
        const day = Number(m[3]);
        const hh = Number(m[4] ?? "0");
        const mm = Number(m[5] ?? "0");
        const ss = Number(m[6] ?? "0");
        const frac = m[7] ?? "";
        const ms = frac ? Number((frac + "000").slice(0, 3)) : 0;
        const tz = m[8];

        if (tz) {
            const normalizedTz = tz === "Z" || tz === "z"
                ? "Z"
                : (tz.includes(":") ? tz : `${tz.slice(0, 3)}:${tz.slice(3)}`);
            const isoWithTz = `${m[1]}-${m[2]}-${m[3]}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}${frac ? `.${frac}` : ""}${normalizedTz}`;
            const dtTz = new Date(isoWithTz);
            if (Number.isFinite(dtTz.getTime())) return dtTz.toISOString();
        }

        // No timezone: treat as local app time (prevents constant +3h shift).
        const local = new Date(year, month, day, hh, mm, ss, ms);
        if (Number.isFinite(local.getTime())) return local.toISOString();
    }

    const fallback = new Date(raw);
    if (Number.isFinite(fallback.getTime())) return fallback.toISOString();

    return new Date().toISOString();
}

export function readChatBaseURL(): string {
    const el = document.getElementById("root") as HTMLElement | null;
    let raw = (el?.dataset?.chatServer || el?.dataset?.chatApiBase || "").trim();
    if (!raw) return DEFAULT_CHAT_BASE;

    if (raw.startsWith("//")) {
        raw = `${window.location.protocol}${raw}`;
    } else if (!/^[a-zA-Z][\w+.-]*:\/\//.test(raw)) {
        raw = `${window.location.protocol}//${raw}`;
    }

    return trimRightSlashes(raw);
}

export function buildChatDownloadUrl(guid: string, filename: string, baseURL?: string): string {
    const base = trimRightSlashes(baseURL || readChatBaseURL());
    const encGuid = encodeURIComponent(guid);
    const encFilename = encodeURIComponent(filename);
    return `${base}/api/v1/download/${encGuid}/${encFilename}`;
}

export async function fetchChatFileBlob(guid: string, filename: string): Promise<Blob> {
    const url = buildChatDownloadUrl(guid, filename);
    const response = await fetch(url, {
        method: "GET",
        credentials: "omit",
    });
    if (!response.ok) {
        throw new Error(`Failed to fetch file blob: ${response.status}`);
    }
    return response.blob();
}

export async function openChatFileInNewTab(guid: string, filename: string): Promise<void> {
    const url = buildChatDownloadUrl(guid, filename);
    try {
        const blob = await fetchChatFileBlob(guid, filename);
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch {
        window.open(url, "_blank", "noopener,noreferrer");
    }
}

export async function downloadChatFile(guid: string, filename: string, downloadAs?: string): Promise<void> {
    const a = document.createElement("a");
    a.href = buildChatDownloadUrl(guid, filename);
    a.download = downloadAs || filename;
    a.target = "_blank";
    a.rel = "noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

export const chatApi = axios.create({
    headers: { Accept: "application/json" },
});

chatApi.interceptors.request.use((config) => {
    config.baseURL = readChatBaseURL();
    return config;
});

export type RawChatMessage = {
    id: number;
    sender: string;
    text: string | null;
    created_dt: string;
    modified_dt?: string | null;
    storage?: any[] | null;
    message_type?: string | null;
};

export type ChatStorageRef = {
    id?: number;
    filename: string;
    origin_guid?: string;
    inner_name?: string;
};

export type UploadItem = {
    status: string;
    filename: string;
    id?: number;
    origin_guid?: string | null;
    inner_name?: string | null;
};

const normalizeName = (value: any): string => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number") return String(value);
    if (!value || typeof value !== "object") return String(value ?? "").trim();

    const nested =
        value?.filename ??
        value?.inner_name ??
        value?.name ??
        value?.storage_name ??
        value?.file_name;

    if (nested != null && nested !== value) return normalizeName(nested);
    return "";
};

const normalizeGuid = (value: any): string | undefined => {
    const guid = String(value ?? "").trim();
    return guid ? guid : undefined;
};

const normalizePositiveInt = (value: any): number | undefined => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : undefined;
};

function toUploadItem(raw: any): UploadItem | null {
    if (raw == null) return null;

    if (typeof raw === "string") {
        const filename = normalizeName(raw);
        return filename ? { status: "success", filename } : null;
    }

    if (typeof raw !== "object") return null;

    const filename = normalizeName(
        raw?.filename ??
        raw?.inner_name ??
        raw?.name ??
        raw?.storage_name ??
        raw?.file_name
    );

    if (!filename) return null;

    return {
        status: String(raw?.status ?? "success"),
        filename,
        id: normalizePositiveInt(raw?.id ?? raw?.file_id ?? raw?.storage_id),
        origin_guid: normalizeGuid(raw?.origin_guid ?? raw?.originGuid ?? raw?.guid) ?? null,
        inner_name: normalizeName(raw?.inner_name) || null,
    };
}

function normalizeUploadResponse(raw: any): UploadItem[] {
    if (Array.isArray(raw)) {
        return raw.map(toUploadItem).filter(Boolean) as UploadItem[];
    }

    if (Array.isArray(raw?.storage)) return normalizeUploadResponse(raw.storage);
    if (Array.isArray(raw?.data)) return normalizeUploadResponse(raw.data);
    const one = toUploadItem(raw);
    return one ? [one] : [];
}

export function normalizeStorageRefs(storage: any, fallbackOriginGuid?: string): ChatStorageRef[] {
    if (!Array.isArray(storage)) return [];

    const out: ChatStorageRef[] = [];
    const seen = new Set<string>();

    for (const item of storage) {
        const upload = toUploadItem(item);
        if (!upload) continue;

        const filename = normalizeName(upload.inner_name || upload.filename);
        if (!filename) continue;

        const originGuid =
            normalizeGuid(upload.origin_guid) ||
            normalizeGuid((item as any)?.origin_guid ?? (item as any)?.originGuid ?? (item as any)?.guid) ||
            normalizeGuid(fallbackOriginGuid);

        const id = normalizePositiveInt(upload.id ?? (item as any)?.id ?? (item as any)?.file_id);
        const key = `${id ?? "x"}::${originGuid ?? ""}::${filename}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
            id,
            filename,
            inner_name: filename,
            origin_guid: originGuid,
        });
    }

    return out;
}

export function toMessageSendStorage(items: UploadItem[]): Array<{ id: number; filename: string; origin_guid?: string }> {
    const out: Array<{ id: number; filename: string; origin_guid?: string }> = [];
    const seen = new Set<number>();

    for (const item of items) {
        const status = String(item?.status ?? "").trim().toLowerCase();
        if (status && status !== "success" && status !== "ok") continue;

        const id = normalizePositiveInt(item?.id);
        if (!id) continue;
        if (seen.has(id)) continue;

        const filename = normalizeName(item?.inner_name || item?.filename);
        if (!filename) continue;

        seen.add(id);
        const originGuid = normalizeGuid(item?.origin_guid);
        out.push({
            id,
            filename,
            ...(originGuid ? { origin_guid: originGuid } : {}),
        });
    }

    return out;
}

export async function fetchChatHistory(guid: string, sessionKey: string): Promise<RawChatMessage[]> {
    const token = String(sessionKey || "").trim();
    const { data } = await chatApi.get(`/api/v1/chat/${encodeURIComponent(guid)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows as RawChatMessage[];
}

export async function uploadToStorage(
    guid: string,
    files: File[],
    login: string,
    glagol_parent: string
): Promise<UploadItem[]> {
    if (!files?.length) return [];

    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));

    fd.append("created_by", login);
    fd.append("glagol_parent", glagol_parent);

    const { data } = await chatApi.post(
        `/api/v1/storage/upload/${encodeURIComponent(guid)}`,
        fd
    );

    return normalizeUploadResponse(data);
}


export async function uploadAndAttach(guid: string, files: File[], login: string, glagol_parent: string) {
    return uploadToStorage(guid, files, login, glagol_parent);
}
