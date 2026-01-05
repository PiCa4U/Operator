import React, {
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { RootState, store } from "../../../../redux/store";
import { makeSelectFullProjectPool } from "../../../../redux/operatorSlice";
import { FiltersBar } from "./components/FiltersBar";
import {
    ActiveDialogsTable,
    Row,
    ConnectionType,
} from "./components/ActiveDialogsTable";
import { UsersResponse, UserInfo } from "./types";
import Swal from "sweetalert2";
import { socket, stopScreenShareSession } from "../../../../socket";
import { useSip } from "../../../../context/SipContext";
import { useScreenShareViewer } from "../../../../screenShare/useScreenShareViewer";

const serializeRepeat = (params: Record<string, any>) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
        else if (v != null) usp.append(k, String(v));
    });
    return usp.toString();
};

const pickProjectName = (p: any, idFallback: string) =>
    String(
        p?.glagol_name ??
        p?.header ??
        p?.display_name ??
        p?.name ??
        p?.title ??
        p?.description ??
        p?.project_name ??
        idFallback
    );

const pickCanonicalId = (p: any) =>
    String(p?.project_name ?? p?.project ?? p?.id ?? "").trim();

type ProjectOption = { id: string; name: string };

function useProjectDirectory(glagolParent: string, sipLogin: string) {
    const projectPool = useSelector(
        useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin])
    );

    const [projectMap, setProjectMap] = useState<Record<string, string>>({});
    const [canonicalMap, setCanonicalMap] = useState<Record<string, string>>({});

    const mergeProjects = (arr: any[]) => {
        if (!arr?.length) return;
        const nextAny: Record<string, string> = {};
        const nextCanon: Record<string, string> = {};

        arr.forEach((p) => {
            const canon = pickCanonicalId(p);
            if (!canon) return;
            const name = pickProjectName(p, canon);

            nextCanon[canon] = name;
            nextAny[canon] = name;

            const numeric = p?.id != null ? String(p.id) : "";
            if (numeric && numeric !== canon) {
                nextAny[numeric] = name;
            }
        });

        setProjectMap((prev) => ({ ...prev, ...nextAny }));
        setCanonicalMap((prev) => ({ ...prev, ...nextCanon }));
    };

    useEffect(() => {
        mergeProjects(projectPool || []);
    }, [projectPool]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await axios.get("/api/v1/projects", {
                    params: { glagol_parent: glagolParent },
                });
                const arr: any[] =
                    resp.data?.projects ??
                    resp.data?.result ??
                    (Array.isArray(resp.data) ? resp.data : []);
                if (!cancelled) mergeProjects(arr);
            } catch {
                /* no-op */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [glagolParent]);

    const projectOptions: ProjectOption[] = useMemo(
        () =>
            Object.entries(canonicalMap)
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [canonicalMap]
    );

    return { projectMap, canonicalMap, projectOptions };
}

const resolveJoinUuid = (
    row: Row,
    type: ConnectionType
): string | null => {
    const dir = (row.direction || "").toLowerCase();
    const uuid = row.uuid ?? null;
    const bUuid = row.b_uuid ?? null;

    const isTakeover = type === "takeover";
    const listen_only = type === "listen_only"
    const whisper = type === "whisper"
    const barge = type === "barge"
    if (listen_only) {
        if (dir === "outbound") return uuid ?? bUuid;
        if (dir === "inbound") return uuid ?? bUuid;
        return bUuid ?? uuid;
    }
    if (whisper) {
        if (dir === "outbound") return uuid ?? bUuid;
        if (dir === "inbound") return uuid ?? bUuid;
        return bUuid ?? uuid;
    }
    if (barge) {
        // старое поведение
        if (dir === "outbound") return uuid ?? bUuid;
        if (dir === "inbound") return bUuid ?? uuid;
        return bUuid ?? uuid;
    }
    if (isTakeover) {
        // takeover — всё наоборот
        if (dir === "outbound") return uuid ?? uuid;
        if (dir === "inbound") return uuid ?? bUuid;
        return uuid ?? bUuid;
    }
    return null;
};

