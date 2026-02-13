import React, {useCallback, useEffect, useMemo, useRef, useState} from "react";
import * as XLSX from "xlsx";
import { useOperators } from "./hooks";
import { Agent, Role } from "./types";
import { OperatorModal } from "./components/operatorModal";
import axios from "axios";
import OperatorsSelect from "./components/select";
import Swal from "sweetalert2";
import { socket, stopScreenShareSession } from "../../../../socket";
import {RootState, store} from "../../../../redux/store";
import { OperatorLogModal } from "./components/operatorLogModal";
import { OperatorActivityModal } from "./components/operatorActivityModal";
import {useSip} from "../../../../context/SipContext";
import {useScreenShareViewer} from "../../../../screenShare/useScreenShareViewer";
import {VideoTile} from "../../../../screenShare/VideoTile";
import {markViewerInitiated} from "../../../../screenShare/screenShareLocalIntent";
import {useSelector} from "react-redux";

type Metrics = {
    count?: number | string;
    talk?: number | string;
    wait?: number | string;
    not_responding?: number | string;
};

type PerCategory = {
    __total__?: Metrics;
    [project: string]: Metrics | undefined;
};

type RespPerUser = {
    outbound?: PerCategory;
    inbound?: PerCategory;
    express?: PerCategory;
    missed?: PerCategory;
    // блоки времени
    online?: Record<string, string> & { total?: string };
    break?: Record<string, string> & { total?: string };
    study?: Record<string, string> & { total?: string };
    lunch?: Record<string, string> & { total?: string };
    db_compare?: Record<string, string> & { total?: string };
    admin?: Record<string, string> & { total?: string };
    logged_out?: Record<string, string> & { total?: string };
    post_time?: Record<string, string> & { total?: string };

    ui_activity?: string;
};

type StatesAndStatusesResp = {
    status: "success" | "error";
    result?: Record<string, RespPerUser>;
    message?: string;
};

function pickPrimaryInterCall(list: any[]) {
    const arr = (list || []).filter(Boolean);
    if (!arr.length) return null;

    const weight = (c: any) => {
        const st = String(c?.callstate ?? "").toUpperCase();
        if (st === "ACTIVE") return 30;
        if (st === "EARLY") return 20;
        return 10;
    };
    const epoch = (c: any) => Number(c?.created_epoch ?? 0) || 0;

    return [...arr].sort((a, b) => {
        const dw = weight(b) - weight(a);
        if (dw) return dw;
        return epoch(b) - epoch(a);
    })[0];
}
const n = (v: any): number => (typeof v === "number" ? v : Number(v) || 0);
const secToHMS = (sec?: number | string) => {
    const s = n(sec);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = Math.floor(s % 60);
    const pad = (x: number) => String(x).padStart(2, "0");
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
};
const strHMS = (v?: string) => (typeof v === "string" && v.includes(":") ? v : "00:00:00");

type Category = "outbound" | "inbound" | "express" | "missed";
type Subcol = { key: keyof Metrics; title: string; fmt: (v: any) => string };

const CAT_TITLES: Record<Category, string> = {
    outbound: "Исходящие",
    inbound: "Входящие",
    express: "Экспресс",
    missed: "Пропущенные",
};

const CAT_SUBCOLS: Record<Category, readonly Subcol[]> = {
    outbound: [
        { key: "count", title: "Всего", fmt: (v) => String(n(v)) },
        { key: "talk", title: "В разговоре", fmt: (v) => secToHMS(v) },
        { key: "wait", title: "Ожидание ответа", fmt: (v) => secToHMS(v) },
        { key: "not_responding", title: "Время подъёма трубки", fmt: (v) => secToHMS(v) },
    ],
    inbound: [
        { key: "count", title: "Всего", fmt: (v) => String(n(v)) },
        { key: "talk", title: "В разговоре", fmt: (v) => secToHMS(v) },
        { key: "not_responding", title: "Время подъёма трубки", fmt: (v) => secToHMS(v) },
    ],
    express: [
        { key: "count", title: "Всего", fmt: (v) => String(n(v)) },
        { key: "talk", title: "В разговоре", fmt: (v) => secToHMS(v) },
        { key: "not_responding", title: "Время подъёма трубки", fmt: (v) => secToHMS(v) },
    ],
    missed: [
        { key: "count", title: "Всего", fmt: (v) => String(n(v)) },
        { key: "not_responding", title: "Время подъёма трубки", fmt: (v) => secToHMS(v) },
    ],
};

const TIME_KEYS = ["online", "post_time", "break", "logged_out", "ui_activity"] as const;
const TIME_TITLES: Record<(typeof TIME_KEYS)[number], string> = {
    online: "Онлайн",
    post_time: "Постобработка",
    break: "Перерыв",
    logged_out: "Оффлайн",
    ui_activity: "Активность в UI",
};

const usersParamsSerializer = (
    glagol_parent: string,
    users: (string | number)[],
    date_start: string,
    date_end: string
) => {
    const usp = new URLSearchParams();
    usp.set("glagol_parent", glagol_parent);
    users.forEach((u) => usp.append("users", String(u)));
    usp.set("date_start", date_start);
    usp.set("date_end", date_end);
    return usp.toString();
};


