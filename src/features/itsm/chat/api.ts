import axios from "axios";

const DEFAULT_CHAT_BASE = "https://wwstest.glagol.ai/chat";

function readChatBaseURL(): string {
    const el = document.getElementById("root") as HTMLElement | null;
    let raw = (el?.dataset?.chatServer || el?.dataset?.chatApiBase || "").trim();
    if (!raw) return DEFAULT_CHAT_BASE;

    if (raw.startsWith("//")) {
        raw = `${window.location.protocol}${raw}`;
    } else if (!/^[a-zA-Z][\w+.-]*:\/\//.test(raw)) {
        raw = `${window.location.protocol}//${raw}`;
    }

    return raw.replace(/\/+$/, "");
}

export const chatApi = axios.create({
    headers: { Accept: "application/json" },
});

chatApi.interceptors.request.use((config) => {
    config.baseURL = readChatBaseURL();

    const el = document.getElementById("root") as HTMLElement | null;
    const sessionKey = (el?.dataset?.sessionKey || "").trim();
    if (sessionKey) {
        config.headers = config.headers ?? {};
        (config.headers as any).Authorization = `Bearer ${sessionKey}`;
    }

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
    const { data } = await chatApi.get(`/api/v1/chat/${encodeURIComponent(guid)}`, {
        headers: sessionKey ? { Authorization: `Bearer ${sessionKey}` } : undefined,
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
