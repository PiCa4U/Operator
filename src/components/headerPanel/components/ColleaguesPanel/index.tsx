// ColleaguesPanel.tsx
import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";
import axios from "axios";
import { useSip } from "../../../../context/SipContext";
import { RootState } from "../../../../redux/store";
import { useQuery } from "@tanstack/react-query";
import { setUserStatuses } from "../../../../redux/operatorSlice";
import { socket } from "../../../../socket";
import OperatorsSelect from "../../../managerPanel/components/operatorManagment/components/select";

/** ===== types & helpers ===== */

type RawUser = { id?: number; login: string; name?: string; is_deleted?: boolean };

type UsersObjectResponse = {
    status?: string;
    users?: Record<
        string,
        {
            name?: string;
            department?: string | null;
            is_deleted?: boolean;
            fields?: Record<string, any>;
        }
    >;
};

type UsersArrayResponse = { result?: RawUser[]; data?: RawUser[] };

type UsersApiResponse = UsersObjectResponse & UsersArrayResponse;

export type ApiUserRow = {
    login: string;
    name?: string;
    department?: string | null;
    is_deleted?: boolean;

    // добиваем из monitorUsers
    post_obrabotka?: boolean;

    // кастомные поля
    user_fields?: Record<string, any>;
    custom_fields?: Record<string, any>;
    fields?: Record<string, any>;
};

function normalizeUsersApi(data: UsersApiResponse): ApiUserRow[] {
    if (data?.users && typeof data.users === "object") {
        return Object.entries(data.users).map(([login, u]) => ({
            login,
            name: u?.name || login,
            department: (u as any)?.department ?? null,
            is_deleted: (u as any)?.is_deleted,
            fields: (u as any)?.fields,
        }));
    }

    const rows: RawUser[] = (data?.result ?? data?.data ?? []) as RawUser[];
    return rows
        .filter((u) => !!u?.login)
        .map((u) => ({
            login: u.login,
            name: u.name || u.login,
            is_deleted: u.is_deleted,
        }));
}

function sanitizeOtherUsers(msg: any): Record<string, any> {
    if (!msg) return {};
    if (Array.isArray(msg)) {
        const out: Record<string, any> = {};
        for (const it of msg) {
            const k = String(it?.sip_login ?? it?.login ?? it?.sip ?? "");
            if (!k) continue;
            out[k] = it;
        }
        return out;
    }
    if (typeof msg === "object") return msg as Record<string, any>;
    return {};
}

function otherUsersSig(obj: Record<string, any>) {
    const keys = Object.keys(obj).sort();
    return keys
        .map((k) => {
            const v = obj[k] || {};
            return `${k}:${v?.status ?? ""}|${v?.state ?? ""}|${v?.sofia_status ?? ""}`;
        })
        .join(";");
}

function getSipKey(u: ApiUserRow): string {
    return String(u?.login ?? "").trim();
}

function getDepartmentName(u: ApiUserRow): string {
    return String(u?.department ?? "Без отдела").trim() || "Без отдела";
}

function getCustomFields(u: ApiUserRow): Record<string, any> {
    return (u?.user_fields || u?.custom_fields || u?.fields || {}) as Record<string, any>;
}

function normalizeToStringArray(val: any): string[] {
    if (val == null) return [];
    if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
    return [String(val).trim()].filter(Boolean);
}

const StatusDot: React.FC<{ color: string; title?: string }> = ({ color, title }) => (
    <span
        title={title}
        style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            border: "1px solid rgba(0,0,0,.15)",
            marginRight: 6,
            flex: "0 0 auto",
        }}
    />
);

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

function isLikelySipLogin(v: any): string | null {
    const s = String(v ?? "").trim();
    if (!s) return null;
    // у вас логины типа 1000/1012/1170 — цифры
    if (/^\d{2,8}$/.test(s)) return s;
    return null;
}

function getInterCallPeerLogin(call: any, myLogin: string): string | null {
    if (!call) return null;

    const me = String(myLogin ?? "").trim();

    const caller =
        isLikelySipLogin(call?.caller_login) ||
        isLikelySipLogin(call?.caller) ||
        isLikelySipLogin(call?.from) ||
        isLikelySipLogin(call?.sip_from) ||
        null;

    const callee =
        isLikelySipLogin(call?.callee_login) ||
        isLikelySipLogin(call?.callee) ||
        isLikelySipLogin(call?.to) ||
        isLikelySipLogin(call?.sip_to) ||
        isLikelySipLogin(call?.destination_number) ||
        null;

    // если есть оба — выбираем не меня
    if (caller && callee) return caller === me ? callee : caller;

    // fallback: берём что-то похожее на логин, но не равное моему
    const candidates = [
        call?.other_login,
        call?.peer_login,
        call?.operator_login,
        call?.login,
        caller,
        callee,
    ]
        .map((x) => isLikelySipLogin(x))
        .filter(Boolean) as string[];

    for (const c of candidates) {
        if (c !== me) return c;
    }
    return null;
}

