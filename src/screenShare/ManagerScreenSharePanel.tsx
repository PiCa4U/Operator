import React, { useEffect, useRef, useCallback } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { useSip } from "../context/SipContext";
import { useScreenShareViewer } from "./useScreenShareViewer";
import { VideoTile } from "./VideoTile";
import { socket } from "../socket";

const LoadingTile: React.FC<{ text: string; sub?: string }> = ({ text, sub }) => {
    return (
        <div
            style={{
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 12,
                background: "#000",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 10,
                color: "#fff",
                padding: 16,
                textAlign: "center",
            }}
        >
            <style>{`
        @keyframes ssSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
      `}</style>

            <div
                style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    border: "4px solid rgba(255,255,255,0.25)",
                    borderTopColor: "#fff",
                    animation: "ssSpin 1s linear infinite",
                }}
            />
            <div style={{ fontWeight: 800 }}>{text}</div>
            {sub && <div style={{ fontSize: 12, opacity: 0.9 }}>{sub}</div>}
        </div>
    );
};

export const ManagerScreenSharePanel: React.FC = () => {
    const { userAgent, enabled } = useSip();
    const { status, error, videoStreams, joinRoom, leaveRoom } = useScreenShareViewer({ ua: userAgent });

    const { sipLogin, sessionKey, worker } = useSelector((s: RootState) => (s as any).credentials || {});

    const lastRoomRef = useRef<string | null>(null);

    const pickRoomId = (p?: any): string =>
        String(p?.room_id || p?.room || p?.roomId || p?.session_uuid || p?.uuid || "").trim();

    useEffect(() => {
        if (!enabled) return;
        if (!sipLogin || !sessionKey) return;

        const onStart = (p: any) => {
            if (process.env.NODE_ENV !== "production") {
                console.log("[screen_share:start manager]", p);
            }

            const sk = p?.session_key ?? null;
            if (sk && sk !== sessionKey) return;

            const room: string = p?.room_id ?? p?.room ?? p?.roomId ?? "";
            if (!room || !room.trim()) {
                console.warn("[screen_share:start manager] no room/room_id in payload", p);
                return;
            }

            if (!enabled) {
                console.warn("[screen_share] manager got start, but WebRTC disabled in this tab");
                return;
            }

            const normRoom = room.trim();
            lastRoomRef.current = normRoom;

            if (!userAgent) return;

            void joinRoom(normRoom);
        };

        const onStop = (p: any) => {
            const rid = pickRoomId(p);
            if (rid && lastRoomRef.current && rid !== lastRoomRef.current) return;
            lastRoomRef.current = null;
            void leaveRoom();
        };

        socket.on("screen_share:start", onStart);
        socket.on("screen_share:stop", onStop);

        return () => {
            socket.off("screen_share:start", onStart);
            socket.off("screen_share:stop", onStop);
        };
    }, [sipLogin, sessionKey, joinRoom, leaveRoom, enabled, userAgent]);

    useEffect(() => {
        if (!enabled) return;
        if (!userAgent) return;
        const rid = (lastRoomRef.current || "").trim();
        if (!rid) return;
        if (status !== "idle" && videoStreams.length) return;
        void joinRoom(rid);
    }, [enabled, userAgent, joinRoom, status, videoStreams.length]);

    const handleManualStop = useCallback(() => {
        const room = lastRoomRef.current;
        if (sessionKey && worker && sipLogin && room) {
            socket.emit("screen_share:stop", { session_key: sessionKey, worker, sip_login: sipLogin, room_id: room });
        }
        lastRoomRef.current = null;
        void leaveRoom();
    }, [sessionKey, worker, sipLogin, leaveRoom]);

    if (!enabled) return null;

    const hasVideo = videoStreams.length > 0;

    const showWaitingTile = status === "connecting" || (status === "connected" && !hasVideo);

    return (
        <div className="card mt-3">
            <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                    <h6 className="mb-0">Просмотр экранов операторов</h6>
                    <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-secondary">
                            {status === "idle" && "нет подключения"}
                            {status === "connecting" && "подключение…"}
                            {status === "connected" && (hasVideo ? "видео получено" : "ожидаем видео…")}
                        </span>

                        {status !== "idle" && (
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={handleManualStop}>
                                Отключиться
                            </button>
                        )}
                    </div>
                </div>

                {error && <div className="text-danger small mb-2">{error}</div>}

                {showWaitingTile && (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                            gap: 12,
                        }}
                    >
                        <LoadingTile
                            text={status === "connecting" ? "Подключаемся к трансляции…" : "Ожидаем видео…"}
                            sub={
                                status === "connected"
                                    ? "Соединение установлено, но кадров ещё нет (часто ждём keyframe)."
                                    : !userAgent
                                        ? "Ждём инициализацию SIP/WebRTC (UA ещё не готов)."
                                        : "Устанавливаем SIP/WebRTC-сессию."
                            }
                        />
                    </div>
                )}

                {!hasVideo && status === "idle" && (
                    <div className="text-muted small">
                        Сейчас нет активной трансляции экрана. Нажмите кнопку «Экран» в таблице диалогов — бэкенд отправит
                        событие <code>screen_share:start</code>, оператор подключится, и вы автоматически присоединитесь к комнате.
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
                            <VideoTile key={idx} stream={s} title={`Экран оператора (${idx + 1})`} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
