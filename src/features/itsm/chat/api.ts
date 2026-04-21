import axios from "axios";

const DEFAULT_CHAT_BASE = "https://wwstest.glagol.ai/chat";

function trimRightSlashes(value: string): string {
    return value.replace(/\/+$/, "");
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
    storage?: string[] | null;
    message_type?: string | null;
};

export type UploadItem = { status: string; filename: string};

function normalizeUploadResponse(raw: any): UploadItem[] {
    if (Array.isArray(raw) && raw.every((x) => x && typeof x === "object" && "filename" in x)) {
        return raw as UploadItem[];
    }
    if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
        return (raw as string[]).map((name) => ({ status: "ok", filename: name }));
    }
    if (Array.isArray(raw?.storage)) return normalizeUploadResponse(raw.storage);
    if (Array.isArray(raw?.data)) return normalizeUploadResponse(raw.data);
    if (typeof raw === "string") return [{ status: "ok", filename: raw }];
    return [];
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


export async function attachFilesToGuid(guid: string, items: UploadItem[]) {
    if (!items.length) return;
    const storage = items.map((i) => i.filename);
    await chatApi.post(`/api/v1/contacts/storage/add`, { guid, storage });
}

export async function uploadAndAttach(guid: string, files: File[], login: string, glagol_parent: string) {
    const items = await uploadToStorage(guid, files, login, glagol_parent);
    await attachFilesToGuid(guid, items);
    return items;
}
