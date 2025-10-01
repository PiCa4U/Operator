// отдельный сокет ТОЛЬКО для чата
import io from "socket.io-client";
import { chatApi } from "./api"; // тот же инстанс, что и для REST

/**
 * Строим конфиг сокета из baseURL axios-а (единый источник правды).
 * baseURL может быть:
 *   - "https://host/chat"
 *   - "host/chat"
 *   - "//host/chat"
 *   - "https://host/some/prefix/chat"
 */
function getSocketConfigFromBase(baseRaw?: string): { origin: string; path: string } {
    let raw = (baseRaw || "").trim();
    if (!raw) {
        // последний шанс: window.CHAT_SERVER или data-*; иначе — текущий origin
        const el = document.getElementById("root") as HTMLElement | null;
        raw =
            (window as any).CHAT_SERVER ||
            el?.dataset?.chatServer ||
            el?.dataset?.chatApiBase ||
            el?.dataset?.fsServer ||
            window.location.origin;
    }

    // нормализуем протокол
    if (raw.startsWith("//")) raw = `${window.location.protocol}${raw}`;
    if (!/^[a-zA-Z][\w+.-]*:\/\//.test(raw)) raw = `${window.location.protocol}//${raw}`;

    const u = new URL(raw);
    // путь до чата: если baseURL уже заканчивается на /chat — берём его; иначе добавим
    let basePath = u.pathname.replace(/\/+$/, "");
    if (!/\/chat$/.test(basePath)) basePath = `${basePath || ""}/chat`;

    return {
        origin: u.origin,               // "https://host[:port]"
        path: `${basePath}/socket.io`,  // "/chat/socket.io" или "/prefix/chat/socket.io"
    };
}

export function createChatSocket() {
    // ⚠️ Моментально читаем актуальную базу из axios (а не при импорте файла)
    const { origin, path } = getSocketConfigFromBase(chatApi.defaults.baseURL);

    return io(origin, {
        transports: ["websocket"],
        path,
        autoConnect: false,
        reconnection: true,
        // withCredentials: true, // если на сервере нужны куки
    });
}