function directorySig(list: ApiUserRow[]): string {
    const rows = [...list].sort((a, b) => String(a.login).localeCompare(String(b.login), "ru"));
    return rows
        .map((u) => {
            const keys = Object.keys(getCustomFields(u) || {}).sort().join(",");
            return `${u.login}|${u.name ?? ""}|${u.department ?? ""}|${keys}`;
        })
        .join(";");
}

/** ===== SQL-field_filters UI (как в OperatorsTab) ===== */

type FieldFilterOp = "eq" | "neq" | "like" | "not_like" | "in" | "not_in";
type FieldFilterLabel = "Содержит" | "Не содержит" | "Равно" | "Не равно" | "В списке" | "Не в списке";

const FIELD_FILTER_OPS: readonly FieldFilterOp[] = ["eq", "neq", "like", "not_like", "in", "not_in"] as const;
function isFieldFilterOp(x: string): x is FieldFilterOp {
    return (FIELD_FILTER_OPS as readonly string[]).includes(x);
}

const FIELD_FILTER_LABELS: FieldFilterLabel[] = [
    "Содержит",
    "Не содержит",
    "Равно",
    "Не равно",
    "В списке",
    "Не в списке",
];

const FIELD_FILTER_CODE_BY_LABEL: Record<FieldFilterLabel, FieldFilterOp> = {
    Содержит: "like",
    "Не содержит": "not_like",
    Равно: "eq",
    "Не равно": "neq",
    "В списке": "in",
    "Не в списке": "not_in",
};

const FIELD_FILTER_LABEL_BY_CODE: Record<FieldFilterOp, FieldFilterLabel> = {
    like: "Содержит",
    not_like: "Не содержит",
    eq: "Равно",
    neq: "Не равно",
    in: "В списке",
    not_in: "Не в списке",
};

