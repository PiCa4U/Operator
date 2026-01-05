import io from "socket.io-client";
import { chatApi } from "./api";

function getSocketConfigFromBase(baseRaw?: string): { origin: string; path: string } {
    let raw = (baseRaw || "").trim();
    if (!raw) {
        const el = document.getElementById("root") as HTMLElement | null;
        raw =
            (window as any).CHAT_SERVER ||
            el?.dataset?.chatServer ||
            el?.dataset?.chatApiBase ||
            el?.dataset?.fsServer ||
            window.location.origin;
    }

    if (raw.startsWith("//")) raw = `${window.location.protocol}${raw}`;
    if (!/^[a-zA-Z][\w+.-]*:\/\//.test(raw)) raw = `${window.location.protocol}//${raw}`;

    const u = new URL(raw);
    let basePath = u.pathname.replace(/\/+$/, "");
    if (!/\/chat$/.test(basePath)) basePath = `${basePath || ""}/chat`;

    return {
        origin: u.origin,
        path: `${basePath}/socket.io`,
    };
}

export function createChatSocket() {
    const { origin, path } = getSocketConfigFromBase(chatApi.defaults.baseURL);

    return io(origin, {
        transports: ["websocket"],
        path,
        autoConnect: false,
        reconnection: true,
    });
}
