// отдельный сокет ТОЛЬКО для чата
import io from "socket.io-client";


// можно переопределить через Vite env (если понадобится)
const BASE = ("https://wwstest.glagol.ai")
    .toString()
    .replace(/\/+$/, "");

export function createChatSocket() {
    // ReturnType<typeof io> нормально работает в TS при default-импорте
    const s = io(BASE, {
        transports: ["websocket"],
        path: "/chat/socket.io",
        autoConnect: false,
        reconnection: true,
    });
    return s;
}
