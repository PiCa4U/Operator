import React, {useEffect} from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../../../redux/store";
import { socket } from "../../../../socket";
import { useOperatorsDirectory } from "../../../../features/signals/useOperatorsDirectory";
import axios from "axios";
import {normalizeUrl} from "../../index";

function normalizeUsers(resp: any): string[] {
    const r = resp?.active_users ?? resp?.result ?? resp;
    if (!Array.isArray(r)) return [];
    return Array.from(new Set(r.map(String).filter(Boolean)));
}

function readLockedBy(resp: any): string | null {
    const r = resp?.locked_by ?? null;
    return r ? String(r) : null;
}

type Props = {
    sipLogin: string;
    ids: number[];
    enabled?: boolean;
    pollMs?: number;
    style?: React.CSSProperties;
    className?: string;
    role: string | undefined
    closeButton: (isLocker?: boolean) => void
    setIsLocker: (isLocker: boolean) => void
};

const ContactUsersPresence: React.FC<Props> = React.memo(
    ({ sipLogin, ids, enabled = true, pollMs = 5000, style, className, role, closeButton, setIsLocker }) => {
        const sessionKey = useSelector((s: RootState) => s.operator.sessionKey);
        const worker = useSelector((s: RootState) => s.credentials.worker || "");
        const glagolParent = useSelector((s: RootState) => (s as any).credentials?.glagolParent || "");
        const isManager = String(role).toLowerCase() === "manager";
        const { data: operatorDict = {} } = useOperatorsDirectory();

        const idsKey = React.useMemo(
            () => (ids || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b).join(","),
            [ids]
        );

        const stableIds = React.useMemo(
            () => (idsKey ? idsKey.split(",").map((s) => Number(s)).filter(Number.isFinite) : []),
            [idsKey]
        );

        const [cardUsers, setCardUsers] = React.useState<string[]>([]);
        const [lockedBy, setLockedBy] = React.useState<string | null>(null);

        const [unlocking, setUnlocking] = React.useState(false);
        const [unlockErr, setUnlockErr] = React.useState<string | null>(null);

        const hasLock = !!lockedBy;
        const lockedByMe = hasLock && String(lockedBy) === String(sipLogin);

        const applyResp = React.useCallback((resp: any) => {
            const users = normalizeUsers(resp);
            const lock = readLockedBy(resp);
            setCardUsers(users);
            setLockedBy(lock);
        }, []);

        useEffect(() => {
            if (hasLock && String(lockedBy) === String(sipLogin)) {
                setIsLocker(true)
            }
        },[lockedBy])

        const requestUsers = React.useCallback(() => {
            if (!stableIds.length) return;

            socket.emit("contact_users", { ids: stableIds, session_key: sessionKey, worker });
        }, [stableIds, sessionKey, worker]);

        const heartbeat = React.useCallback(() => {
            if (!stableIds.length || !sipLogin) return;

            socket.emit("user_in_contact", {
                sip_login: sipLogin,
                ids: stableIds,
                session_key: sessionKey,
                worker,
            });

            requestUsers();
        }, [sipLogin, stableIds, sessionKey, worker, requestUsers]);

        React.useEffect(() => {
            if (!enabled || !sipLogin || !stableIds.length) {
                setCardUsers([]);
                setLockedBy(null);
                setUnlockErr(null);
                return;
            }

            const onUsers = (resp: any) => {
                const r = resp?.data ?? resp?.result ?? resp;
                const respIds = Array.isArray(r?.ids)
                    ? r.ids.map((x: any) => Number(x)).filter(Number.isFinite)
                    : null;

                if (respIds && !stableIds.some((id) => respIds.includes(id))) return;

                applyResp(resp);
            };

            socket.on("contact_users", onUsers);

            heartbeat();
            const pollId = window.setInterval(heartbeat, pollMs);

            return () => {
                window.clearInterval(pollId);
                socket.off("contact_users", onUsers);
            };
        }, [enabled, sipLogin, stableIds, pollMs, heartbeat, applyResp]);

        if (!stableIds.length) return null;


        const canUnlock = hasLock && (lockedByMe || isManager);

        const toName = (login: string) => operatorDict?.[login] || login;
        const toNameWithId = (login: string) => {
            const name = operatorDict?.[login];
            return name ? `${name} (${login})` : login;
        };

        const renderList = (logins: string[]) =>
            logins
                .map((u) => (
                    <span key={u} title={toNameWithId(u)}>
            {toName(u)}
          </span>
                ))
                .reduce((acc: any, el: any, i: number) => (i ? [...acc, ", ", el] : [el]), []);

        const handleUnlock = async () => {
            if (!canUnlock) return;
            if (!stableIds.length) return;

            setUnlockErr(null);
            setUnlocking(true);

            try {
                await axios.post("/api/v1/group_lock/off", {
                    glagol_parent: glagolParent,
                    ids: stableIds,
                });

                // лок снят — обновим отображение
                setLockedBy(null);
                requestUsers();
            } catch (e: any) {
                const msg =
                    typeof e?.response?.data === "string"
                        ? e.response.data
                        : e?.response?.data?.message || e?.message || "Не удалось снять лок";
                setUnlockErr(String(msg));
            } finally {
                setUnlocking(false);
            }
        };

        const iconColor = "#10b981";

        return (
            <div
                className={className}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    margin: "6px 0 12px",
                    flexWrap: "wrap",
                    ...style,
                }}
            >
                <span className="material-icons" style={{ color: iconColor }}>
                  groups
                </span>
                {cardUsers.length ? (
                    <div style={{ fontSize: 13 }}>
                        <strong>В карточке:</strong> {renderList(cardUsers)}
                    </div>
                ) : null}

                {lockedBy ? (
                    <div style={{ fontSize: 13, display: "inline-flex", alignItems: "center", gap: 8 }}>
                        <span>
                          <strong>Закреплено:</strong> <span>{toName(lockedBy)}</span>
                        </span>
                        {canUnlock && (
                            <button
                                type="button"
                                className="btn btn-sm btn-outline-danger"
                                onClick={handleUnlock}
                                disabled={unlocking}
                                title={lockedByMe ? "Снять лок (вы владелец)" : "Снять лок (менеджер)"}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                                <span className="material-icons" style={{ fontSize: 18, lineHeight: 1 }}>
                                  lock_open
                                </span>
                                {unlocking ? "Снимаю..." : "Снять лок"}
                            </button>
                        )}
                    </div>
                ) : null}

                {unlockErr ? (
                    <div style={{ fontSize: 12, color: "#b91c1c" }} title={unlockErr}>
                        {unlockErr}
                    </div>
                ) : null}
                <button
                    onClick={() => closeButton(lockedByMe)}
                    className="btn btn-outline-light text text-dark"
                    style={{
                        position: 'absolute',
                        top: 25,
                        right: 35,
                        padding: '4px 8px',
                        fontSize: 14,
                        lineHeight: 1,
                        zIndex: 1,
                    }}
                >
                    <span className="material-icons" style={{ marginTop: 4 }}>
                        close
                    </span>
                </button>
            </div>
        );
    }
);

export default ContactUsersPresence;
