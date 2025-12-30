import React from "react";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../redux/store";
import { socket } from "../socket";
import { clearError, setError, setGrantedOnce, setStatus } from "../redux/screenShareSlice";
import { useSip } from "../context/SipContext";
import { useScreenShareSender } from "./useScreenShareSender";

type StartPayload = {
    room_id?: string;
    uuid?: string;
    session_uuid?: string;
    room?: string;
    roomId?: string;
    [k: string]: any;
};

type StopPayload = {
    room_id?: string;
    uuid?: string;
    session_uuid?: string;
    room?: string;
    roomId?: string;
    [k: string]: any;
};

const pickRoomId = (p?: any): string =>
    String(p?.room_id || p?.room || p?.roomId || p?.session_uuid || p?.uuid || "").trim();

const CHECK_EVENT = "screen_share:check_permission";

export const OperatorScreenSharePanel: React.FC = () => {
    const dispatch = useDispatch();
    const { status, error } = useSelector((s: RootState) => s.screenShare);

    const { worker, sipLogin, sessionKey: credsSessionKey } = useSelector(
        (s: RootState) => (s as any).credentials as any
    );

    const opSessionKey = useSelector((s: RootState) => (s as any).operator?.sessionKey) as
        | string
        | undefined;

    const session_key = String(opSessionKey || credsSessionKey || "").trim();
    const { userAgent } = useSip();

    const pendingRoomRef = React.useRef<string | null>(null);
    const publishingRef = React.useRef(false);
    const acceptGateRef = React.useRef<Map<string, number>>(new Map());
    const currentRoomRef = React.useRef<string | null>(null);

    const sender = useScreenShareSender({
        ua: userAgent,
        onAccessLost: (room) => {
            const rid = String(room || "").trim();
            if (rid && session_key && worker) {
                socket.emit("screen_share:stop", { session_key, worker, room_id: rid });
            }
            pendingRoomRef.current = null;
            currentRoomRef.current = null;
            dispatch(setGrantedOnce(false));
            dispatch(setStatus("idle"));
        },
    });

    const emitAccept = React.useCallback(
        (rid: string) => {
            const room_id = rid.trim();
            if (!room_id) return;

            const now = Date.now();
            const last = acceptGateRef.current.get(room_id) || 0;
            if (now - last < 2500) return;
            acceptGateRef.current.set(room_id, now);

            if (!session_key || !worker || !sipLogin) return;

            socket.emit("screen_share:accept", {
                session_key,
                worker,
                sip_login: sipLogin,
                room_id,
            });
        },
        [session_key, worker, sipLogin]
    );

    const tryPublish = React.useCallback(
        async (rid: string) => {
            const room_id = rid.trim();
            if (!room_id) return;

            if (!sender.hasAccess) return;
            if (!userAgent) return;

            if (publishingRef.current) return;
            publishingRef.current = true;

            try {
                dispatch(clearError());
                dispatch(setStatus("requesting"));

                const ok = await sender.connectToRoom(room_id);
                if (ok) {
                    currentRoomRef.current = room_id;   // ✅ ВАЖНО
                    dispatch(setStatus("sharing"));
                    pendingRoomRef.current = null;
                } else {
                    dispatch(setError(sender.error || "Не удалось подключиться к комнате"));
                    dispatch(setStatus("idle"));
                }
            } finally {
                publishingRef.current = false;
            }
        },
        [dispatch, sender, userAgent]
    );

    const armScreen = React.useCallback(async () => {
        if (sender.hasAccess) return;

        dispatch(clearError());
        dispatch(setStatus("requesting"));

        const ok = await sender.prepareAccessOnce();
        if (!ok) {
            dispatch(setError(sender.error || "Не удалось получить доступ к экрану"));
            dispatch(setStatus("idle"));
            return;
        }

        dispatch(setGrantedOnce(true));
        dispatch(setStatus("idle"));

        const rid = (pendingRoomRef.current || "").trim();
        if (rid) {
            await tryPublish(rid);
        }
    }, [dispatch, sender, tryPublish]);

    React.useEffect(() => {
        const h = () => void armScreen();
        window.addEventListener(CHECK_EVENT as any, h);
        return () => window.removeEventListener(CHECK_EVENT as any, h);
    }, [armScreen]);

    React.useEffect(() => {
        const onStart = async (payload: StartPayload) => {
            const rid = pickRoomId(payload);
            if (!rid) return;

            pendingRoomRef.current = rid;

            // 1) accept сразу
            emitAccept(rid);

            // 2) если уже кастим — перезапустим publish, чтобы менеджер попал на keyframe
            try {
                if (sender.status === "casting" || sender.status === "connecting") {
                    currentRoomRef.current = null;
                    await sender.disconnectFromRoom();
                    await new Promise((r) => setTimeout(r, 250));
                }
            } catch {}

            // 3) если armed + UA ready — publish
            if (sender.hasAccess && userAgent) {
                await tryPublish(rid);
            } else {
                dispatch(setStatus("idle"));
            }
        };

        socket.on("screen_share:start", onStart);
        return () => {
            socket.off("screen_share:start", onStart)
        };
    }, [emitAccept, sender, userAgent, tryPublish, dispatch]);

    React.useEffect(() => {
        const onStop = async (payload: StopPayload) => {
            const rid = pickRoomId(payload);

            const cur = (currentRoomRef.current || "").trim();
            const pend = (pendingRoomRef.current || "").trim();

            // 🔒 если стоп пришёл по старой комнате — игнор
            if (rid && cur && rid !== cur && rid !== pend) {
                if (process.env.NODE_ENV !== "production") {
                    console.log("[operator] ignore stale stop", { rid, cur, pend, payload });
                }
                return;
            }

            // если стоп по pending — просто отменяем ожидание
            if (rid && pend && rid === pend && (!cur || cur !== rid)) {
                pendingRoomRef.current = null;
                dispatch(setStatus("idle"));
                return;
            }

            pendingRoomRef.current = null;
            currentRoomRef.current = null;

            try {
                await sender.disconnectFromRoom();
            } catch {}

            dispatch(setStatus("idle"));
        };

        socket.on("screen_share:stop", onStop);
        return () => {
            socket.off("screen_share:stop", onStop);
        }
    }, [sender, dispatch]);

    React.useEffect(() => {
        const rid = pendingRoomRef.current;
        if (!rid) return;
        if (!sender.hasAccess) return;
        if (!userAgent) return;
        void tryPublish(rid);
    }, [sender.hasAccess, userAgent, tryPublish]);

    const showUi =
        !sender.hasAccess || status === "requesting" || Boolean(error) || Boolean(sender.error);

    if (!showUi) return null;

    return (
        <div
            style={{
                background: "#fff8e1",
                borderBottom: "1px solid #ffe08a",
                padding: "10px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
            }}
        >
            <div style={{ fontSize: 18, lineHeight: 1 }}>🖥️</div>

            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>Нужна демонстрация экрана</div>
                <div style={{ fontSize: 13 }}>
                    Без разрешённой демонстрации экрана <b>WebRTC-телефония не включится</b>. Нажмите кнопку и
                    выберите экран/окно в браузере.
                </div>

                {(error || sender.error) && (
                    <div style={{ marginTop: 6, color: "#b42318", fontSize: 12 }}>
                        {error || sender.error}
                    </div>
                )}
            </div>

            <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => window.dispatchEvent(new CustomEvent(CHECK_EVENT))}
                disabled={status === "requesting"}
                type="button"
            >
                {status === "requesting" ? "Запрашиваем..." : "Разрешить экран"}
            </button>
        </div>
    );
};