const splitSqlValues = (raw: string): string[] => {
    return String(raw || "")
        .split(/--|\r?\n|,|;/g)
        .map((s) => s.trim())
        .filter(Boolean);
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function usePopoverPosition(
    open: boolean,
    anchorRef: React.RefObject<HTMLElement>,
    width = 520,
    maxHeight = 420
) {
    const [pos, setPos] = useState({ top: 0, left: 0, width, maxHeight });

    const update = useCallback(() => {
        const el = anchorRef.current;
        if (!el) return;

        const r = el.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const w = Math.min(width, vw - 16);
        const left = clamp(r.left, 8, vw - w - 8);

        const downTop = r.bottom + 8;
        const upTop = Math.max(8, r.top - maxHeight - 8);
        const fitsDown = downTop + maxHeight <= vh - 8;

        setPos({
            top: fitsDown ? downTop : upTop,
            left,
            width: w,
            maxHeight,
        });
    }, [anchorRef, width, maxHeight]);

    useLayoutEffect(() => {
        if (!open) return;
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [open, update]);

    return pos;
}

const FF_SELECT_PREFIX = "ffsel";

type Props = {
    show: boolean;
    glagolParent: string;
    meLogin: string;
};

type GroupVM = { name: string; rows: ApiUserRow[] };

const ColleaguesPanel: React.FC<Props> = React.memo(({ show, glagolParent, meLogin }) => {
    const dispatch = useDispatch();
    const { enabled: webrtcEnabled, callOperator, makeCall } = useSip();

    const { monitorUsers, monitorProjects, monitorCallcenter } = useSelector(
        (s: RootState) => s.operator.monitorData
    );
    const userStatuses = useSelector((s: RootState) => s.operator.userStatuses);

    const rawInterCalls = useSelector((state: RootState) => (state.operator as any).interCalls);
    const interCalls: any[] = useMemo(() => {
        return Array.isArray(rawInterCalls) ? rawInterCalls : Object.values(rawInterCalls || {});
    }, [rawInterCalls]);

    const interCall = useMemo(() => pickPrimaryInterCall(interCalls), [interCalls]);
    const hasInterCall = !!interCall;

    // ===== filters
    const [searchTerm, setSearchTerm] = useState("");
    const [postFilter, setPostFilter] = useState<"all" | "on" | "off">("all");
    const isPostOn = (u: ApiUserRow) => u.post_obrabotka !== false; // по умолчанию считаем Вкл
    const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
    const [groupMode, setGroupMode] = useState<"projects" | "departments">("departments");

    const [deptFilter, setDeptFilter] = useState<string[]>([]);
    const [projectFilter, setProjectFilter] = useState<string[]>([]);

    const [dialingLogin, setDialingLogin] = useState<string | null>(null);

    const dialSeenInterCallRef = useRef(false);
    const dialTimeoutRef = useRef<number | null>(null);

    const clearDialing = useCallback(() => {
        dialSeenInterCallRef.current = false;
        if (dialTimeoutRef.current) {
            window.clearTimeout(dialTimeoutRef.current);
            dialTimeoutRef.current = null;
        }
        setDialingLogin(null);
    }, []);

    const interPeerLogin = useMemo(() => getInterCallPeerLogin(interCall, meLogin), [interCall, meLogin]);

    useEffect(() => {
        if (!dialingLogin) return;

        // interCall появился именно с тем, кому звоним
        if (interCall && interPeerLogin && interPeerLogin === dialingLogin) {
            dialSeenInterCallRef.current = true;
            return;
        }

        // interCall пропал после того, как мы его уже видели => вызов завершён
        if (!interCall && dialSeenInterCallRef.current) {
            clearDialing();
        }
    }, [dialingLogin, interCall, interPeerLogin, clearDialing]);

// на unmount — чистим таймер
    useEffect(() => () => clearDialing(), [clearDialing]);

    // ===== SQL user_fields filter (server param)
    const [fieldFilters, setFieldFilters] = useState<string | null>(null); // applied param
    const currentFieldFilter = fieldFilters;

    const ffActiveCount = useMemo(() => {
        if (!currentFieldFilter) return 0;
        const [, rest = ""] = String(currentFieldFilter).split("|");
        return rest ? rest.split("--").filter(Boolean).length : 0;
    }, [currentFieldFilter]);

    // draft UI
    const [ffMethodLabel, setFfMethodLabel] = useState<FieldFilterLabel>("Содержит");
    const [ffValuesRaw, setFfValuesRaw] = useState<string>("");

    const [ffOpen, setFfOpen] = useState(false);
    const ffBtnRef = useRef<HTMLButtonElement | null>(null);
    const ffPanelRef = useRef<HTMLDivElement | null>(null);
    const ffPos = usePopoverPosition(ffOpen, ffBtnRef as unknown as React.RefObject<HTMLElement>, 520, 420);

    // close popover (outside/esc) + ignore react-select portal clicks
    useEffect(() => {
        if (!ffOpen) return;

        const onDown = (e: MouseEvent) => {
            const el = e.target as Element | null;
            if (!el) return;

            if (el.closest(`.${FF_SELECT_PREFIX}__menu-portal`)) return;
            if (ffPanelRef.current?.contains(el)) return;
            if (ffBtnRef.current?.contains(el)) return;

            setFfOpen(false);
        };

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setFfOpen(false);
        };

        document.addEventListener("mousedown", onDown, true);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown, true);
            document.removeEventListener("keydown", onKey);
        };
    }, [ffOpen]);

    // sync draft when applied value changes
    useEffect(() => {
        if (!currentFieldFilter) {
            setFfMethodLabel("Содержит");
            setFfValuesRaw("");
            return;
        }

        const [opRaw, rest = ""] = String(currentFieldFilter).split("|");
        const op: FieldFilterOp | null = isFieldFilterOp(opRaw) ? opRaw : null;

        setFfMethodLabel(op ? FIELD_FILTER_LABEL_BY_CODE[op] : "Содержит");
        setFfValuesRaw(rest.split("--").join("\n"));
    }, [currentFieldFilter]);

    const buildFieldFiltersParam = useCallback((): string | null => {
        const op: FieldFilterOp = FIELD_FILTER_CODE_BY_LABEL[ffMethodLabel];
        const vals = splitSqlValues(ffValuesRaw);
        if (!vals.length) return null;
        return `${op}|${vals.join("--")}`;
    }, [ffMethodLabel, ffValuesRaw]);

    const applyFieldFilter = useCallback(() => {
        const param = buildFieldFiltersParam();
        setFieldFilters(param);
    }, [buildFieldFiltersParam]);

    const clearFieldFilter = useCallback(() => {
        setFfMethodLabel("Содержит");
        setFfValuesRaw("");
        setFieldFilters(null);
    }, []);

    // ===== /api/v1/users query (уникальный ключ + field_filters в key)
    const lastDirRef = useRef<{ sig: string; data: ApiUserRow[] }>({ sig: "", data: [] });

    const usersQuery = useQuery({
        queryKey: ["colleaguesUsers", glagolParent, fieldFilters], // ✅ меняется только по "Применить/Сбросить"
        queryFn: async (): Promise<UsersApiResponse> => {
            const { data } = await axios.get<UsersApiResponse>("/api/v1/users", {
                params: {
                    glagol_parent: glagolParent,
                    // ✅ SQL фильтр как в менеджере
                    ...(fieldFilters ? { field_filters: fieldFilters } : {}),
                },
            });
            return data;
        },
        enabled: show && !!glagolParent,
        staleTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchInterval: false,
        placeholderData: (prev) => prev ?? ({} as UsersApiResponse),
        select: (raw: UsersApiResponse): ApiUserRow[] => {
            const next = normalizeUsersApi(raw).filter((u) => !u.is_deleted);

            const sig = directorySig(next);
            if (sig === lastDirRef.current.sig) return lastDirRef.current.data;

            const sorted = [...next].sort((a, b) => String(a.login).localeCompare(String(b.login), "ru"));
            lastDirRef.current = { sig, data: sorted };
            return sorted;
        },
    });

    const directoryUsers: ApiUserRow[] = Array.isArray(usersQuery.data) ? (usersQuery.data as ApiUserRow[]) : [];
    const usersLoading = usersQuery.isFetching;
    const usersError = usersQuery.isError ? String((usersQuery.error as any)?.message || usersQuery.error) : null;

    // ===== merge with monitorUsers (fallback) + include logins absent in /users
    const usersList: ApiUserRow[] = useMemo(() => {
        const map = new Map<string, ApiUserRow>();

        // 1) база — то, что вернул /users (уже с field_filters)
        for (const u of directoryUsers) {
            map.set(String(u.login), u);
        }

        // 2) monitorUsers: всегда ПАТЧИМ, но ДОБАВЛЯЕМ отсутствующих только если нет fieldFilters
        for (const [k, mu] of Object.entries(monitorUsers || {})) {
            const login = String((mu as any)?.sip_login || k).trim();
            if (!login) continue;

            const prev = map.get(login);

            const patch: ApiUserRow = {
                login,
                name: (mu as any)?.name || prev?.name || login,
                department: (mu as any)?.department ?? prev?.department ?? null,
                post_obrabotka: (mu as any)?.post_obrabotka ?? prev?.post_obrabotka,
                is_deleted: prev?.is_deleted,
                fields: prev?.fields,
            };

            if (prev) {
                map.set(login, { ...prev, ...patch });
            } else {
                // ✅ ключевая строка: если включён server field_filters — НЕ добавляем лишних
                if (!fieldFilters) map.set(login, patch);
            }
        }

        return Array.from(map.values()).filter((u) => !u.is_deleted);
    }, [directoryUsers, monitorUsers, fieldFilters]);

    const deptOptions = useMemo(() => {
        return Array.from(new Set(usersList.map(getDepartmentName))).sort((a, b) => a.localeCompare(b, "ru"));
    }, [usersList]);

    // ===== projectsByLogin + projectOptions (from monitorCallcenter + monitorProjects)
    const projectsByLogin = useMemo(() => {
        const m = new Map<string, string[]>();
        for (const u of usersList) {
            const login = getSipKey(u);
            const keys = (monitorCallcenter as any)?.[String(login)] as any[] | undefined;

            const names =
                Array.isArray(keys) && keys.length
                    ? keys
                        .filter((k) => typeof k === "string" || typeof k === "number")
                        .map((k) => (monitorProjects as any)?.[k] ?? String(k))
                        .map(String)
                        .map((s) => s.trim())
                        .filter(Boolean)
                    : [];

            m.set(login, names);
        }
        return m;
    }, [usersList, monitorCallcenter, monitorProjects]);

    const projectOptions = useMemo(() => {
        const set = new Set<string>();
        let hasEmpty = false;

        projectsByLogin.forEach((arr) => {
            if (!arr || arr.length === 0) hasEmpty = true;
            (arr || []).forEach((p) => set.add(p));
        });

        const out = Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
        if (hasEmpty) out.unshift("Без проекта");
        return out;
    }, [projectsByLogin]);

    const getProjectNamesForLogin = useCallback(
        (login: string): string[] => {
            return projectsByLogin.get(String(login).trim()) ?? [];
        },
        [projectsByLogin]
    );

    // ===== statuses from socket other_users (only when open)
    const lastOtherUsersSigRef = useRef<string | null>(null);

    useEffect(() => {
        if (!show) return;

        lastOtherUsersSigRef.current = null;

        const handleOtherUsers = (msg: any) => {
            const clean = sanitizeOtherUsers(msg);
            const sig = otherUsersSig(clean);
            if (sig === lastOtherUsersSigRef.current) return;
            lastOtherUsersSigRef.current = sig;

            dispatch(setUserStatuses(clean));
        };

        socket.on("other_users", handleOtherUsers);
        return () => {
            socket.off("other_users", handleOtherUsers);
        };
    }, [show, dispatch]);

    const statusFor = useCallback(
        (login: string) => {
            const k = String(login || "").trim();
            return (userStatuses as any)?.[k] || {};
        },
        [userStatuses]
    );

    const isUserOnline = useCallback(
        (login: string) => {
            const st = statusFor(login);
            const sofia = String(st?.sofia_status || "");
            const fsSt = String(st?.status || "");
            const sofiaRegistered = sofia.includes("Registered");
            const fsLoggedOut = String(fsSt).includes("Logged Out");
            return sofiaRegistered && !fsLoggedOut;
        },
        [statusFor]
    );

    const presenceRankByStatus = useCallback(
        (login: string) => {
            const st = statusFor(login);
            const sofia = String(st?.sofia_status || "");
            const fsSt = String(st?.status || "");

            const sofiaRegistered = sofia.includes("Registered");
            const fsLoggedOut = String(fsSt).includes("Logged Out");
            const onBreak = fsSt === "On Break";

            if (sofiaRegistered && !fsLoggedOut && !onBreak) return 0;
            if (onBreak) return 1;
            if (!sofia && !fsSt) return 2;
            return 2;
        },
        [statusFor]
    );

    const sortUsersInGroup = useCallback(
        (a: ApiUserRow, b: ApiUserRow) => {
            const ar = presenceRankByStatus(a.login);
            const br = presenceRankByStatus(b.login);
            if (ar !== br) return ar - br;

            const an = String(a?.name ?? "").toLowerCase();
            const bn = String(b?.name ?? "").toLowerCase();
            if (an !== bn) return an.localeCompare(bn, "ru");

            return String(a.login).localeCompare(String(b.login), "ru");
        },
        [presenceRankByStatus]
    );

    const getSofiaDot = useCallback(
        (login: string) => {
            const st = statusFor(login);
            const sofia = String(st?.sofia_status || "");
            if (!sofia) return { color: "#cba200", title: "Авторизация: обновляется" };
            return sofia.includes("Registered")
                ? { color: "#0BB918", title: "Авторизация: Registered" }
                : { color: "#f33333", title: "Авторизация: Unregistered" };
        },
        [statusFor]
    );

    const getLineDot = useCallback(
        (login: string) => {
            const st = statusFor(login);
            const fsSt = String(st?.status || "");
            const fsState = String(st?.state || "");

            if (!fsSt && !fsState) return { color: "#cba200", title: "Линия: обновляется" };
            if (fsSt.includes("Logged Out")) return { color: "#f33333", title: `Линия: ${fsSt}` };
            if (fsSt === "On Break") return { color: "#cba200", title: "Линия: перерыв" };

            if (fsState === "In a queue call" && String(fsSt || "").includes("Available")) {
                return { color: "#cba200", title: "Линия: активный вызов" };
            }
            if (String(fsSt).includes("Available") && fsState === "Idle") {
                return { color: "#cba200", title: "Линия: постобработка" };
            }
            if (String(fsSt).includes("Available") && fsState === "Waiting") {
                return { color: "#0BB918", title: "Линия: на линии" };
            }

            return { color: "#cba200", title: `Линия: ${fsSt} / ${fsState}` };
        },
        [statusFor]
    );

    const renderProjectsBadges = (names: string[]) => {
        const maxVisible = 3;
        const visible = names.slice(0, maxVisible);
        const hidden = names.slice(maxVisible);

        if (!names.length) return <span className="text-muted">Проекты не назначены</span>;

        return (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {visible.map((name) => (
                    <span
                        key={name}
                        className="badge bg-light text-dark border"
                        title={name}
                        style={{ whiteSpace: "nowrap", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}
                    >
            {name}
          </span>
                ))}
                {hidden.length > 0 && (
                    <span className="badge bg-light text-dark border" title={hidden.join(", ")} style={{ whiteSpace: "nowrap" }}>
            +{hidden.length}
          </span>
                )}
            </div>
        );
    };

    const handleCall = useCallback(
        async (operatorLogin: string) => {
            if (!webrtcEnabled) {
                Swal.fire({ icon: "info", title: "Телефония выключена", timer: 1500, showConfirmButton: false });
                return;
            }

            // старт “дозвона”
            dialSeenInterCallRef.current = false;
            setDialingLogin(operatorLogin);

            if (dialTimeoutRef.current) window.clearTimeout(dialTimeoutRef.current);
            dialTimeoutRef.current = window.setTimeout(() => {
                // если interCall так и не появился — считаем, что не дозвонились/не установилось
                setDialingLogin((prev) => (prev === operatorLogin ? null : prev));
                dialSeenInterCallRef.current = false;
                dialTimeoutRef.current = null;
            }, 45_000);

            try {
                if (callOperator) await callOperator(operatorLogin);
                else await makeCall(String(operatorLogin));
                // НЕ clear тут — ждём interCall / его завершение
            } catch (e: any) {
                console.error(e);
                clearDialing();
                Swal.fire({ icon: "error", title: "Не удалось позвонить", text: String(e?.message || e) });
            }
        },
        [webrtcEnabled, callOperator, makeCall, clearDialing]
    );

    // ===== dynamic grouping-filter (options/value)
    const groupFilterLabel = groupMode === "projects" ? "Проекты" : "Отделы";
    const groupFilterOptions = groupMode === "projects" ? projectOptions : deptOptions;
    const groupFilterValue = groupMode === "projects" ? projectFilter : deptFilter;

    const setGroupFilterValue = useCallback(
        (vals: string[]) => {
            if (groupMode === "projects") setProjectFilter(vals);
            else setDeptFilter(vals);
        },
        [groupMode]
    );

    // ===== build groups + filtering once
    const groupsVm: GroupVM[] = useMemo(() => {
        let filtered: ApiUserRow[] = usersList;

        // 1) поиск
        if (searchTerm.trim()) {
            const q = searchTerm.trim().toLowerCase();
            filtered = filtered.filter((u) => {
                const l = getSipKey(u).toLowerCase();
                const nm = String(u?.name ?? "").toLowerCase();
                return l.includes(q) || nm.includes(q);
            });
        }

        // 2) тип
        if (postFilter === "on") filtered = filtered.filter((u) => isPostOn(u));
        if (postFilter === "off") filtered = filtered.filter((u) => u.post_obrabotka === false);
        // 3) онлайн/оффлайн
        if (statusFilter !== "all") {
            filtered = filtered.filter((u) => {
                const online = isUserOnline(u.login);
                return statusFilter === "online" ? online : !online;
            });
        }

        // 4) фильтр по выбранной группировке
        if (groupMode === "departments" && deptFilter.length) {
            const set = new Set(deptFilter);
            filtered = filtered.filter((u) => set.has(getDepartmentName(u)));
        }

        if (groupMode === "projects" && projectFilter.length) {
            const set = new Set(projectFilter);
            filtered = filtered.filter((u) => {
                const login = getSipKey(u);
                const projs = getProjectNamesForLogin(login);
                if (!projs.length) return set.has("Без проекта");
                return projs.some((p) => set.has(p));
            });
        }

        // ===== grouping
        const groups: Record<string, ApiUserRow[]> = {};
        for (const u of filtered) {
            const login = getSipKey(u);

            const keys =
                groupMode === "departments"
                    ? [getDepartmentName(u)]
                    : (() => {
                        const projects = getProjectNamesForLogin(login);
                        return projects.length ? projects : ["Без проекта"];
                    })();

            for (const k of keys) {
                if (!groups[k]) groups[k] = [];
                groups[k].push(u);
            }
        }

        return Object.entries(groups)
            .sort(([a], [b]) => a.localeCompare(b, "ru"))
            .map(([name, rows]) => ({ name, rows: [...rows].sort(sortUsersInGroup) }));
    }, [
        usersList,
        searchTerm,
        postFilter,
        statusFilter,
        groupMode,
        deptFilter,
        projectFilter,
        isUserOnline,
        getProjectNamesForLogin,
        sortUsersInGroup,
    ]);

    const totalFilteredCount = useMemo(() => {
        return groupsVm.reduce((acc, g) => acc + g.rows.length, 0);
    }, [groupsVm]);

    return (
        <div id="active_sips" className="row col-12 pr-0 py-2">
            <div className="card col-12 mx-3 pl-0" style={{ width: "100%" }}>
                <div className="card-header mt-0">
                    <h5 style={{ marginRight: "20px", whiteSpace: "nowrap" }}>Список коллег онлайн</h5>

                    <div className="d-flex align-items-center flex-wrap" style={{ gap: 15 }}>
                        <div style={{ width: "220px" }}>
                            <label style={{ whiteSpace: "nowrap" }}>Поиск</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Поиск оператора/робота"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: "220px" }}
                            />
                        </div>

                        <div style={{ width: "220px" }}>
                            <label style={{ whiteSpace: "nowrap" }}>Постобработка</label>
                            <select
                                className="form-control"
                                value={postFilter}
                                onChange={(e) => setPostFilter(e.target.value as any)}
                                style={{ width: "220px" }}
                            >
                                <option value="all">Все</option>
                                <option value="on">Вкл</option>
                                <option value="off">Выкл</option>
                            </select>
                        </div>

                        <div style={{ width: "220px" }}>
                            <label style={{ whiteSpace: "nowrap" }}>Статус</label>
                            <select
                                className="form-control"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                style={{ width: "220px" }}
                            >
                                <option value="all">Все</option>
                                <option value="online">Онлайн</option>
                                <option value="offline">Оффлайн</option>
                            </select>
                        </div>

                        <div style={{ width: "220px" }}>
                            <label style={{ whiteSpace: "nowrap" }}>Группировка</label>
                            <select
                                className="form-control"
                                value={groupMode}
                                onChange={(e) => setGroupMode(e.target.value as any)}
                                style={{ width: "220px" }}
                            >
                                <option value="departments">По отделам</option>
                                <option value="projects">По проектам</option>
                            </select>
                        </div>

                        {/* ✅ динамический мультиселект: отделы/проекты */}
                        <div style={{ width: "320px" }}>
                            <label style={{ whiteSpace: "nowrap" }}>{groupFilterLabel}</label>
                            <OperatorsSelect
                                isMulti
                                value={groupFilterValue}
                                options={groupFilterOptions}
                                onChange={(vals: any) => setGroupFilterValue(vals)}
                                placeholder={groupMode === "projects" ? "Все проекты" : "Все отделы"}
                                withCheckboxes
                                classNamePrefix={groupMode === "projects" ? "proj" : "dept"}
                            />
                        </div>

                        {/* ✅ SQL фильтр по пользовательским полям (как у менеджера) */}
                        <div style={{ flex: "0 0 auto" }}>
                            <button
                                ref={ffBtnRef}
                                type="button"
                                className={`btn ${currentFieldFilter ? "btn-danger" : "btn-outline-secondary"} d-inline-flex align-items-center gap-2 position-relative`}
                                onClick={() => setFfOpen((v) => !v)}
                                title="Фильтр по пользовательским полям"
                                style={{ borderRadius: 18, padding: "8px 14px", lineHeight: 1 }}
                            >
                <span className="material-icons" style={{ fontSize: 18, lineHeight: 1 }}>
                  filter_alt
                </span>

                                <span style={{ lineHeight: 1 }}>Фильтр по полям</span>

                                {currentFieldFilter && ffActiveCount > 0 && (
                                    <span
                                        className="badge bg-light text-dark ms-2"
                                        style={{ borderRadius: 999, fontWeight: 700 }}
                                        title={`Активных значений: ${ffActiveCount}`}
                                    >
                    {ffActiveCount}
                  </span>
                                )}
                            </button>

                            {ffOpen &&
                                createPortal(
                                    <div
                                        ref={ffPanelRef}
                                        style={{
                                            position: "fixed",
                                            top: ffPos.top,
                                            left: ffPos.left,
                                            width: ffPos.width,
                                            maxHeight: ffPos.maxHeight,
                                            overflow: "auto",
                                            zIndex: 1900,
                                            background: "#fff",
                                            borderRadius: 18,
                                            border: "1px solid rgba(0,0,0,0.10)",
                                            boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                                            padding: 16,
                                        }}
                                    >
                                        <div className="d-flex align-items-center gap-2 mb-3">
                                            <div className="fw-semibold">Фильтр по пользовательским полям</div>
                                        </div>

                                        <div className="mb-3">
                                            <div className="text-muted mb-1" style={{ fontSize: 12 }}>
                                                Критерий
                                            </div>

                                            <OperatorsSelect
                                                value={ffMethodLabel}
                                                options={[...FIELD_FILTER_LABELS]}
                                                isClearable={false}
                                                isSearchable={false}
                                                onChange={(v: any) => setFfMethodLabel(((v as FieldFilterLabel) || "Содержит"))}
                                                placeholder="Выберите..."
                                                classNamePrefix={FF_SELECT_PREFIX}
                                            />
                                        </div>

                                        <div className="mb-2">
                                            <div className="text-muted mb-1" style={{ fontSize: 12 }}>
                                                Значение (можно несколько: новая строка, запятая, ;)
                                            </div>

                                            <textarea
                                                className="form-control"
                                                value={ffValuesRaw}
                                                onChange={(e) => setFfValuesRaw(e.currentTarget.value)}
                                                placeholder="Введите значение..."
                                                style={{ borderRadius: 18, minHeight: 90 }}
                                            />
                                        </div>

                                        <div style={{ display: "flex", flexDirection: "row", gap: 8, marginTop: 16 }}>
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-secondary"
                                                style={{ borderRadius: 18, padding: "10px 18px" }}
                                                onClick={() => {
                                                    clearFieldFilter();
                                                    setFfOpen(false);
                                                }}
                                                disabled={!currentFieldFilter}
                                            >
                                                Сбросить
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-sm btn-danger ms-auto"
                                                style={{ borderRadius: 18, padding: "10px 18px" }}
                                                onClick={() => {
                                                    applyFieldFilter();
                                                    setFfOpen(false);
                                                }}
                                                disabled={!splitSqlValues(ffValuesRaw).length}
                                            >
                                                Применить
                                            </button>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                        </div>
                    </div>
                </div>

                <div className="card-body mt-0" style={{ maxHeight: "520px", overflowY: "auto", width: "100%" }}>
                    {usersLoading && <div className="text-muted">Обновляем список…</div>}
                    {usersError && <div className="text-danger">Ошибка: {usersError}</div>}

                    {!usersLoading && !usersError && (
                        <>
                            <div className="mb-2" style={{ fontSize: 13, opacity: 0.8 }}>
                                Сотрудников: {totalFilteredCount}
                            </div>

                            {groupsVm.length === 0 ? (
                                <div className="text-muted">Ничего не найдено</div>
                            ) : (
                                <div className="table-responsive" style={{ width: "100%" }}>
                                    <table className="table table-sm table-hover align-middle mb-0 w-100">
                                        <thead>
                                        <tr>
                                            <th style={{ width: 56 }} title="Авторизация / Линия">
                                                Статус
                                            </th>
                                            <th style={{ width: 260 }}>Оператор</th>
                                            <th>Проекты</th>
                                            <th style={{ width: 90, textAlign: "right" }}>Вызов</th>
                                        </tr>
                                        </thead>

                                        <tbody>
                                        {groupsVm.map((g) => (
                                            <React.Fragment key={g.name}>
                                                <tr className="table-light">
                                                    <td colSpan={4} style={{ fontWeight: 700 }}>
                                                        {g.name} <span style={{ fontWeight: 500, opacity: 0.7 }}>({g.rows.length})</span>
                                                    </td>
                                                </tr>

                                                {g.rows.map((u) => {
                                                    const login = getSipKey(u);
                                                    const name = u?.name || login;


                                                    const sofia = getSofiaDot(login);
                                                    const line = getLineDot(login);

                                                    const canCalling =
                                                        isUserOnline(login) &&
                                                        String(login) !== String(meLogin) &&
                                                        !hasInterCall;

                                                    const isDialingThis = dialingLogin === login;
                                                    const projects = getProjectNamesForLogin(login);
                                                    const isThisDial = dialingLogin === login;

                                                    const callPhase: "idle" | "dialing" | "ringing" | "active" =
                                                        isThisDial
                                                            ? interCall && interPeerLogin === login
                                                                ? String((interCall as any)?.callstate ?? "").toUpperCase() === "ACTIVE"
                                                                    ? "active"
                                                                    : "ringing"
                                                                : "dialing"
                                                            : "idle";

                                                    const showCallCell = isThisDial || (canCalling && isUserOnline(login) && String(login) !== String(meLogin) && !hasInterCall);
                                                    const canStartCall = !isThisDial && !hasInterCall && !dialingLogin && canCalling && isUserOnline(login) && String(login) !== String(meLogin);

                                                    return (
                                                        <tr key={`${g.name}:${login}`}>
                                                            <td>
                                                                <div style={{ display: "flex", alignItems: "center" }}>
                                                                    <StatusDot color={sofia.color} title={sofia.title} />
                                                                    <StatusDot color={line.color} title={line.title} />
                                                                </div>
                                                            </td>

                                                            <td>
                                                                <div style={{ lineHeight: 1.1 }}>
                                                                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                                        {name}
                                                                    </div>
                                                                    <div className="text-muted" style={{ fontSize: 12 }}>
                                                                        {login}
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            <td>{renderProjectsBadges(projects)}</td>

                                                            <td style={{ textAlign: "right" }}>
                                                                {!showCallCell ? (
                                                                    <span className="text-muted">—</span>
                                                                ) : isThisDial ? (
                                                                    <button className="btn btn-sm btn-outline-success" disabled style={{ minWidth: 110 }}>
                                                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                                                                        {callPhase === "active" ? "В разговоре" : "Звоним…"}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        className="btn btn-sm btn-outline-success"
                                                                        disabled={!canStartCall || !webrtcEnabled}
                                                                        onClick={() => handleCall(login)}
                                                                        title={`Позвонить ${name}`}
                                                                        style={{ minWidth: 42 }}
                                                                    >
                                                                        <span className="material-icons" style={{ fontSize: 18, lineHeight: 1 }}>
                                                                           call
                                                                        </span>
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
});

export default ColleaguesPanel;