// src/screenShare/ManagerScreenSharePanel.tsx
import React, { useEffect, useRef, useCallback } from "react";
import { useSip } from "../context/SipContext";
import { useScreenShareViewer } from "./useScreenShareViewer";
import { VideoTile } from "./VideoTile";
import { socket } from "../socket";
import { store } from "../redux/store";

export const ManagerScreenSharePanel: React.FC = () => {
    const { userAgent, enabled } = useSip();
    const { status, error, videoStreams, joinRoom, leaveRoom } =
        useScreenShareViewer({ ua: userAgent });

    const { sipLogin, sessionKey, worker } =
    (store.getState() as any).credentials || {};

    // запоминаем последнюю комнату, к которой подключился менеджер
    const lastRoomRef = useRef<string | null>(null);

    useEffect(() => {
        if (!enabled) return;
        if (!sipLogin || !sessionKey) return;

        const onStart = (p: any) => {
            if (process.env.NODE_ENV !== "production") {
                console.log("[screen_share:start manager]", p);
            }

            const sk = p?.session_key ?? null;
            if (sk && sk !== sessionKey) {
                // не наша сессия
                return;
            }

            const room: string =
                p?.room_id ?? p?.room ?? p?.roomId ?? "";
            if (!room || !room.trim()) {
                console.warn(
                    "[screen_share:start manager] no room/room_id in payload",
                    p
                );
                return;
            }

            if (!enabled) {
                console.warn(
                    "[screen_share] manager got start, but WebRTC disabled in this tab"
                );
                return;
            }

            const normRoom = room.trim();
            lastRoomRef.current = normRoom;

            void joinRoom(normRoom);
        };

        const onStop = (p: any) => {
            const sk = p?.session_key ?? null;
            if (sk && sk !== sessionKey) return;

            // бэк сказал "стоп" — просто выходим из комнаты
            lastRoomRef.current = null;
            leaveRoom();
        };

        socket.on("screen_share:start", onStart);
        socket.on("screen_share:stop", onStop);

        return () => {
            socket.off("screen_share:start", onStart);
            socket.off("screen_share:stop", onStop);
        };
    }, [sipLogin, sessionKey, joinRoom, leaveRoom, enabled]);

    // ручное нажатие на красную кнопку менеджером
    const handleManualStop = useCallback(() => {
        const room = lastRoomRef.current;

        // сначала уведомим бэкенд, что менеджер завершил просмотр
        if (sessionKey && worker && sipLogin && room) {
            socket.emit("screen_share:stop", {
                session_key: sessionKey,
                worker,
                // как вы договорились с бэком — можно оставить sip_login
                sip_login: sipLogin,
                room_id: room,
            });
        }

        // и локально сразу рвём SIP-конференцию
        lastRoomRef.current = null;
        leaveRoom();
    }, [sessionKey, worker, sipLogin, leaveRoom]);

    if (!enabled) return null;

    const hasVideo = videoStreams.length > 0;

    return (
        <div className="card mt-3">
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0">Просмотр экранов операторов</h6>
                    <div className="d-flex align-items-center gap-2">
            <span className="badge bg-secondary">
              {status === "idle" && "нет подключения"}
                {status === "connecting" && "подключение…"}
                {status === "connected" && "подключено"}
            </span>
                        {status !== "idle" && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={handleManualStop}
                            >
                                Отключиться
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className="text-danger small mb-2">{error}</div>}

                {!hasVideo && (
                    <div className="text-muted small">
                        Сейчас нет активной трансляции экрана. Нажмите кнопку «Экран» в
                        таблице диалогов — бэкенд отправит событие <code>screen_share:start</code>,
                        оператор подключится, и вы автоматически присоединитесь к комнате.
                    </div>
                )}

                {hasVideo && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            gap: 12,
                        }}
                    >
                        {videoStreams.map((s, idx) => (
                            <VideoTile key={idx} stream={s} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
