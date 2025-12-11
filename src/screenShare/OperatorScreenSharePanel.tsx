// src/screenShare/OperatorScreenSharePanel.tsx
import React, { useEffect } from "react";
import { useSip } from "../context/SipContext";
import { useScreenShareSender } from "./useScreenShareSender";
import { socket } from "../socket";
import { store } from "../redux/store";

export const OperatorScreenSharePanel: React.FC = () => {
    const { userAgent, enabled } = useSip();
    const {
        status,
        error,
        hasAccess,
        // previewStream,  // в хедере не показываем превью
        prepareAccessOnce,
        connectToRoom,
        disconnectFromRoom,
        stopAccess,
    } = useScreenShareSender({ ua: userAgent });

    const { sipLogin, sessionKey, worker } =
    (store.getState() as any).credentials || {};

    // Подписка на события screen_share от бэка
    useEffect(() => {
        if (!enabled) return;
        if (!sipLogin) return;

        const onStart = async (p: any) => {
            const loginFromPayload =
                p?.operator_login ?? p?.sip_login ?? p?.login ?? null;
            if (loginFromPayload && loginFromPayload !== sipLogin) return;

            const room: string =
                p?.room_id ?? p?.room ?? p?.roomId ?? "";
            if (!room || !room.trim()) return;
            if (!enabled) return;

            // если нет доступа к экрану — просто ничего не делаем
            if (!hasAccess) {
                if (process.env.NODE_ENV !== "production") {
                    console.warn(
                        "[screen_share] operator has no access, did not press 'Разрешить экран'"
                    );
                }
                return;
            }

            // Для бэка всё равно шлём accept
            if (sessionKey && worker) {
                socket.emit("screen_share:accept", {
                    session_key: sessionKey,
                    worker,
                    sip_login: sipLogin,
                    room_id: room,
                });
            }

            try {
                await connectToRoom(room.trim());
            } catch (e) {
                console.error("[screenShare] operator auto-connect error", e);
            }
        };

        const onStop = (p: any) => {
            const loginFromPayload =
                p?.operator_login ?? p?.sip_login ?? p?.login ?? null;
            if (loginFromPayload && loginFromPayload !== sipLogin) return;
            void disconnectFromRoom();
        };

        socket.on("screen_share:start", onStart);
        socket.on("screen_share:stop", onStop);

        return () => {
            socket.off("screen_share:start", onStart);
            socket.off("screen_share:stop", onStop);
        };
    }, [
        enabled,
        sipLogin,
        sessionKey,
        worker,
        hasAccess,
        connectToRoom,
        disconnectFromRoom,
    ]);

    // Если WebRTC в этой вкладке не включён — вообще ничего не рисуем
    if (!enabled) return null;

    const isCasting = status === "casting" || status === "connecting";

    let badgeText = "Нет доступа к экрану";
    let badgeClass = "bg-warning text-dark";
    let descText =
        "Нужно один раз разрешить захват экрана в браузере, чтобы менеджер мог смотреть ваш экран.";

    if (hasAccess && !isCasting) {
        badgeText = "Экран готов к показу";
        badgeClass = "bg-success";
        descText = "При запросе менеджера экран подключится автоматически без повторных вопросов.";
    }

    if (isCasting) {
        badgeText = status === "connecting" ? "Подключение экрана…" : "Экран просматривают";
        badgeClass = "bg-danger";
        descText = "Менеджер сейчас видит ваш экран. Вы можете отключить показ в любой момент.";
    }

    return (
        <div
            style={{
                borderBottom: "1px solid #e5e7eb",
                background: "#f8fafc",
                padding: "6px 16px",
            }}
        >
            <div className="d-flex align-items-center gap-2 small">
                <span className={`badge ${badgeClass}`}>{badgeText}</span>

                <span className="text-muted" style={{ flex: 1, minWidth: 0 }}>
                    {descText}
                    {error && (
                        <span style={{ color: "#b42318", marginLeft: 6 }}>
              · {error}
            </span>
                    )}
                </span>

                {/* Кнопки справа */}
                {!hasAccess && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={prepareAccessOnce}
                    >
                        Разрешить экран
                    </button>
                )}

                {isCasting && (
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        onClick={disconnectFromRoom}
                        title="Отключить экран от комнаты"
                    >
                        Отключить
                    </button>
                )}
            </div>
        </div>
    );
};