type JoinInfo = {
    type: ConnectionType;
    managerUuid?: string;
};

export const MonitoringTab: React.FC = () => {
    const {
        sipLogin = "",
        glagolParent = "",
        worker = "",
        sessionKey = "",
    } = (store.getState() as any).credentials || {};

    const { projectMap, canonicalMap, projectOptions } = useProjectDirectory(
        glagolParent,
        sipLogin
    );

    const { userAgent, enabled: webrtcEnabled } = useSip();
    const {
        status: screenStatus,
        error: screenError,
        videoStreams,
        joinRoom,
        leaveRoom,
    } = useScreenShareViewer({ ua: userAgent });

    const [activeScreenOperator, setActiveScreenOperator] = useState<
        string | null
    >(null);

    const lastRoomRef = useRef<string | null>(null);

    useEffect(() => {
        if (!webrtcEnabled) return;
        if (!sipLogin || !sessionKey) return;

        const onStart = (p: any) => {
            if (process.env.NODE_ENV !== "production") {
                console.log("[screen_share:start manager]", p);
            }

            const sk = p?.session_key ?? null;
            if (sk && sk !== sessionKey) return;

            const room: string =
                p?.room_id ?? p?.room ?? p?.roomId ?? "";
            if (!room || !room.trim()) {
                console.warn(
                    "[screen_share:start manager] no room/room_id in payload",
                    p
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

            lastRoomRef.current = null;
            setActiveScreenOperator(null);
            leaveRoom();
        };

        socket.on("screen_share:start", onStart);
        socket.on("screen_share:stop", onStop);

        return () => {
            socket.off("screen_share:start", onStart);
            socket.off("screen_share:stop", onStop);
        };
    }, [webrtcEnabled, sipLogin, sessionKey, joinRoom, leaveRoom]);

    const handleScreenShareStop = useCallback(() => {
        stopScreenShareSession(); // шлём на бек screen_share:stop с текущей room_id
        setActiveScreenOperator(null);
        lastRoomRef.current = null;
        leaveRoom();
    }, [leaveRoom]);

    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [userQuery, setUserQuery] = useState("");

    useEffect(() => {
        if (!selectedProjects.length && projectOptions.length) {
            setSelectedProjects(projectOptions.map((o) => o.id));
        }
    }, [projectOptions]); // eslint-disable-line react-hooks/exhaustive-deps

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [users, setUsers] = useState<Record<string, UserInfo>>({});

    const [pending, setPending] = useState<Record<string, boolean>>({});

    const [joinTypeByTargetUuid, setJoinTypeByTargetUuid] = useState<
        Record<string, ConnectionType>
    >({});

    const rawActiveCalls = useSelector(
        (state: RootState) => state.operator.activeCalls as any
    );
    const activeCalls: any[] = useMemo(() => {
        if (!rawActiveCalls) return [];
        return Array.isArray(rawActiveCalls)
            ? rawActiveCalls
            : Object.values(rawActiveCalls);
    }, [rawActiveCalls]);

    const joinsByTargetUuid = useMemo<Record<string, JoinInfo>>(() => {
        const map: Record<string, JoinInfo> = {};
        const calls = activeCalls || [];

        Object.entries(joinTypeByTargetUuid).forEach(
            ([targetUuid, type]) => {
                let managerUuid: string | undefined;

                for (const c of calls) {
                    if (!c) continue;
                    const appData = String(c.application_data || "").trim();
                    if (!appData || appData !== targetUuid) continue;

                    const rawManagerUuid = String(
                        c.call_uuid || c.uuid || ""
                    ).trim();
                    if (rawManagerUuid) {
                        managerUuid = rawManagerUuid;
                        break;
                    }
                }

                map[targetUuid] = { type, managerUuid };
            }
        );

        return map;
    }, [activeCalls, joinTypeByTargetUuid]);

    const fetchData = async (showSpinner = false) => {
        if (!selectedProjects?.length) {
            setUsers({});
            return;
        }
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const resp = await axios.get<UsersResponse>("/api/v1/users", {
                params: {
                    glagol_parent: glagolParent,
                    projects: selectedProjects,
                },
                paramsSerializer: serializeRepeat,
            });
            setUsers(resp.data?.users || {});
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки");
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    useEffect(() => {
        fetchData(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjects.join("|"), glagolParent]);

    const pollId = useRef<number | null>(null);
    useEffect(() => {
        pollId.current && clearInterval(pollId.current);
        pollId.current = window.setInterval(() => fetchData(false), 3000);
        return () => {
            if (pollId.current) clearInterval(pollId.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjects.join("|"), glagolParent]);

    const selectedNames = useMemo(() => {
        const set = new Set<string>();
        selectedProjects.forEach((id) => {
            set.add(canonicalMap[id] ?? projectMap[id] ?? id);
        });
        return set;
    }, [selectedProjects, canonicalMap, projectMap]);

    const departmentOptions = useMemo(() => {
        const set = new Set<string>();
        Object.values(users || {}).forEach((u) => {
            const dep = (u?.department || "") as string;
            if (dep && dep.trim()) set.add(dep.trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [users]);

    const rows: Row[] = useMemo(() => {
        const q = userQuery.trim().toLowerCase();
        const out: Row[] = [];

        Object.entries(users).forEach(([login, u]) => {
            const talk: any = u?.talk || {};
            const phone = talk?.phone;
            const projectId = talk?.project != null ? String(talk.project) : "";
            if (!phone) return;

            // имя проекта (по любому ключу)
            const projectName: string = (projectMap[projectId] ?? projectId) || "—";

            if (
                selectedNames.size &&
                projectName !== "—" &&
                !selectedNames.has(projectName)
            ) {
                return;
            }

            const dep = (u?.department || null) as string | null;
            if (selectedDepts.length) {
                if (!dep || !selectedDepts.includes(dep)) return;
            }

            const name = u?.name || "";
            const loginLC = login.toLowerCase();
            const nameLC = String(name).toLowerCase();
            if (q && !(loginLC.includes(q) || nameLC.includes(q))) return;

            out.push({
                project: projectName,
                operator: login,
                name: u?.name || undefined,
                department: dep,
                phone: String(phone),
                duration: talk?.duration,
                uuid: talk?.uuid ?? null,
                b_uuid: talk?.b_uuid ?? null,
                direction: talk?.direction ?? null,
            });
        });

        out.sort(
            (a, b) =>
                a.project.localeCompare(b.project) ||
                String(a.department || "").localeCompare(
                    String(b.department || "")
                ) ||
                a.operator.localeCompare(b.operator)
        );
        return out;
    }, [users, selectedDepts, userQuery, projectMap, selectedNames]);

    const markPending = (uuid: string, v: boolean) =>
        setPending((p) => ({ ...p, [uuid]: v }));

    const handleHold = (uuid: string) => {
        if (!uuid || !worker || !sessionKey) return;
        markPending(uuid, true);
        socket.emit("sofia_operations", {
            worker,
            session_key: sessionKey,
            uuid,
            action: "hold_toggle",
        });
        setTimeout(() => markPending(uuid, false), 800);
    };

    const handleHangup = (uuid: string) => {
        if (!uuid || !worker || !sessionKey || !sipLogin) return;

        (async () => {
            const res = await Swal.fire({
                title: "Сбросить звонок?",
                text: "Действие прервёт текущий разговор.",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Сбросить",
                cancelButtonText: "Отмена",
                reverseButtons: true,
                focusCancel: true,
            });

            if (!res.isConfirmed) return;

            markPending(uuid, true);
            socket.emit("sofia_operations", {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                uuid,
                action: "uuid_break",
                idle_set: true,
            });

            setTimeout(() => markPending(uuid, false), 800);
        })();
    };

    const handleJoinCall = (row: Row, connection_type: ConnectionType) => {
        if (!sessionKey || !worker || !sipLogin) {
            Swal.fire({
                icon: "error",
                title: "Невозможно подключиться",
                text: "Нет session_key / worker / sip_login менеджера",
            });
            return;
        }

        const joinUuid = resolveJoinUuid(row, connection_type);

        if (!joinUuid) {
            Swal.fire({
                icon: "error",
                title: "UUID не найден",
                text: "Для этого вызова не удалось определить UUID.",
            });
            return;
        }

        const currentLocalType = joinTypeByTargetUuid[joinUuid];
        const currentJoin = joinsByTargetUuid[joinUuid];

        if (currentLocalType === connection_type) {
            const currentUUID = currentJoin?.managerUuid;

            if (!currentUUID) {
                console.warn(
                    "[join_call] stop: managerUuid ещё не известен, не шлём uuid_break",
                    { joinUuid, currentJoin }
                );
                return;
            }

            console.log("[join_call] stop", {
                joinUuid,
                currentUUID,
                type: connection_type,
            });

            socket.emit("sofia_operations", {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                uuid: currentUUID,
                action: "uuid_break",
                idle_set: true,
            });

            setJoinTypeByTargetUuid((prev) => {
                const copy = { ...prev };
                delete copy[joinUuid];
                return copy;
            });

            return;
        }

        setJoinTypeByTargetUuid((prev) => ({
            ...prev,
            [joinUuid]: connection_type,
        }));

        markPending(joinUuid, true);

        const payload = {
            session_key: sessionKey,
            worker,
            glagol_parent: glagolParent,
            uuid: joinUuid,
            connection_type,
            sip_login: sipLogin,
        };

        if (process.env.NODE_ENV !== "production") {
            console.log("[join_call] start", payload, { row });
        }

        socket.emit("join_call", payload);

        setTimeout(() => markPending(joinUuid, false), 1000);
    };

    const handleScreenShareClick = (operatorLogin: string) => {
        if (!sessionKey || !worker || !sipLogin) {
            Swal.fire({
                icon: "error",
                title: "Невозможно подключиться",
                text: "Нет session_key / worker / manager_login",
            });
            return;
        }

        if (activeScreenOperator === operatorLogin) {
            handleScreenShareStop();
            return;
        }

        if (activeScreenOperator && activeScreenOperator !== operatorLogin) {
            handleScreenShareStop();
        }

        setActiveScreenOperator(operatorLogin);

        socket.emit("screen_share:start", {
            session_key: sessionKey,
            worker,
            manager_login: sipLogin,
            operator_login: operatorLogin,
        });

        if (process.env.NODE_ENV !== "production") {
            console.log("[screen_share] start sent", {
                operator_login: operatorLogin,
                manager_login: sipLogin,
            });
        }
    };

    return (
        <div className="d-flex flex-column gap-3">
            <FiltersBar
                projectOptions={projectOptions}
                selectedProjects={selectedProjects}
                onChangeProjects={setSelectedProjects}
                departmentOptions={departmentOptions}
                selectedDepts={selectedDepts}
                onChangeDepts={setSelectedDepts}
                userQuery={userQuery}
                onChangeUserQuery={setUserQuery}
                onRefresh={() => fetchData(true)}
                loading={loading}
            />

            {error && <div className="alert alert-danger">{error}</div>}

            <ActiveDialogsTable
                loading={loading}
                rows={rows}
                onHold={handleHold}
                onHangup={handleHangup}
                pending={pending}
                onScreenShare={handleScreenShareClick}
                onJoinCall={handleJoinCall}
                joinStatesByTargetUuid={joinsByTargetUuid}
                activeScreenOperator={activeScreenOperator}
                screenShareStatus={screenStatus}
                screenShareError={screenError}
                screenShareStreams={videoStreams}
                onStopScreenShare={handleScreenShareStop}
            />
        </div>
    );
};
