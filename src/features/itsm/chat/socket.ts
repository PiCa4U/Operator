import io from "socket.io-client";
import { chatApi } from "./api";

const isLocalhost = () =>
    ["localhost", "127.0.0.1"].includes(window.location.hostname);

const DEFAULT_CHAT_SERVER_ON_LOCAL = "https://wwstest.glagol.ai/chat";

function getSocketConfigFromBase(baseRaw?: string): { origin: string; path: string } {
    let raw = (baseRaw || "").trim();

    if (!raw) {
        const el = document.getElementById("root") as HTMLElement | null;

        raw =
            localStorage.getItem("CHAT_SERVER") ||
            (window as any).CHAT_SERVER ||
            el?.dataset?.chatServer ||
            el?.dataset?.chatApiBase ||
            el?.dataset?.fsServer ||
            (process.env.REACT_APP_CHAT_SERVER as string | undefined) ||
            (isLocalhost() ? DEFAULT_CHAT_SERVER_ON_LOCAL : window.location.origin);
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
