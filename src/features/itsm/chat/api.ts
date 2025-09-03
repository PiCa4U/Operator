import axios from "axios";

// можно переопределить через VITE_CHAT_API_BASE, иначе дефолт:
export const chatApi = axios.create({
    baseURL: "https://wwstest.glagol.ai/chat",
    headers: { Accept: "application/json" },
});

export type RawChatMessage = {
    id: number;
    sender: string;
    text: string | null;
    created_dt: string;
    modified_dt?: string | null;
    storage?: string[] | null;
};

export type UploadItem = { status: string; filename: string };

function normalizeUploadResponse(raw: any): UploadItem[] {
    // уже в целевом формате?
    if (Array.isArray(raw) && raw.every(x => x && typeof x === "object" && "filename" in x)) {
        return raw as UploadItem[];
    }
    // массив строк -> конвертируем
    if (Array.isArray(raw) && raw.every(x => typeof x === "string")) {
        return (raw as string[]).map(name => ({ status: "ok", filename: name }));
    }
    // обёртка с полем storage / data
    if (Array.isArray(raw?.storage)) return normalizeUploadResponse(raw.storage);
    if (Array.isArray(raw?.data)) return normalizeUploadResponse(raw.data);
    // одиночная строка
    if (typeof raw === "string") return [{ status: "ok", filename: raw }];
    return [];
}

export async function fetchChatHistory(guid: string): Promise<RawChatMessage[]> {
    const { data } = await chatApi.get(`/api/v1/chat/${encodeURIComponent(guid)}`);
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows as RawChatMessage[];
}

/** Бэкенд ждёт multipart/form-data: files */
export async function uploadToStorage(guid: string, files: File[]): Promise<UploadItem[]> {
    if (!files?.length) return [];

    const fd = new FormData();
    files.forEach(f => fd.append("files", f, f.name));

    const { data } = await chatApi.post(
        `/api/v1/storage/upload/${encodeURIComponent(guid)}`,
        fd
    );

    return normalizeUploadResponse(data);
}

/** привязка имён к guid */
export async function attachFilesToGuid(guid: string, items: UploadItem[]) {
    if (!items.length) return;
    const storage = items.map(i => i.filename);
    await chatApi.post(`/api/v1/contacts/storage/add`, { guid, storage });
}

/** полный цикл: upload -> attach -> вернуть имена с индексами от сервера */
export async function uploadAndAttach(guid: string, files: File[]) {
    const items = await uploadToStorage(guid, files);
    await attachFilesToGuid(guid, items);
    return items; // [{ status, filename }]
}