export const OperatorsTab: React.FC = () => {
    const {
        filters,
        setFilters,
        query,
        filtered,
        mutateDelete,
        mutateUpdate,
        departments,
        mutateAddTier,
        mutateRemoveTier,
        mutateCreate,
    } = useOperators();

    const { sessionKey } = store.getState().operator;
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = '',
    } = store.getState().credentials;


    const [selected, setSelected] = useState<Record<Agent["login"], boolean>>({});
    const selectedLogins = useMemo(() => Object.keys(selected).filter((l) => selected[l]), [selected]);

    const OPERATORS_ROWS_PER_PAGE_KEY = "operatorsRowsPerPage";
    const DEFAULT_ROWS_PER_PAGE = 10;

    const [rowsPerPage, setRowsPerPage] = useState<number>(() => {
        const raw = localStorage.getItem(OPERATORS_ROWS_PER_PAGE_KEY);
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROWS_PER_PAGE;
    });

    const [page, setPage] = useState(1);
    const [pageInput, setPageInput] = useState("1");

    const rawInterCalls = useSelector((state: RootState) => (state.operator as any).interCalls);

    const interCalls: any[] = useMemo(() => {
        return Array.isArray(rawInterCalls) ? rawInterCalls : Object.values(rawInterCalls || {});
    }, [rawInterCalls]);

    const interCall = useMemo(() => pickPrimaryInterCall(interCalls), [interCalls]);

    const hasInterCall = !!interCall;

    const [dialingLogin, setDialingLogin] = useState<string | null>(null);

    useEffect(() => {
        if (hasInterCall) setDialingLogin(null);
    }, [hasInterCall]);


    useEffect(() => {
        localStorage.setItem(OPERATORS_ROWS_PER_PAGE_KEY, String(rowsPerPage));
        setPage(1);
    }, [rowsPerPage]);

    useEffect(() => setPageInput(String(page)), [page]);

    const total = filtered.length;
    const pageCount = Math.max(1, Math.ceil(total / rowsPerPage));
    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    const startIdx = (page - 1) * rowsPerPage;
    const endIdx = Math.min(total, startIdx + rowsPerPage);
    const pageItems = useMemo(() => filtered.slice(startIdx, endIdx), [filtered, startIdx, endIdx]);

    const allCheckedOnPage = useMemo(
        () => pageItems.length > 0 && pageItems.every((a) => selected[a.login]),
        [pageItems, selected]
    );

    const [modalOpen, setModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<"create" | "edit">("create");
    const [editing, setEditing] = useState<Agent | null>(null);

    const glagol_parent = glagolParent;
    const [projMap, setProjMap] = useState<Record<string, string>>({});
    const [logUserId, setLogUserId] = useState<string | null>(null);
    const [activityUserId, setActivityUserId] = useState<string | null>(null);

    const activityUserTitle = useMemo(() => {
        if (!activityUserId) return "";
        const found = filtered.find((a) => a.login === activityUserId);
        return found?.name || activityUserId;
    }, [filtered, activityUserId]);


    const [reportCollapsed, setReportCollapsed] = useState(false);

    const pageBeforeSearchRef = useRef<number>(1);
    const prevSearchRef = useRef<string>("");

    useEffect(() => {
        const cur = (filters.name ?? "").trim();
        const prev = prevSearchRef.current;

        if (prev === "" && cur !== "") {
            pageBeforeSearchRef.current = page;
        }

        if (prev !== "" && cur === "") {
            const desired = pageBeforeSearchRef.current;
            const target = Math.max(1, Math.min(pageCount, desired));
            if (target !== page) setPage(target);
        }

        prevSearchRef.current = cur;
    }, [filters.name, pageCount, page]);

    const { userAgent, enabled: webrtcEnabled, callOperator, makeCall, status: sipStatus } = useSip();
    const {
        status: screenStatus,
        error: screenError,
        videoStreams: screenShareStreams,
        joinRoom,
        leaveRoom,
    } = useScreenShareViewer({ ua: userAgent });

    const [activeScreenOperator, setActiveScreenOperator] = useState<string | null>(null);

    const lastRoomRef = useRef<string | null>(null);

    const handleCallOperator = useCallback(async (operatorLogin: string) => {
        if (!webrtcEnabled) {
            Swal.fire({ icon: "info", title: "Телефония выключена", timer: 1500, showConfirmButton: false });
            return;
        }

        setDialingLogin(operatorLogin);

        try {
            if (callOperator) await callOperator(operatorLogin);
            else await makeCall(String(operatorLogin));

        } catch (e: any) {
            console.error(e);
            setDialingLogin(null);
            Swal.fire({ icon: "error", title: "Не удалось позвонить", text: String(e?.message || e) });
        }
    }, [webrtcEnabled, callOperator, makeCall]);

    useEffect(() => {
        if (!webrtcEnabled) return;
        if (!sipLogin || !sessionKey) return;

        const onStart = (p: any) => {
            const mgr = p?.manager_login ?? p?.viewer_login;
            if (mgr && String(mgr) !== String(sipLogin)) return;

            const room = (p?.room_id ?? p?.room ?? p?.roomId ?? "").trim();
            if (!room) return;

            lastRoomRef.current = room;
            void joinRoom(room);
        };

        const pickRoomId = (p?: any) =>
            String(p?.room_id || p?.room || p?.roomId || p?.session_uuid || p?.uuid || "").trim();

        const onStop = (p: any) => {
            const mgr = p?.manager_login ?? p?.viewer_login;
            if (mgr && String(mgr) !== String(sipLogin)) return;

            const rid = pickRoomId(p);

            if (rid && lastRoomRef.current && rid !== lastRoomRef.current) {
                if (process.env.NODE_ENV !== "production") {
                    console.log("[manager] ignore stale stop", { rid, current: lastRoomRef.current, p });
                }
                return;
            }

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

    const tableH = activeScreenOperator ? "75vh" : "50vh";
    const handleScreenShareStop = useCallback(() => {
        stopScreenShareSession(lastRoomRef.current); // ✅ важно
        setActiveScreenOperator(null);
        lastRoomRef.current = null;
        leaveRoom();
    }, [leaveRoom]);

    const handleScreenShareClick = useCallback((operatorLogin: string) => {
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
        markViewerInitiated();

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
    }, [activeScreenOperator, handleScreenShareStop, sessionKey, worker, sipLogin]);

    useEffect(() => {
        let mounted = true;
        axios
            .get("/api/v1/projects", { params: { glagol_parent } })
            .then((resp) => {
                const arr = Array.isArray(resp.data?.projects) ? resp.data.projects : [];
                const map: Record<string, string> = {};
                for (const p of arr) {
                    const key = p?.project_name;
                    if (!key) continue;
                    map[key] = p?.glagol_name || key;
                }
                if (mounted) setProjMap(map);
            })
            .catch((err) => {
                console.error("Не удалось загрузить список проектов", err);
            });
        return () => {
            mounted = false;
        };
    }, [glagol_parent]);

    const ROBOT_LABELS = ["Робот", "Оператор"] as const;
    const ONLINE_LABELS = ["Онлайн", "Оффлайн"] as const;

    const robotToLabel = (v: "all" | "robot" | "human"): string | null =>
        v === "robot" ? "Робот" : v === "human" ? "Оператор" : null;
    const labelToRobot = (label: string | null): "all" | "robot" | "human" =>
        label === "Робот" ? "robot" : label === "Оператор" ? "human" : "all";
    const onlineToLabel = (v: "all" | "online" | "offline"): string | null =>
        v === "online" ? "Онлайн" : v === "offline" ? "Оффлайн" : null;
    const labelToOnline = (label: string | null): "all" | "online" | "offline" =>
        label === "Онлайн" ? "online" : label === "Оффлайн" ? "offline" : "all";
    const norm = (s?: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

    const getStatusBadgeClass = (status?: boolean) => {
        if (!status) return "badge bg-danger";
        if (status) return "badge bg-success";
        return "badge bg-info";
    };

    const getTelephonyState = (a: any): { text: string; cls: string } => {
        const s = norm(a?.status);
        const st = norm(a?.state);
        const post = !!a?.post;
        const fs = Boolean(a?.fs_status);

        if (post) return { text: "В постобработке", cls: "badge bg-warning text-dark" };
        if (s.includes("on break")) return { text: "Перерыв", cls: "badge bg-warning text-dark" };
        if (s.includes("logged out") || fs === false) return { text: "Не на линии", cls: "badge bg-danger" };

        if (st.includes("queue call")) return { text: "В активном звонке", cls: "badge bg-warning text-dark" };

        if (st.includes("waiting") && s.includes("available"))
            return { text: "На линии", cls: "badge bg-success" };

        if (st.includes("idle")) return { text: "В постобработке", cls: "badge bg-warning text-dark" };

        return { text: "Не на линии", cls: "badge bg-secondary" };
    };

    const openCreate = () => {
        setEditing(null);
        setModalMode("create");
        setModalOpen(true);
    };
    const openEdit = (agent: Agent) => {
        setEditing(agent);
        setModalMode("edit");
        setModalOpen(true);
    };

    const roleName = (role: string) => {
        if (role === "admin") return "Админ";
        if (role === "manager") return "Менеджер";
        if (role === "operator") return "Оператор";
        return role;
    };

    const handleDepartmentBlur = (login: string) => (e: React.FocusEvent<HTMLInputElement>) => {
        const next = e.currentTarget.value.trim();
        mutateUpdate.mutate({ login, department: next || undefined });
    };

    const handleRoleChange = (login: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
        const role = e.currentTarget.value as Role;
        mutateUpdate.mutate({ login, role });
    };

    const goToPage = (n: number) => setPage(Math.max(1, Math.min(pageCount, n || 1)));
    const commitPageInput = () => {
        const n = parseInt(pageInput, 10);
        if (Number.isFinite(n)) goToPage(n);
        else setPageInput(String(page));
    };

    const handleStartFs = (login: string, reason?: string, idle_set?: boolean) => {
        socket.emit("change_status_fs", {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: "available",
            reason,
            idle_set,
            page: "online",
        });
        socket.emit("change_state_fs", {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: "available",
            state: "waiting",
            reason,
            page: "online",
        });
    };

    const handlePauseFs = async (status: string, login: string) => {
        if (status === "Available") {
            const { value: reason } = await Swal.fire({
                title: "Укажите причину перерыва",
                input: "select",
                inputOptions: {
                    break: "Перерыв",
                    study: "Обучение",
                    admin: "Административный",
                    lunch: "Обед",
                },
                inputPlaceholder: "Выберите опцию",
                showCancelButton: true,
            });
            if (!reason) return;
            socket.emit("change_status_fs", {
                sip_login: login,
                worker,
                session_key: sessionKey,
                action: "pause",
                reason,
                page: "online",
            });
        } else {
            socket.emit("change_status_fs", {
                sip_login: login,
                worker,
                session_key: sessionKey,
                action: "available",
                page: "online",
            });
        }
    };

    const handleLogoutFs = (login: string) => {
        socket.emit("change_status_fs", {
            sip_login: login,
            worker,
            session_key: sessionKey,
            action: "logout",
            page: "online",
        });
    };

    const getActiveCall = (a: any) => {
        const t = a?.talk;
        if (!t || typeof t !== "object") return null;
        if (Object.keys(t).length === 0) return null;
        const phone = (t as any).phone ?? (t as any).to ?? (t as any).number ?? "";
        const projectCode = (t as any).project as string | undefined;
        const projectName = projectCode ? (projMap[projectCode] ?? projectCode) : undefined;
        const duration = (t as any).duration as string | undefined;
        return { phone, projectName, duration };
    };

    const stickyTh: React.CSSProperties = {
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: "#fff",
        boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.08)",
    };

    const todayISO = new Date().toISOString().slice(0, 10);
    const [dateStart, setDateStart] = useState<string>(todayISO);
    const [dateEnd, setDateEnd]   = useState<string>(todayISO);

    type Row = {
        __login: string;
        __name: string;
        time__online: string;
        time__post_time: string;
        time__break: string;
        time__logged_out: string;
        time__ui_activity: string;
        [k: string]: any;
    };

    type ReportState = {
        projects: Record<Category, string[]>;
        rows: Row[];
    } | null;

    const [report, setReport] = useState<ReportState>(null);
    const [loadingReport, setLoadingReport] = useState(false);

    const fetchReport = async () => {
        if (!selectedLogins.length) {
            Swal.fire({ icon: "info", title: "Выберите операторов", timer: 1500, showConfirmButton: false });
            return;
        }
        setLoadingReport(true);
        try {
            const params = { glagol_parent, users: selectedLogins, date_start: dateStart, date_end: dateEnd };
            const resp = await axios.get<StatesAndStatusesResp>("/api/v1/states_and_statuses", {
                params,
                paramsSerializer: () => usersParamsSerializer(glagol_parent, selectedLogins, dateStart, dateEnd),
            });

            if (resp.data?.status !== "success") throw new Error(resp.data?.message || "request failed");
            const result = resp.data?.result || {};

            const projSets: Record<Category, Set<string>> = {
                outbound: new Set<string>(),
                inbound: new Set<string>(),
                express: new Set<string>(),
                missed: new Set<string>(),
            };

            for (const login of Object.keys(result)) {
                const u = result[login] || {};
                (["outbound", "inbound", "express", "missed"] as Category[]).forEach((cat) => {
                    const perCat = (u as any)[cat] || {};
                    Object.keys(perCat).forEach((k) => {
                        if (k && k !== "__total__") projSets[cat].add(k);
                    });
                });
            }

            const projects: Record<Category, string[]> = {
                outbound: Array.from(projSets.outbound).sort((a, b) => (projMap[a] || a).localeCompare(projMap[b] || b, "ru")),
                inbound: Array.from(projSets.inbound).sort((a, b) => (projMap[a] || a).localeCompare(projMap[b] || b, "ru")),
                express: Array.from(projSets.express).sort((a, b) => (projMap[a] || a).localeCompare(projMap[b] || b, "ru")),
                missed: Array.from(projSets.missed).sort((a, b) => (projMap[a] || a).localeCompare(projMap[b] || b, "ru")),
            };

            const byLogin: Record<string, RespPerUser> = result as any;
            const rows: Row[] = selectedLogins.map((login) => {
                const agent = filtered.find((x) => x.login === login);
                const perUser = byLogin[login] || {};

                const row: Row = {
                    __login: login,
                    __name: agent?.name || login,
                    time__online: strHMS(perUser.online?.total),
                    time__post_time: strHMS(perUser.post_time?.total),
                    time__break: strHMS(perUser.break?.total),
                    time__logged_out: strHMS(perUser.logged_out?.total),
                    time__ui_activity: strHMS(perUser.ui_activity),
                };

                (["outbound", "inbound", "express", "missed"] as Category[]).forEach((cat) => {
                    const perCat = (perUser as any)[cat] || {};
                    const total: Metrics = (perCat["__total__"] || {}) as Metrics;

                    for (const sc of CAT_SUBCOLS[cat]) {
                        row[`${cat}__total__${sc.key}`] = total[sc.key] ?? 0;
                    }

                    for (const p of projects[cat]) {
                        const m = (perCat[p] || {}) as Metrics;
                        for (const sc of CAT_SUBCOLS[cat]) {
                            row[`${cat}__${p}__${sc.key}`] = m[sc.key] ?? 0;
                        }
                    }
                });

                return row;
            });

            setReport({ projects, rows });
            setReportCollapsed(false);
        } catch (e: any) {
            console.error(e);
            Swal.fire({ icon: "error", title: "Ошибка при формировании отчёта", text: String(e?.message || e) });
        } finally {
            setLoadingReport(false);
        }
    };

    const exportXlsx = () => {
        if (!report) return;
        const catOrder: Category[] = ["outbound", "inbound", "express", "missed"];
        const { projects, rows } = report;

        const timeCols = TIME_KEYS.length;
        const topRow: any[] = ["Оператор"];

        topRow.push("Время");
        for (let i = 0; i < timeCols - 1; i++) topRow.push("");

        for (const cat of catOrder) {
            const subcols = CAT_SUBCOLS[cat].length;
            const groupCols = (1 + projects[cat].length) * subcols;
            topRow.push(CAT_TITLES[cat]);
            for (let i = 0; i < groupCols - 1; i++) topRow.push("");
        }

        const secondRow: any[] = [""];
        for (const tk of TIME_KEYS) secondRow.push(TIME_TITLES[tk]);

        for (const cat of catOrder) {
            const subcols = CAT_SUBCOLS[cat].length;
            secondRow.push("Итого");
            for (let i = 0; i < subcols - 1; i++) secondRow.push("");
            for (const p of projects[cat]) {
                secondRow.push(projMap[p] || p);
                for (let i = 0; i < subcols - 1; i++) secondRow.push("");
            }
        }

        const thirdRow: any[] = [""];
        for (let i = 0; i < timeCols; i++) thirdRow.push("");
        for (const cat of catOrder) {
            for (let i = 0; i < 1 + projects[cat].length; i++) {
                for (const sc of CAT_SUBCOLS[cat]) thirdRow.push(sc.title);
            }
        }

        const dataRows = rows.map((r) => {
            const arr: any[] = [r.__name];

            for (const tk of TIME_KEYS) {
                arr.push((r as any)[`time__${tk}`]);
            }

            for (const cat of catOrder) {
                const subcols = CAT_SUBCOLS[cat];
                for (const sc of subcols) arr.push(sc.fmt(r[`${cat}__total__${sc.key}`]));
                for (const p of projects[cat]) {
                    for (const sc of subcols) arr.push(sc.fmt(r[`${cat}__${p}__${sc.key}`]));
                }
            }

            return arr;
        });

        const aoa = [topRow, secondRow, thirdRow, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        const merges: XLSX.Range[] = [];
        merges.push({ s: { r: 0, c: 0 }, e: { r: 2, c: 0 } });

        merges.push({ s: { r: 0, c: 1 }, e: { r: 0, c: 1 + timeCols - 1 } });

        let colStart = 1 + timeCols;
        for (const cat of ["outbound", "inbound", "express", "missed"] as Category[]) {
            const subcols = CAT_SUBCOLS[cat].length;
            const groupCols = (1 + projects[cat].length) * subcols;
            merges.push({ s: { r: 0, c: colStart }, e: { r: 0, c: colStart + groupCols - 1 } });
            merges.push({ s: { r: 1, c: colStart }, e: { r: 1, c: colStart + subcols - 1 } });
            let pCol = colStart + subcols;
            for (let i = 0; i < projects[cat].length; i++) {
                merges.push({ s: { r: 1, c: pCol }, e: { r: 1, c: pCol + subcols - 1 } });
                pCol += subcols;
            }
            colStart += groupCols;
        }

        (ws as any)["!merges"] = merges;

        const cols = [{ wch: 22 }]; // Оператор
        for (let i = 0; i < timeCols; i++) cols.push({ wch: 14 });
        for (const cat of ["outbound", "inbound", "express", "missed"] as Category[]) {
            const subcols = CAT_SUBCOLS[cat].length;
            const groupCols = (1 + projects[cat].length) * subcols;
            for (let i = 0; i < groupCols; i++) cols.push({ wch: 14 });
        }
        (ws as any)["!cols"] = cols as any;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Отчёт");
        XLSX.writeFile(wb, `operators-fullreport-${dateStart}_to_${dateEnd}.xlsx`);
    };



    return (
        <div className="d-flex flex-column gap-3">
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 10 }}>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 12,
                        alignItems: "end",
                    }}
                >
                    <div style={{ flex: "1 1 280px", maxWidth: 360 }}>
                        <label className="form-label mb-1">Поиск</label>
                        <input
                            className="form-control"
                            value={filters.name}
                            onChange={(e) => {
                                const v = e.currentTarget.value;
                                setFilters((f) => ({ ...f, name: v }));
                            }}
                            placeholder="ФИО или логин"
                        />
                    </div>

                    <div style={{ flex: "1 1 320px", maxWidth: 360 }}>
                        <label className="form-label mb-1">Отдел(ы)</label>
                        <OperatorsSelect
                            isMulti
                            value={filters.departments}
                            options={departments}
                            onChange={(vals: any) => {
                                setFilters((f) => ({ ...f, departments: vals, department: null }));
                                setPage(1);
                            }}
                            placeholder="Все отделы"
                        />
                    </div>

                    <div style={{ flex: "1 1 220px", maxWidth: 260 }}>
                        <label className="form-label mb-1">Роботы</label>
                        <OperatorsSelect
                            value={(() => (filters.robot === "robot" ? "Робот" : filters.robot === "human" ? "Оператор" : null))()}
                            options={["Робот", "Оператор"]}
                            onChange={(label: any) => {
                                const v = label === "Робот" ? "robot" : label === "Оператор" ? "human" : "all";
                                setFilters((f) => ({ ...f, robot: v }));
                                setPage(1);
                            }}
                            placeholder="Все"
                        />
                    </div>

                    <div style={{ flex: "1 1 220px", maxWidth: 260 }}>
                        <label className="form-label mb-1">Онлайн</label>
                        <OperatorsSelect
                            value={(() => (filters.online === "online" ? "Онлайн" : filters.online === "offline" ? "Оффлайн" : null))()}
                            options={["Онлайн", "Оффлайн"]}
                            onChange={(label: any) => {
                                const v = label === "Онлайн" ? "online" : label === "Оффлайн" ? "offline" : "all";
                                setFilters((f) => ({ ...f, online: v }));
                                setPage(1);
                            }}
                            placeholder="Все"
                        />
                    </div>

                    <div style={{ flex: "0 0 auto" }}>
                        <button className="btn btn-success" onClick={openCreate}>
                            Создать оператора
                        </button>
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        alignItems: "end",
                        justifyContent: "flex-start", // ← слева
                    }}
                >
                    <div style={{ flex: "0 0 220px", maxWidth: 240 }}>
                        <label className="form-label mb-1">Начало отчёта</label>
                        <input
                            type="date"
                            className="form-control"
                            value={dateStart}
                            onChange={(e) => setDateStart(e.currentTarget.value)}
                        />
                    </div>

                    <div style={{ flex: "0 0 220px", maxWidth: 240 }}>
                        <label className="form-label mb-1">Окончание отчёта</label>
                        <input
                            type="date"
                            className="form-control"
                            value={dateEnd}
                            onChange={(e) => setDateEnd(e.currentTarget.value)}
                        />
                    </div>

                    <div style={{ flex: "0 0 auto" }}>
                        <button
                            className="btn btn-primary"
                            onClick={fetchReport}
                            disabled={loadingReport || selectedLogins.length === 0}
                            title={selectedLogins.length ? "" : "Выберите операторов"}
                        >
                            {loadingReport ? "Формируем…" : `Сформировать отчёт (${selectedLogins.length})`}
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ height: tableH, minHeight: 0 }}>
                <div className="table-responsive" style={{ height: "100%", overflowY: "auto" }}>
                    <table className="table table-sm align-middle">
                        <thead>
                        <tr>
                            <th style={stickyTh}>
                                <input
                                    type="checkbox"
                                    checked={allCheckedOnPage}
                                    onChange={(e) => {
                                        const isChecked = (e.target as HTMLInputElement).checked;
                                        setSelected((prev) => {
                                            const next = { ...prev };
                                            if (isChecked) {
                                                for (const a of pageItems) next[a.login] = true;
                                            } else {
                                                for (const a of pageItems) next[a.login] = false;
                                            }
                                            return next;
                                        });
                                    }}
                                    aria-label="Выбрать всех на странице"
                                />
                            </th>
                            <th style={stickyTh}>Имя</th>
                            <th style={stickyTh}>Sip Логин</th>
                            <th style={stickyTh}>Роль</th>
                            <th style={stickyTh}>Отдел</th>
                            <th style={stickyTh}>Робот</th>
                            <th style={stickyTh}>Проекты</th>
                            <th style={stickyTh}>Статус</th>
                            <th style={stickyTh}>Состояние</th>
                            <th style={stickyTh}>Вызов</th>
                            <th style={{ width: 360, ...stickyTh }}>Действия</th>
                        </tr>
                        </thead>
                        <tbody>
                        {query.isLoading && (
                            <tr>
                                <td colSpan={11}>Загрузка…</td>
                            </tr>
                        )}

                        {!query.isLoading &&
                            pageItems.map((a) => {
                                const hasVideo = screenShareStreams && screenShareStreams.length > 0;
                                const isHuman = !!a.post_obrabotka;       // "Человек"
                                const isOperator = a.role === "operator"; // только операторы

                                const isOnline =
                                    !!a.fs_status && !norm(a.status).includes("logged out"); // онлайн

                                const canCalling = isHuman && isOnline && sipLogin !== a.login;
                                const canHaveScreen = isOperator && isHuman && isOnline;
                                const isScreenActiveHere = activeScreenOperator === a.login;

                                const screenBtnDisabled =
                                    !webrtcEnabled || !sessionKey || !worker || !sipLogin;

                                const isDialingThis = dialingLogin === a.login;

                                return (
                                    <React.Fragment key={a.login}>
                                    <tr key={a.login}>
                                    <td>
                                        <input
                                            type="checkbox"
                                            checked={!!selected[a.login]}
                                            onChange={(e) => {
                                                const isChecked = (e.target as HTMLInputElement).checked;
                                                setSelected((prev) => ({ ...prev, [a.login]: isChecked }));
                                            }}
                                            aria-label={`Выбрать ${a.name || a.login}`}
                                        />
                                    </td>

                                    <td>{a.name}</td>
                                    <td>{a.login}</td>
                                    <td>
                                        <span className="badge bg-light text-dark">{roleName(a.role)}</span>
                                    </td>
                                    <td>{a.department ?? "-"}</td>
                                    <td>
                                      <span className={`badge ${a.post_obrabotka ? "bg-info" : "bg-secondary"}`}>
                                        {!a.post_obrabotka ? "Робот" : "Человек"}
                                      </span>
                                    </td>
                                    <td>
                                        {(() => {
                                            const projects = Array.isArray(a.projects) ? a.projects.filter(Boolean) : [];
                                            const display = projects.map((code) => projMap[code] ?? code);
                                            const maxVisible = 3;
                                            const visible = display.slice(0, maxVisible);
                                            const hidden = display.slice(maxVisible);
                                            return (
                                                <div
                                                    className="position-relative"
                                                    style={{
                                                        display: "grid",
                                                        gridTemplateColumns: "repeat(auto-fill, minmax(100px, auto))",
                                                        gap: "4px",
                                                    }}
                                                >
                                                    {visible.map((name) => (
                                                        <span
                                                            key={name}
                                                            className="badge bg-light text-dark border"
                                                            title={name}
                                                            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                                                        >
                                                            {name}
                                                        </span>
                                                    ))}
                                                    {hidden.length > 0 && (
                                                        <span
                                                            className="badge bg-light text-dark border"
                                                            style={{ cursor: "pointer", whiteSpace: "nowrap" }}
                                                            title={hidden.join(", ")}
                                                        >
                                                            +{hidden.length} {hidden.length === 1 ? "проект" : hidden.length < 5 ? "проекта" : "проектов"}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>

                                    <td>
                                        {(() => {
                                            const cls = getStatusBadgeClass(a.fs_status);
                                            return <span className={cls}>{a.fs_status ? "Авторизирован" : "Выключен"}</span>;
                                        })()}
                                    </td>

                                    <td>
                                        {(() => {
                                            const { text, cls } = getTelephonyState(a);
                                            return <span className={cls}>{text}</span>;
                                        })()}
                                    </td>

                                    <td style={{ width: 240 }}>
                                        {(() => {
                                            const ac = getActiveCall(a);
                                            if (!ac) return <span className="text-muted">—</span>;

                                            const phone = ac.phone || "—";
                                            const project = ac.projectName || "Без проекта";
                                            const duration = ac.duration || "00:00:00";

                                            return (
                                                <div style={{ display: "grid", gap: 2, lineHeight: 1.2 }}>
                                                    <div className="d-flex align-items-center gap-1" style={{ minWidth: 0 }}>
                                                        <span className="material-icons" style={{ fontSize: 16 }}>call</span>
                                                        <strong className="text-truncate" title={phone} style={{ maxWidth: 180 }}>
                                                            {phone}
                                                        </strong>
                                                    </div>

                                                    <div
                                                        className="text-muted small d-flex align-items-center gap-1"
                                                        title={project}
                                                        style={{ minWidth: 0 }}
                                                    >
                                                        <span className="material-icons" style={{ fontSize: 16 }}>work</span>
                                                        <span className="text-truncate" style={{ maxWidth: 200 }}>
                                                            Проект:&nbsp;{project}
                                                        </span>
                                                    </div>

                                                    <div className="d-flex align-items-center gap-1">
                                                        <span className="material-icons" style={{ fontSize: 16 }}>schedule</span>
                                                        <span className="badge bg-light text-dark">{duration}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </td>

                                    <td>
                                        <div className="btn-group btn-group-sm">
                                            <button className="btn btn-outline-success" onClick={() => openEdit(a)}>
                                                Редактировать
                                            </button>
                                            {canCalling && !hasInterCall && (
                                                <button
                                                    className="btn btn-outline-primary"
                                                    disabled={!webrtcEnabled || !!dialingLogin}
                                                    onClick={() => handleCallOperator(a.login)}
                                                    title={isDialingThis ? "Идёт вызов…" : `Позвонить оператору ${a.name}`}
                                                >
                                                    {isDialingThis ? (
                                                        <>
                                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                                            Идёт вызов…
                                                        </>
                                                    ) : (
                                                        "Позвонить"
                                                    )}
                                                </button>
                                            )}
                                            {a.status === "Logged Out" && a.fs_status && (
                                                <button className="btn btn-outline-success" onClick={() => handleStartFs(a.login)}>
                                                    На линию
                                                </button>
                                            )}

                                            {(a.status === "Available" || a.status === "Available (On Demand)") && (
                                                <>
                                                    <button
                                                        className="btn btn-outline-warning"
                                                        onClick={() => handlePauseFs("Available", a.login)}
                                                    >
                                                        Перерыв
                                                    </button>
                                                    <button className="btn btn-outline-dark" onClick={() => handleLogoutFs(a.login)}>
                                                        Логаут
                                                    </button>
                                                </>
                                            )}

                                            {a.status === "On Break" && (
                                                <button
                                                    className="btn btn-outline-warning"
                                                    onClick={() => handlePauseFs("On Break", a.login)}
                                                >
                                                    Снять с перерыва
                                                </button>
                                            )}

                                            <button
                                                className="btn btn-outline-info"
                                                onClick={() => setActivityUserId(a.login)}
                                            >
                                                Активность
                                            </button>
                                            {canHaveScreen && (
                                                <button
                                                    className={isScreenActiveHere ? "btn btn-outline-info" : "btn btn-outline-info"}
                                                    disabled={screenBtnDisabled}
                                                    onClick={() => handleScreenShareClick(a.login)}
                                                    title={isScreenActiveHere ? "Отключить просмотр экрана" : "Подключиться к экрану оператора"}
                                                >
                                                    {isScreenActiveHere ? "Закрыть экран" : "Экран"}
                                                </button>
                                            )}

                                            <button className="btn btn-outline-dark" onClick={() => setLogUserId(a.login)}>
                                                Логи
                                            </button>

                                            <button
                                                className="btn btn-outline-danger"
                                                onClick={() => {
                                                    Swal.fire({
                                                        title: `Удалить "${a.name}" (${a.login})?`,
                                                        icon: "warning",
                                                        showCancelButton: true,
                                                        confirmButtonText: "Да, удалить",
                                                        cancelButtonText: "Отмена",
                                                        confirmButtonColor: "#d33",
                                                        cancelButtonColor: "#3085d6",
                                                        reverseButtons: true,
                                                    }).then((result) => {
                                                        if (result.isConfirmed) {
                                                            mutateDelete.mutate(a.login);
                                                            Swal.fire({
                                                                title: "Удалено!",
                                                                icon: "success",
                                                                timer: 1500,
                                                                showConfirmButton: false,
                                                            });
                                                        }
                                                    });
                                                }}
                                            >
                                                Удалить
                                            </button>
                                        </div>
                                    </td>
                                </tr>{isScreenActiveHere && (
                                        <tr className="table-active">
                                            <td colSpan={11}>
                                                <div className="p-2 border-top">
                                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                                        <div className="fw-semibold small">
                                                            Экран оператора <span className="text-monospace">{a.login}</span>
                                                        </div>

                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={handleScreenShareStop}
                                                        >
                                                            Отключиться
                                                        </button>
                                                    </div>

                                                    {screenError && (
                                                        <div className="text-danger small mb-2">{screenError}</div>
                                                    )}

                                                    {!screenError && isScreenActiveHere && !hasVideo && screenStatus !== "idle" && (
                                                        <div className="text-muted small mb-2">
                                                            Подключение к экрану… {screenStatus === "connected" ? "(соединение есть, ждём видео)" : ""}
                                                        </div>
                                                    )}

                                                    {hasVideo && (
                                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 8 }}>
                                                            {screenShareStreams.map((s) => {
                                                                const trackId = s.getVideoTracks?.()[0]?.id;
                                                                return <VideoTile key={trackId || s.id} stream={s} />;
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    </React.Fragment>
                                );
                            })}
                        {!query.isLoading && pageItems.length === 0 && (
                            <tr>
                                <td colSpan={10}>Ничего не найдено</td>
                            </tr>
                        )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Пагинация */}
            <div
                className="mt-3"
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "8px 12px",
                    background: "rgba(255,255,255,0.6)",
                    backdropFilter: "blur(6px)",
                    borderTop: "1px solid rgba(0,0,0,0.08)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, color: "#444", whiteSpace: "nowrap" }}>Показывать по</span>
                    <select
                        className="form-control"
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
                        style={{
                            height: 36,
                            borderRadius: 18,
                            border: "1px solid rgba(0,0,0,0.12)",
                            background: "#fff",
                            padding: "0 12px",
                            minWidth: 84,
                        }}
                        aria-label="Строк на странице"
                    >
                        {[10, 25, 50].map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>

                {(() => {
                    const pillBtn: React.CSSProperties = {
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        border: "1px solid rgba(0,0,0,0.12)",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "#fff",
                        padding: 0,
                        cursor: pageCount === 1 ? "not-allowed" : "pointer",
                    };
                    const inputSx: React.CSSProperties = {
                        width: 72,
                        height: 36,
                        borderRadius: 18,
                        textAlign: "center",
                        border: "1px solid rgba(0,0,0,0.12)",
                        background: "#fff",
                        margin: "0 8px",
                        padding: "0 10px",
                    };

                    return (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", marginRight: "auto" }}>
                            <button
                                type="button"
                                onClick={() => setPage(page <= 1 ? pageCount : page - 1)}
                                disabled={pageCount === 1}
                                style={pillBtn}
                                title={page === 1 ? `Перейти на ${pageCount}` : `Стр. ${page - 1}`}
                            >
                                <span className="material-icons">keyboard_arrow_left</span>
                            </button>

                            <input
                                type="number"
                                min={1}
                                max={pageCount}
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") commitPageInput();
                                }}
                                onBlur={commitPageInput}
                                style={inputSx}
                                aria-label="Номер страницы"
                            />
                            <span style={{ fontSize: 14, color: "#444" }}>из {pageCount}</span>

                            <button
                                type="button"
                                onClick={() => setPage(page >= pageCount ? 1 : page + 1)}
                                disabled={pageCount === 1}
                                style={pillBtn}
                                title={page === pageCount ? "Перейти на 1" : `Стр. ${page + 1}`}
                            >
                                <span className="material-icons">keyboard_arrow_right</span>
                            </button>
                        </div>
                    );
                })()}

                <small className="text-muted" style={{ whiteSpace: "nowrap" }}>
                    {total > 0 ? `${startIdx + 1}–${endIdx} из ${total}` : "0 из 0"}
                </small>
            </div>

            {report && (
                <div style={{ marginTop: 12 }}>
                    <div
                        className="d-flex align-items-center justify-content-between gap-2 mb-2"
                        style={{
                            padding: "10px 12px",
                            border: "1px solid rgba(0,0,0,0.08)",
                            borderRadius: 8,
                            background: "#fff",
                        }}
                    >
                        <div className="d-flex flex-column">
                            <strong>Отчёт: Все направления + Время</strong>
                            <small className="text-muted">
                                период {dateStart}–{dateEnd}, операторов: {report.rows.length}
                            </small>
                        </div>

                        <div className="btn-group btn-group-sm" role="group" aria-label="Действия отчёта">
                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={exportXlsx}
                                title="Скачать отчёт в XLSX"
                                aria-label="Скачать отчёт в XLSX"
                            >
                                <span className="material-icons" style={{ fontSize: 16, verticalAlign: "-2px" }}>download</span>
                                &nbsp;XLSX
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-secondary"
                                onClick={() => setReportCollapsed(v => !v)}
                                aria-expanded={!reportCollapsed}
                                title={reportCollapsed ? "Развернуть таблицу" : "Свернуть таблицу"}
                            >
                                {reportCollapsed ? "Развернуть" : "Свернуть"}
                            </button>

                            <button
                                type="button"
                                className="btn btn-outline-danger"
                                onClick={() => setReport(null)}
                                title="Закрыть отчёт"
                                aria-label="Закрыть отчёт"
                            >
                                <span className="material-icons" style={{ fontSize: 16, verticalAlign: "-2px" }}>close</span>
                            </button>
                        </div>
                    </div>

                    {!reportCollapsed && (
                        <div className="table-responsive" style={{ overflowX: "auto" }}>
                            <table className="table table-sm table-bordered">
                                <thead>
                                <tr>
                                    <th rowSpan={3} className="text-center align-middle" style={stickyTh}>
                                        Оператор
                                    </th>

                                    <th colSpan={TIME_KEYS.length} className="text-center" style={stickyTh}>
                                        Время
                                    </th>

                                    {(["outbound", "inbound", "express", "missed"] as const).map((cat) => {
                                        const span = (1 + report.projects[cat].length) * CAT_SUBCOLS[cat].length;
                                        return (
                                            <th key={cat} colSpan={span} className="text-center" style={stickyTh}>
                                                {CAT_TITLES[cat]}
                                            </th>
                                        );
                                    })}
                                </tr>

                                <tr>
                                    {TIME_KEYS.map((tk) => (
                                        <th key={tk} rowSpan={2} className="text-center align-middle" style={stickyTh}>
                                            {TIME_TITLES[tk]}
                                        </th>
                                    ))}

                                    {(["outbound", "inbound", "express", "missed"] as const).map((cat) => (
                                        <React.Fragment key={`lvl2_${cat}`}>
                                            <th colSpan={CAT_SUBCOLS[cat].length} className="text-center" style={stickyTh}>
                                                Итого
                                            </th>
                                            {report.projects[cat].map((p) => (
                                                <th
                                                    key={`${cat}_${p}`}
                                                    colSpan={CAT_SUBCOLS[cat].length}
                                                    className="text-center"
                                                    style={stickyTh}
                                                >
                                                    {projMap[p] || p}
                                                </th>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </tr>

                                <tr>
                                    {(["outbound", "inbound", "express", "missed"] as const).map((cat) =>
                                        [0, ...report.projects[cat]].flatMap((_) =>
                                            CAT_SUBCOLS[cat].map((sc) => (
                                                <th key={`${cat}_${_}_${sc.key}`} className="text-center" style={stickyTh}>
                                                    {sc.title}
                                                </th>
                                            ))
                                        )
                                    )}
                                </tr>
                                </thead>

                                <tbody>
                                {report.rows.map((r) => (
                                    <tr key={r.__login}>
                                        <td>{r.__name}</td>

                                        {TIME_KEYS.map((tk) => (
                                            <td key={`${r.__login}_time_${tk}`}>{(r as any)[`time__${tk}`]}</td>
                                        ))}

                                        {(["outbound", "inbound", "express", "missed"] as const).flatMap((cat) => {
                                            const sub = CAT_SUBCOLS[cat];
                                            const cells: React.ReactNode[] = [];
                                            for (const sc of sub) cells.push(
                                                <td key={`${r.__login}_${cat}_total_${sc.key}`}>{sc.fmt(r[`${cat}__total__${sc.key}`])}</td>
                                            );
                                            for (const p of report.projects[cat]) {
                                                for (const sc of sub) {
                                                    cells.push(
                                                        <td key={`${r.__login}_${cat}_${p}_${sc.key}`}>{sc.fmt(r[`${cat}__${p}__${sc.key}`])}</td>
                                                    );
                                                }
                                            }
                                            return cells;
                                        })}
                                    </tr>
                                ))}

                                {report.rows.length === 0 && (
                                    <tr>
                                        <td
                                            colSpan={
                                                1 +
                                                TIME_KEYS.length +
                                                (["outbound", "inbound", "express", "missed"] as const).reduce(
                                                    (acc, cat) => acc + (1 + report.projects[cat].length) * CAT_SUBCOLS[cat].length,
                                                    0
                                                )
                                            }
                                        >
                                            Нет данных
                                        </td>
                                    </tr>
                                )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            <OperatorModal
                open={modalOpen}
                mode={modalMode}
                initial={editing}
                onClose={() => setModalOpen(false)}
                onCreate={(payload) => {
                    mutateCreate.mutate(payload, { onSuccess: () => setModalOpen(false) });
                }}
                onUpdate={(payload) => {
                    mutateUpdate.mutate(payload, { onSuccess: () => setModalOpen(false) });
                }}
                projectMap={projMap}
                onAddProject={(login, project_name) => {
                    mutateAddTier.mutate({ login, project_name });
                }}
                onRemoveProject={(login, project_name) => {
                    mutateRemoveTier.mutate({ login, project_name });
                }}
            />
            <OperatorLogModal
                open={!!logUserId}
                userId={logUserId || ""}
                loginForTitle={logUserId || undefined}
                onClose={() => setLogUserId(null)}
            />
            <OperatorActivityModal
                open={!!activityUserId}
                userId={activityUserId || ""}
                loginForTitle={activityUserTitle || undefined}
                onClose={() => setActivityUserId(null)}
            />
        </div>
    );
};
