import React, {useState, useMemo, useEffect, useRef} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import HeaderPanel, {Project} from '../headerPanel';
import CallControlPanel, {ActiveCall, CallData, normalizeUrl} from '../callControlPanel';
import CallsDashboard from '../callsDashboard';
import ScriptPanel from '../scriptPanel';
import { socket } from "../../socket";
import { getCookies, makeId } from "../../utils";
import {makeSelectFullProjectPool, setActiveCalls, setFsStatus, setUserStatuses} from '../../redux/operatorSlice';
import {RootState, store} from '../../redux/store';
import TasksDashboard, {ApiRow, ColumnCfgWithSearch, OptionType, Preset} from "../taskDashboard";
import stylesButton from '../callControlPanel/index.module.css';
import axios from "axios";
import {ManagerPanel} from "../managerPanel";
import Swal from "sweetalert2";
import { useSip } from '../../context/SipContext';
import NotificationPopup from '../notifications';
import {SessionState} from "sip.js";
import {chatApi, fetchChatHistory, RawChatMessage} from "../../features/itsm/chat/api";
import LocalChat, {Role, UiMessage} from "../../features/itsm/chat/LocalChat";
import {formatOperator, useOperatorsDirectory} from "../../features/signals/useOperatorsDirectory";
import {useChatCollapsed} from "../../features/itsm/useChatCollapsed";
import {useChatSocket} from "../../features/itsm/chat/useChatSocket";
import {ContactFilesPanel} from "../../features/itsm/chat/FieldsPanel";
import styles from "../../features/itsm/chat/style.module.css";
import {FilterMethod, ServerAppliedByCol, ServerDraftByCol} from "../../redux/tasksTableSlice";

function toIsoFromServer(dt: string): string {
    const [d, t = "00:00:00"] = dt.trim().split(" ");
    const [y, m, day] = d.split("-").map(Number);
    const [hh, mm, ss] = t.split(":").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, day || 1, hh || 0, mm || 0, ss || 0)).toISOString();
}

function mapRow(r: RawChatMessage): UiMessage {
    const isClient = r.sender === "client";
    const role: Role = isClient ? "client" : "operator";
    const attachments = Array.isArray(r.storage)
        ? r.storage.map((name, i) => ({ id: `${r.id}:${i}`, name }))
        : [];
    return {
        id: String(r.id),
        text: r.text ?? "",
        created_at: toIsoFromServer(r.created_dt),
        authorLogin: isClient ? null : r.sender,
        authorName: r.sender,
        authorRole: role,
        attachments,
        status: "sent",
        isRead: false,
    };
}

// === makeCardUrl: собрать ссылку на текущую карточку ===
// matchedPreset: объект твоего выбранного пресета (OptionType | null), у него есть .preset.group_by и .preset.group_table
function makeCardUrl(openedPhones: any[], matchedPreset: OptionType | null) {
    const u = new URL(window.location.href);
    u.searchParams.set("card", "1");

    // ids выбранных телефонов
    const ids = (openedPhones ?? [])
        .map((p: any) => p?.id)
        .filter((id: any) => Number.isFinite(id));
    if (ids.length) u.searchParams.set("ids", ids.join(","));

    // Параметры группировки из пресета
    const gb = matchedPreset?.preset?.group_by ?? [];
    const gt = matchedPreset?.preset?.group_table ?? "";
    if (Array.isArray(gb) && gb.length) u.searchParams.set("gb", gb.join(","));
    if (gt) u.searchParams.set("gt", gt);

    // (опционально) если есть guid — поможет сразу поднять чат
    const firstGuid = (openedPhones ?? []).find((p: any) => p?.guid)?.guid;
    if (firstGuid) u.searchParams.set("guid", String(firstGuid));

    // (опционально) пометить, что это карточка из задачного режима
    u.searchParams.set("tusk", "1");

    return u.toString();
}

// === fetchGroupPhonesByIdsUsingPreset: забрать телефоны через get_grouped_phones по ids + gb/gt ===
// Требуется, чтобы бэкенд поддерживал фильтр ids в get_grouped_phones
async function fetchGroupPhonesByIdsUsingPreset(
    ids: number[],
    group_table: string,
    group_by: string[]
) {
    const { glagolParent } = store.getState().credentials;

    const params: any = {
        glagol_parent: glagolParent,
        page: 1,
        limit: Math.max(ids.length, 50), // можно подстраховаться
        group_table,
        group_by: group_by.join(","),

        // NEW: сервер должен уметь распознать этот фильтр
        ids: ids.join(","),
    };

    const { data } = await axios.get("/api/v1/get_grouped_phones", { params });

    const rows = Array.isArray(data?.data) ? data.data : [];

    // Нужный минимум структуры под твою карточку
    return rows.map((r: any, i: number) => ({
        id: r?.id ?? r?.phone_id ?? i + 1,
        phone: r?.phone ?? r?.contact_info?.phone ?? "",
        project: r?.project ?? r?.contact_info?.project ?? r?.project_name ?? "",
        contact_info: r?.contact_info ?? {},
        guid: r?.guid ?? r?.contact_info?.guid ?? null,
        storage: Array.isArray(r?.storage) ? r.storage : [],
    }));
}

function sortMessages(a: UiMessage, b: UiMessage) {
    const ta = Date.parse(a.created_at);
    const tb = Date.parse(b.created_at);
    if (ta !== tb) return ta - tb;
    const na = Number.isFinite(+a.id) ? +a.id : Number.MAX_SAFE_INTEGER;
    const nb = Number.isFinite(+b.id) ? +b.id : Number.MAX_SAFE_INTEGER;
    if (na !== nb) return na - nb;
    const ka = (a.tempId ?? a.id) || "";
    const kb = (b.tempId ?? b.id) || "";
    return ka.localeCompare(kb);
}
function dedupeByKey(list: UiMessage[]) {
    const seen = new Set<string>();
    const out: UiMessage[] = [];
    for (const m of list) {
        const key = m.id;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(m);
    }
    return out;
}

type ReadStatus = { watched: string[]; responsible_watch: boolean };
type ReadMap = Record<string, ReadStatus>;

export interface ModuleData {
    button_name: string | null;
    start_modes: string[];
    filename: string;
    id: number;
    kwargs: any;
    return_structure: any;
    common_code: boolean
}

export interface MonoProjectsModuleData {
    [projectName: string]: ModuleData[];
}

function getByPath(obj: any, path: string) {
    if (!obj || !path) return undefined;
    return path.split(".").reduce((acc, key) => (acc != null ? acc[key] : undefined), obj);
}

function normalizeToArray(val: any): any[] {
    if (val == null) return [];
    if (Array.isArray(val)) return val.filter(v => v != null && v !== "");
    if (typeof val === "string") {
        const t = val.trim();
        if (!t) return [];
        if (t.includes(",")) return t.split(",").map(s => s.trim()).filter(Boolean);
        return [t];
    }
    return [val];
}

function buildGroupByFilter(
    groupBy: unknown,
    contact: Record<string, any>
): Record<string, ["IN", any[]]> {
    const fields: string[] = Array.isArray(groupBy)
        ? groupBy
        : typeof groupBy === "string"
            ? groupBy.split(",").map(s => s.trim()).filter(Boolean)
            : [];

    const filter: Record<string, ["IN", any[]]> = {};
    for (const field of fields) {
        const raw = field.includes(".") ? getByPath(contact, field) : contact?.[field];
        const arr = normalizeToArray(raw);
        if (arr.length) filter[field] = ["IN", arr];
    }
    return filter;
}

export type MainAppProps = {
    isOwner: boolean;
};

const MainApp: React.FC<MainAppProps> = ({ isOwner }) => {
    const {enabled, incoming, clearIncoming, remoteAudioRef, localAudioRef, answerCall, hangUp } = useSip();
    const dispatch = useDispatch();

    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const [showScriptPanel, setShowScriptPanel] = useState<boolean>(false);
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [activeProjectName, setActiveProjectName] = useState<string>("")
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [postActive, setPostActive] = useState<boolean>(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [outboundCall, setOutboundCall] = useState<boolean>(false)
    const [outActivePhone, setOutActivePhone] = useState<string | null>(null);
    const [outActivePhoneData, setOutActivePhoneData] = useState<any>(null)
    const [outActiveProjectName, setOutActiveProjectName] = useState('');
    const [assignedKey, setAssignedKey] = useState('');
    const [isLoading,    setIsLoading]    = useState(false);
    const [specialKey, setSpecialKey] = useState<string>('')

    const [modules, setModules] = useState<ModuleData[]>([]);
    const [monoModules, setMonoModules] = useState<MonoProjectsModuleData>({})
    const [scriptProject, setScriptProject] = useState<string>("");
    const [postCallData, setPostCallData] = useState<ActiveCall | null>(null);
    const [expressCall, setExpressCall] = useState<boolean>(false)
    const [selectedRowsKeys, setSelectedRowsKeys] = React.useState<string[]>([]);

    const [phoneID, setPhoneID] = useState<number|null>(null)
    useEffect(() => console.log("expressCall:", expressCall ),[expressCall])

    const [appliedLocalFilters, setAppliedLocalFilters] = useState<Record<string, string>>({});
    const [appliedServerFilters, setAppliedServerFilters] = useState<Record<string, ServerAppliedByCol>>({});
    const [localFilterDraft, setLocalFilterDraft] = useState<Record<string, string>>({});
    const [serverFilterDraft, setServerFilterDraft] = useState<Record<string, ServerDraftByCol>>({});
    const [unreadOnly, setUnreadOnly] = useState(false); // если нужно сохранять этот фильтр

    useEffect(() => console.log("scriptProject:", scriptProject ),[scriptProject])
    const { start: defaultStart, end: defaultEnd } = getInitialDateRange();
    const [startDate, setStartDate] = useState<Date | null>(defaultStart);
    const [endDate, setEndDate]     = useState<Date | null>(defaultEnd);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(() => {
        const saved = localStorage.getItem('selectedStatus');
        console.log("saved: ", saved)
        return saved !== null ? saved : null;
    });

    const [openedGroup, setOpenedGroup] = useState<any[]>([]);
    const [phonesData, setPhonesData] = useState<any[]>([])
    const [openedPhones, setOpenedPhones] = useState<any[]>([])
    const [GroupIDs, setGroupIDs] = useState<any[]>([])
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = ''
    } = store.getState().credentials;
    const { data: operatorDict = {} } = useOperatorsDirectory();

    const [managerPanel, setManagerPanel] = useState<boolean>(false)

    const momoProjectRepo = useRef<boolean>(false)
    const startModulesRanRef = useRef<boolean>(false);
    const { sessionKey } = store.getState().operator

    useEffect(() => {
        if (selectedStatus !== null) {
            localStorage.setItem('selectedStatus', selectedStatus);

        } else {
            localStorage.setItem('selectedStatus', "");
        }
    }, [selectedStatus]);


    const [activeGuid, setActiveGuid] = useState<string>("");
    const openedGuids = useMemo(() => {
        return openedPhones.filter(open => Boolean(open.guid));
    }, [openedPhones]);
    useEffect(() => console.log("openedGuids: ", openedGuids), [openedGuids])
    const firstGuid = useMemo(() => {
        return openedGuids.length > 0 ? openedGuids[0].guid : null;
    }, [openedGuids]);
    const prevPresetIdRef = useRef<number | null>(null);

    const [history, setHistory] = useState<UiMessage[]>([]);
    const [chatError, setChatError] = useState<string | null>(null);
    const [live, setLive] = useState<UiMessage[]>([]);
    const [optimistic, setOptimistic] = useState<UiMessage[]>([]);
    const [unreadByGuid, setUnreadByGuid] = useState<Record<string, number>>({});
    const [serverFilesByGuid, setServerFilesByGuid] = useState<Record<string, string[]>>({});
    const [projectsDict, setProjectsDict] = useState<Record<string, string>>({});
    const [readMap, setReadMap] = useState<ReadMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any[]>([]);
    const sentReadRef = useRef<Set<number>>(new Set());   // уже отправляли в эту сессию
    const queueRef = useRef<Set<number>>(new Set());      // очередь на отправку
    const timerRef = useRef<number | null>(null);

    const messages = useMemo(() => {
        const merged = [...history, ...live, ...optimistic];
        return dedupeByKey(merged).sort(sortMessages);
    }, [history, live, optimistic]);

    const viewer = useMemo(() => {
        const role: Role = sipLogin ? "operator" : "client";
        const name = sipLogin ? sipLogin : "Клиент";
        const login = sipLogin ? sipLogin : null;
        return { role, name, login, worker: worker || null };
    }, [sipLogin, worker]);

    useEffect(() => console.log("appliedServerFilters: ", appliedServerFilters),[appliedServerFilters])

    const collapsed = useChatCollapsed(firstGuid);

    useEffect(() => {
        let alive = true;

        axios
            .get("/api/v1/projects", { params: { glagol_parent: glagolParent } })
            .then(({ data }) => {
                if (!alive) return;
                const arr = Array.isArray(data?.projects) ? data.projects : [];
                const dict: Record<string, string> = {};
                for (const p of arr) {
                    const key = String(p?.project_name || "").trim();
                    if (!key) continue;
                    const val = String(p?.glagol_name || p?.project_name || key);
                    dict[key] = val;
                }
                setProjectsDict(dict);
            })
            .catch((e) => {
                console.warn("Не удалось загрузить список проектов", e);
                setProjectsDict({});
            });

        return () => { alive = false; };
    }, []);

    const [prefix, setPrefix] = useState<string>('')
    const [get_callcenter, setGet_callcenter] = useState<boolean>(false)
    const [scriptDir, setScriptDir] = useState<"inbound" | "outbound" >("outbound")
    // const [currentPresetPage, setCurrentPresetPage]         = useState(1);
    const [presets, setPresets] = useState<OptionType[]>([]);
    const [showTasksDashboard, setShowTasksDashboard] = useState<boolean>(() => {
        const saved = localStorage.getItem('showTasksDashboard');
        return saved !== null ? JSON.parse(saved) : false;
    });

    const [currentPresetPage, setCurrentPresetPage] = useState<number>(() => {
        const saved = localStorage.getItem('tasksCurrentPage');
        return saved !== null ? parseInt(saved, 10) : 1;
    });
    useEffect(() => console.log("currentPresetPage: ", currentPresetPage),[currentPresetPage])
    const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(() => {
        const saved = localStorage.getItem('tasksSelectedPreset');
        return saved ? JSON.parse(saved) as OptionType : null;
    });

    const { monitorUsers } = useSelector(
        (state: RootState) => state.operator.monitorData
    );
    // useEffect(() => {
    //     setAppliedLocalFilters({});
    //     setAppliedServerFilters({});
    // }, [selectedPreset]);

    useEffect(() => {
        if (!activeGuid) return;
        let alive = true;
        setChatError(null);
        (async () => {
            try {
                const rows = await fetchChatHistory(activeGuid);
                if (!alive) return;
                setHistory(rows.map(mapRow));
                setLive([]);
                setOptimistic([]);
            } catch {
                if (!alive) return;
                setChatError("Не удалось загрузить историю чата");
                setHistory([]); setLive([]); setOptimistic([]);
            }
        })();
        return () => { alive = false; };
    }, [activeGuid]);


    useEffect(() => {
        if (!openedGuids.length) return
        let alive = true;
        setLoading(true); setError(null);
        chatApi.get(`/api/v1/contacts/${openedGuids[0].guid}`)
            .then(({ data }) => {
                if (!alive) return;
                const contacts = Array.isArray(data?.data) ? data.data : [];
                setData(contacts);
            })
            .catch(() => {
                if (!alive) return;
                setError("Не удалось загрузить данные по GUID");
                setData([]);
            })
            .finally(() => alive && setLoading(false));
        return () => { alive = false; };
    }, [openedGuids]);

    function extractUnreadCount(resp: any, hasSipLogin: boolean, login: string): number {
        if (!resp || typeof resp !== "object") return 0;

        // оператор
        if (hasSipLogin) {
            const mine = Number(resp?.unwatched?.[login] ?? 0);
            const responsible = Number(resp?.unwatched?.responsible ?? 0);
            // если «ответственный» должен тоже видеть эти непрочитанные — раскоммень ниже:
            // return mine + responsible;
            return mine;
        }

        // клиент
        const clientTop = Number(resp?.client ?? 0);
        const clientInUnwatched = Number(resp?.unwatched?.client ?? 0);
        return clientTop || clientInUnwatched || 0;
    }

    // async function fetchUnreadForGuid(g: string, hasSipLogin: boolean, login: string) {
    //     try {
    //         const params = hasSipLogin ? { logins: login } : undefined;
    //         const { data } = await chatApi.get(`/api/v1/chat/${encodeURIComponent(g)}/count`, { params });
    //         return extractUnreadCount(data, hasSipLogin, login);
    //     } catch {
    //         return 0;
    //     }
    // }

    // async function refreshUnreadCounts(guids: string[], hasSipLogin: boolean, login: string) {
    //     if (!guids.length) return;
    //     const entries = await Promise.all(
    //         guids.map(async g => [g, await fetchUnreadForGuid(g, hasSipLogin, login)] as const)
    //     );
    //     setUnreadByGuid(prev => {
    //         const next = { ...prev };
    //         for (const [g, n] of entries) next[g] = n;
    //         return next;
    //     });
    // }
    const markReadMany = (arr: UiMessage[], ids: number[]) => {
        const setIds = new Set(ids.map(String));
        return arr.map(m => (setIds.has(m.id) ? { ...m, isRead: true } : m));
    };
    function extractFilesFromContacts(arr: any[]): string[] {
        const all: string[] = [];
        for (const c of arr ?? []) {
            const storage = Array.isArray(c?.storage)
                ? c.storage.map((it: any) => (typeof it === "string" ? it : (it?.name ?? it?.filename ?? "")))
                : [];
            for (const s of storage) if (s) all.push(s);
        }
        return Array.from(new Set(all));
    }

    async function refreshContactFiles(g: string) {
        if (!g) return;
        try {
            const { data: resp } = await chatApi.get(`/api/v1/contacts/${encodeURIComponent(g)}`);
            const contacts = Array.isArray(resp?.data) ? resp.data : [];
            const files = extractFilesFromContacts(contacts);
            setServerFilesByGuid(prev => ({ ...prev, [g]: files }));
        } catch (e) {
            console.warn("refreshContactFiles failed", e);
        }
    }

    const { connected, error: socketErr, send, markManyRead } = useChatSocket({
        guid: activeGuid,
        login: sipLogin,

        onIncoming: (msg: UiMessage) => {
            setLive((prev: UiMessage[]) => [...prev, msg]);
            // if (activeGuid) void refreshUnreadCounts([activeGuid], true, sipLogin);
        },

        onAck: ({ tempId, message_id }) => {
            setOptimistic((prev: UiMessage[]) =>
                prev.map(m => (m.tempId === tempId ? { ...m, id: String(message_id), status: "sent" } : m))
            );
        },

        // входящие статусы прочтения — только отмечаем локально, БЕЗ дополнительных эмитов
        onRead: (ids: number[]) => {
            if (!ids?.length) return;
            setHistory(prev => markReadMany(prev, ids));
            setLive(prev => markReadMany(prev, ids));
            setOptimistic(prev => markReadMany(prev, ids));
            // if (activeGuid) void refreshUnreadCounts([activeGuid], true, sipLogin);
        },

        onUploaded: ({ tempId, filenames }) => {
            setOptimistic(prev =>
                prev.map(m => {
                    if (m.tempId !== tempId) return m;
                    const nextAtts = filenames.map((name, i) => ({
                        id: `${m.id}:${i}`,
                        name,
                        url: m.attachments?.[i]?.url,
                    }));
                    return { ...m, attachments: nextAtts };
                })
            );

            if (activeGuid) {
                void refreshContactFiles(activeGuid);
                window.dispatchEvent(
                    new CustomEvent('contact-files:refresh', { detail: { guid: activeGuid } })
                );
            }
        }
    });

    // === hydrate openedPhones из URL при первом рендере ===
    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("card") !== "1") return;

        const idsCsv = sp.get("ids");
        const gbCsv  = sp.get("gb");
        const gt     = sp.get("gt");
        const guid   = sp.get("guid");
        const tusk   = sp.get("tusk") === "1";

        // Показать панель задач/режим карточки, если нужно
        setShowTasksDashboard(true);
        // Если у тебя есть отдельный флаг tuskMode — включи:
        // setTuskMode?.(tusk);

        (async () => {
            // 1) идеальный путь: ids + gb + gt → восстановим ровно ту же выборку
            if (idsCsv && gbCsv && gt) {
                const ids = idsCsv.split(",").map(n => +n).filter(Boolean);
                const group_by = gbCsv.split(",").filter(Boolean);
                try {
                    const rows = await fetchGroupPhonesByIdsUsingPreset(ids, gt, group_by);
                    setOpenedPhones(rows);

                    // если есть guid в ответе или в ссылке — активируем чат
                    const g = rows.find((r: any) => r.guid)?.guid || guid;
                    if (g) setActiveGuid(String(g));
                } catch (e) {
                    console.warn("fetchGroupPhonesByIdsUsingPreset failed", e);
                }
                return;
            }

            // 2) запасной вариант: только guid → поднимем контакты для карточки/чата
            if (guid) {
                try {
                    const { data } = await chatApi.get(`/api/v1/contacts/${encodeURIComponent(guid)}`);
                    const contacts = Array.isArray(data?.data) ? data.data : [];
                    const rows = contacts.map((c: any, i: number) => ({
                        id: c.id ?? -(i + 1),
                        phone: c?.phone ?? c?.contact_info?.phone ?? "",
                        project: c?.project ?? c?.contact_info?.project ?? "",
                        contact_info: c?.contact_info ?? {},
                        guid: String(guid),
                        storage: Array.isArray(c?.storage) ? c.storage : [],
                    }));
                    setOpenedPhones(rows);
                    setActiveGuid(String(guid));
                } catch (e) {
                    console.warn("fetch by guid failed", e);
                }
                return;
            }

            // 3) если ничего нет — просто выходим (ничего не открываем)
        })();
    }, []);

    useEffect(() => {
        if (!isOwner || !enabled) {
            // Старая вкладка перестала быть «звонковой» — гасим локальный UI и стор
            dispatch(setActiveCalls([]));
            setPostActive(false);
        }
    }, [isOwner, enabled, dispatch]);

    useEffect(() => {
        if (!connected || !messages.length) return;

        const isIncomingForMe = (m: UiMessage) => {
            if (sipLogin) return (m.authorLogin ?? null) !== sipLogin; // я оператор
            return m.authorRole !== "client";                                 // я клиент
        };

        const idsToMark: number[] = [];
        for (const m of messages) {
            const numId = Number(m.id);
            if (!Number.isFinite(numId)) continue;          // пропускаем временные id
            if (!isIncomingForMe(m)) continue;              // исходящие мне не нужны
            if (m.isRead) continue;                         // уже отмечены локально
            if (sentReadRef.current.has(numId)) continue;   // уже слали ранее
            idsToMark.push(numId);
        }
        if (!idsToMark.length) return;

        // локально сразу отметим
        setHistory(prev => markReadMany(prev, idsToMark));
        setLive(prev => markReadMany(prev, idsToMark));
        setOptimistic(prev => markReadMany(prev, idsToMark));

        // отправим батчем (с дебаунсом)
        enqueueReads(idsToMark);
    }, [connected, messages, sipLogin]); // ВАЖНО: без readMap в зависимостях

    const flushReads = () => {
        if (queueRef.current.size === 0) return;
        const ids = Array.from(queueRef.current);
        queueRef.current.clear();
        markManyRead(ids);
        ids.forEach(id => sentReadRef.current.add(id));
    };

    const enqueueReads = (ids: number[]) => {
        ids.forEach(id => {
            if (!sentReadRef.current.has(id)) queueRef.current.add(id);
        });
        if (timerRef.current) return; // уже ждём
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            flushReads();
        }, 200);
    };

    // список GUID для табов (включая текущий из URL)
    const guidsFromOpened = useMemo(() => {
        if (openedGuids.length === 0) return
        const arr = Array.from(new Set(
            (openedPhones ?? [])
                .map((it: any) => it?.guid || it?.contact_info?.guid || it?.b_uuid || it?.uuid)
                .filter(Boolean)
                .map(String)
        ));
        if (openedGuids[0].guid && !arr.includes(openedGuids[0].guid)) arr.unshift(openedGuids[0].guid);
        return arr;
    }, [openedGuids]);

    useEffect(() => {
        if (activeGuid) void refreshContactFiles(activeGuid);
    }, [activeGuid]);
    async function handleSend(text: string, files: File[] = []) {
        if (!activeGuid) return;
        const trimmed = text.trim();
        if (!trimmed) return;

        const tempId = crypto.randomUUID();
        const atts = files.map((f, i) => ({ id: `${tempId}:${i}`, name: f.name, file: f } as any));

        const msg: UiMessage = {
            id: tempId,
            tempId,
            text: trimmed,
            created_at: new Date().toISOString(),
            authorLogin: sipLogin || null,
            authorName:  sipLogin || "Клиент",
            authorRole:  sipLogin ? "operator" : "client",
            attachments: atts,
            status: "pending",
            isRead: false,
        };

        setOptimistic(prev => [...prev, msg]);

        try {
            await send(tempId, trimmed, files);
        } catch (e: any) {
            console.error(e);
        }
    }

    useEffect(() => {
        const ids = messages.map(m => Number(m.id)).filter(n => Number.isFinite(n)) as number[];
        if (!ids.length) { setReadMap({}); return; }

        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const query = ids.map(id => `ids=${encodeURIComponent(id)}`).join("&");
                const { data } = await chatApi.get(`/api/v1/chat/messages/status?${query}`);
                if (cancelled) return;

                const map: ReadMap = {};
                Object.entries<any>(data || {}).forEach(([k, v]) => {
                    if (k === "status") return;
                    if (v && typeof v === "object") map[k] = v as ReadStatus;
                });
                setReadMap(map);
            } catch (e) {
                setReadMap({});
                console.warn("read-status fetch failed", e);
            }
        }, 200);

        return () => { clearTimeout(t); cancelled = true; };
    }, [messages, activeGuid]);

    useEffect(() => {
        setSelectedStatus(null)
    },[selectedPreset])
    function getInitialDateRange(): { start: Date; end: Date } {
        const raw = localStorage.getItem('dateRange');
        if (raw) {
            try {
                const { start, end, saved } = JSON.parse(raw) as {
                    start: string;
                    end?: string; // может отсутствовать
                    saved: string;
                };

                const savedDate = new Date(saved);
                const today = new Date();

                const isSameDay =
                    savedDate.getFullYear() === today.getFullYear() &&
                    savedDate.getMonth() === today.getMonth() &&
                    savedDate.getDate() === today.getDate();

                if (isSameDay && start) {
                    const startDate = new Date(start);
                    const endDate = end ? new Date(end) : new Date(startDate);
                    if (!end) {
                        endDate.setDate(endDate.getDate() + 1);
                    }
                    return { start: startDate, end: endDate };
                }

                localStorage.removeItem('dateRange');
            } catch {
                localStorage.removeItem('dateRange');
            }
        }

        // дефолт: сегодня → завтра
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return { start: today, end: tomorrow };
    }
    const logoutShownRef = useRef(false);

    const handleLogout = () => {
        if (logoutShownRef.current) return;

        logoutShownRef.current = true;

        window.location.href = "https://my.glagol.ai/login_work/";
    };

    useEffect(() => {
        socket.on('logout', handleLogout);
        return () => {
            socket.off('logout', handleLogout);
        };
    }, []);

    useEffect(() => {
        const now = new Date().toISOString();
        localStorage.setItem(
            'dateRange',
            JSON.stringify({
                start: startDate?.toISOString(),
                end:   endDate?.toISOString(),
                saved: now
            })
        );
    }, [startDate, endDate]);
    // 1) showTasksDashboard
    useEffect(() => {
        localStorage.setItem('showTasksDashboard', JSON.stringify(showTasksDashboard));
    }, [showTasksDashboard]);

// 2) currentPage
    useEffect(() => {
        localStorage.setItem('tasksCurrentPage', currentPresetPage.toString());
    }, [currentPresetPage]);

// 3) selectedPreset


    useEffect(() => console.log("scriptProject: ", scriptProject),[scriptProject])
    useEffect(() => {
        if (!selectedCall || !openedPhones.length) {
            setScriptProject("")
        }
    },[openedPhones.length, selectedCall])


    const role =
        // "manager"
        monitorUsers[sipLogin]?.type || "operator"

    const [outboundID, setOutboundID] = useState<number | null>(null)
    // const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(null);

//
//     // Где-то в вашем инициализационном файле или компоненте:
//     function subscribeFsData() {
//         const url = `https://wwstest.glagol.ai/api/v1/fs_data?sip_login=${encodeURIComponent(sipLogin)}`;
//
//
//         const evtSource = new EventSource(url);
//
//         // При каждом новом сообщении
//         evtSource.onmessage = (event) => {
//             let payload;
//             try {
//                 payload = JSON.parse(event.data);
//             } catch (e) {
//                 console.error('Не смогли распарсить JSON из SSE:', event.data);
//                 return;
//             }
//
//             // payload: { fs_calls, fs_status, other_users }
//             console.log('FS_DATA:', payload);
//             // Тут вы диспатчите в Redux/Vuex/MobX, апдейтите локальный стейт или UI.
//
//             // Пример обработки «финального» сигнала
//             if (payload.status === 'shutdown') {
//                 console.warn('Получен shutdown. Закрываю SSE.');
//                 evtSource.close();
//             }
//         };
//
//         // Ошибки в соединении
//         evtSource.onerror = (err) => {
//             console.error('Ошибка SSE-соединения:', err);
//             // evtSource.close(); // можно не закрывать — EventSource сам переподключится
//         };
//
//         // Вернём объект, чтобы можно было закрыть вручную
//         return evtSource;
//     }
//
// // Запускаем стрим
//     const sse = subscribeFsData();
//
// // Когда пользователь уйдёт со страницы или нужен стоп:
//     window.addEventListener('beforeunload', () => {
//         sse.close();
//     });

    useEffect(() => console.log('selectedPreset: ', selectedPreset),[selectedPreset])
    const [fullWidthCard, setFullWidthCard] = useState<boolean>(() => {
        try {
            return JSON.parse(localStorage.getItem('fullWidthCard') ?? 'false');
        } catch {
            return false;
        }
    });

    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);

    function cleanProjectName(name?: string | null): string {
        const _name = name ?? '';
        return _name
            .replace(/(\s*\(.*?\)|@default)\s*$/g, '')
            .trim();
    }
    useEffect(() => {
        if (activeCalls.length || postActive) return
        console.log("scriptTestselectedCall: ",selectedCall)
        if (selectedCall) {
            console.log("scriptTestselectedCall112: ",Object.values(selectedCall?.projects)[0].call_result)
        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {

        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {
            // console.log("script")
            const scriptDirection = selectedCall.total_direction || "inbound"
            const scriptProj = Object.keys(selectedCall.projects)[0] !== "outbound" ?
                Object.keys(selectedCall.projects)[0] :
                selectedCall.variable_last_arg
            socket.emit('get_modules', {
                worker,
                session_key: sessionKey,
                projects: [cleanProjectName(scriptProj)],
            });

            setScriptDir(scriptDirection)
            setScriptProject(cleanProjectName(scriptProj))
        }
    },[activeCalls.length, postActive, selectedCall, sessionKey, worker])

    useEffect(()=> {
        if (showTasksDashboard && !momoProjectRepo.current) {
            setSelectedCall(null)
        }
    },[showTasksDashboard])

    const selectFullProjectPool3 = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    // Вызываем useSelector для получения «полных» проектов
    const projectPool2 = useSelector(selectFullProjectPool3) || [];
    const projectPoolForCall = useMemo(() => {
        return projectPool2
            // .filter(project => (project.out_active && project.active))
            .map(project => project.project_name);
    }, [projectPool2]);

    // useEffect(() => {
    //     socket.emit('get_modules', {
    //         worker,
    //         session_key: sessionKey,
    //         projects: projectPoolForCall,
    //     });
    // },[projectPoolForCall, sessionKey, worker])

    useEffect(() => {
        if(!showTasksDashboard) {
            setOpenedGroup([])
            setPhonesData([])
            setOpenedPhones([])
            setGroupIDs([])
        }
        // if(!postActive && !activeCalls.length && !selectedCall) {
        //     setOpenedGroup([])
        //     setPhonesData([])
        //     setOpenedPhones([])
        //     setGroupIDs([])
        // }
    },[showTasksDashboard, postActive, activeCalls.length, selectedCall])
    useEffect(() => console.log("openedPhones: ", openedPhones),[openedPhones])
    useEffect(() => console.log("phonesData: ", phonesData),[phonesData])

    const groupProjects = useMemo(() =>
            Array.from(new Set(openedPhones.map(p => p.project))),
        [openedPhones]
    );
    useEffect(() => {
        console.log("fullWidthCard: ", fullWidthCard)
    },[fullWidthCard])
    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];

    const projectColors = useMemo(() => {
        const palette = [
            '#4c78a8', '#f58518', '#54a24b', '#e45756',
            '#b279a2', '#9d755d', '#bab0ac', '#72b7b2',
            '#f2cf5b', '#7b4173',
        ];
        return groupProjects.reduce<Record<string,string>>((acc, proj, i) => {
            acc[proj] = palette[i % palette.length];
            return acc;
        }, {});
    }, [groupProjects]);

    useEffect(() => {
        if (groupProjects.length > 0) {
            setScriptProject(groupProjects[0]);
        } else if (openedPhones.length){
            setScriptProject('');
        }
    }, [groupProjects, openedPhones.length]);

    // useEffect(() => {
    //     if(!showTasksDashboard) {
    //         setOpenedPhones([])
    //         setPhonesData([])
    //         setOpenedGroup([])
    //     }
    // },[showTasksDashboard])
    useEffect(() => {
        // 🗂 Работает только если TasksDashboard активен И нет активного outbound вызова И нет выбранного outboundID
        if (showTasksDashboard && !outboundCall && !outboundID) {
            if (openedGroup.length > 0 && phonesData.length > 0) {
                const matched = phonesData.filter(phone =>
                    openedGroup.includes(phone.id)
                );
                setOpenedPhones(matched);

                // 🔎 ищем первый контакт с guid
                const contactWithGuid = matched.find(p => Boolean(p.guid));
                if (contactWithGuid) {
                    setActiveGuid(contactWithGuid.guid);
                    setFullWidthCard(false)
                } else {
                    setActiveGuid("");
                }
            } else {
                setOpenedPhones([]);
                setActiveGuid("");
            }
        }

        // В остальных случаях — НЕ ТРОГАТЬ
    }, [openedGroup, phonesData, outboundID, GroupIDs, outboundCall, showTasksDashboard]);


    useEffect(()=> console.log("activeProjectName: ", activeProjectName),[activeProjectName])
    useEffect(()=> console.log("activeCall: ", activeCall),[activeCall])

    // const sessionKey = getCookies('session_key') || '';
    useEffect(() => {
        try {
            localStorage.setItem('fullWidthCard', JSON.stringify(fullWidthCard));
        } catch {}
    }, [fullWidthCard]);


    useEffect(() => {
        // TODO fix check_express
        // if (activeCalls.length > 0) {
        //     socket.emit('check_express', {
        //         phone,
        //         project_name,
        //         session_key,
        //         worker
        //     })
        // }
        console.log("activeCalls: ", activeCalls)
    },[activeCalls])


    useEffect(()=> {
        if (!activeCall && !postActive && (modules.length || Object.keys(monoModules).length) && !openedPhones.length && !selectedCall) {
            console.log("1234delete")
            setModules([])
            setMonoModules({})
        }
    },[activeCall, modules.length, monoModules, openedPhones.length, postActive, selectedCall])

    useEffect(() => {
        if (!activeCall && !postActive) {
            setActiveProjectName('');
            setSelectedCall(null);
            setOutboundCall(false);
            setOutboundID(null)
            setOutActivePhone(null);
            setGet_callcenter(false);
            setOutActiveProjectName('');
            setPhoneID(null)
            setAssignedKey('');
            // setOpenedGroup([])
            // setPhonesData([])
            // setOpenedPhones([])
            // setGroupIDs([])
            setExpressCall(false)
        }
    }, [activeCall, postActive]);

    useEffect(() => {
        if(openedPhones.length === 0) {
            momoProjectRepo.current = false
        }
    },[openedPhones])
    useEffect(()=> {
        if (!activeCall && postActive && sessionKey) {
            socket.emit('get_fs_report', {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                level: 0,
            });
        }
    },[activeCall, postActive, activeCalls, sessionKey])
    useEffect(() => {
        console.log("activeCalls: ", activeCalls)
        const first = activeCalls && activeCalls.length ? activeCalls[0] : {};
        console.log("first: ", first)

        if (activeCalls.length > 0 && !activeCall && (first?.application || first?.b_callstate === "ACTIVE")) {
            setActiveCall(true);
            startModulesRanRef.current = true
        } else if (!activeCalls.length && activeCall) {
            setActiveCall(false);
            if (openedPhones) {
                const ids = openedPhones?.map((item) => item.id)
                socket.emit("group_lock_off", {
                    ids,
                    session_key: sessionKey,
                    worker
                })
            }
            // setOutboundCall(false);
            if (!isOwner || !enabled) return;
            setPostActive(true);
        }
    }, [activeCall, activeCalls]);

    useEffect(()=> {
        const getOuboundProject = (msg:any) => {
            setScriptDir("outbound")
            setActiveProjectName(msg.project_name)
            if (expressCall){
                setPhoneID(msg.phone_line[0].id)
            }
        }
        socket.on('get_out_start', getOuboundProject);
        return () => {
            socket.off('get_out_start', getOuboundProject);
        };
    },[expressCall])
    // useEffect(()=> {
    //     if (postActive && sessionKey) {
    //         socket.emit('get_fs_report', {
    //             session_key: sessionKey,
    //             sip_login: sipLogin,
    //             level: 0,
    //             date_range: "",
    //             phone_search: "",
    //         });
    //         setCurrentPage(1)
    //     }
    // },[showScriptPanel, postActive, sessionKey])

    useEffect(() => {
        const handleFsDiaDes = (msg: any) => {
            // ✅ Ставим активный проект
            setActiveProjectName(msg.project_name);

            // ✅ Проверяем express по активному номеру
            if (activeCalls[0]?.cid_num) {
                socket.emit('check_express', {
                    phone: activeCalls[0].cid_num,
                    project_name: msg.project_name,
                    session_key: sessionKey,
                    worker,
                });
            }

            // ✅ Запрашиваем FS причины
            socket.emit('get_fs_reasons', {
                project_name: msg.project_name,
                session_key: sessionKey,
                worker,
            });
        };

        const handleCheckExpress = (check: any) => {
            console.log("check_express response:", check);
            if (check.express && check.assigned_key) {
                normalizeUrl()
                setOpenedPhones?.([]);
                setOpenedGroup?.([]);
                setPhonesData?.([]);
                startModulesRanRef.current = false;

                setShowTasksDashboard(true)
                setAssignedKey(check.assigned_key);
                setExpressCall(check.express)
                setOutActiveProjectName(activeProjectName)
                // ✅ Запрашиваем phone_line
                setOutActivePhone(activeCalls[0].cid_num)
                socket.emit('get_phone_line', {
                    worker,
                    session_key: sessionKey,
                    project_name: activeProjectName,
                    phones: [activeCalls[0].cid_num],
                    express: check.express
                });
            }
        };

        const handleGetPhoneLine = (msg: any) => {
            console.log("get_phone_line response:", msg);

            // ✅ Если приходит массив phone_line, берем special_key
            if (msg.phone_line[0]?.special_key) {
                setSpecialKey(msg.phone_line[0].special_key);
                if (assignedKey && msg.phone_line[0].special_key) {
                    socket.emit('outbound_call_update', {
                        worker,
                        session_key: sessionKey,
                        assigned_key: assignedKey,
                        log_status: 'ringing',
                        phone_status: 'ringing',
                        special_key: msg.phone_line[0].special_key,
                    });

                }
            }
            console.log()
            if (expressCall) {
                socket.emit("accept_express_call",{
                    worker,
                    session_key: sessionKey,
                    assigned_key: assignedKey,
                    sip_login: sipLogin,
                    project_name: msg.project_name
                })
            }
        };

        socket.on('get_callcenter_queues', handleFsDiaDes);
        socket.on('check_express', handleCheckExpress);
        socket.on('get_out_start', handleGetPhoneLine);

        return () => {
            socket.off('get_callcenter_queues', handleFsDiaDes);
            socket.off('check_express', handleCheckExpress);
            socket.off('get_out_start', handleGetPhoneLine);
        };
    }, [outboundCall, sessionKey, worker, activeCalls, assignedKey, activeProjectName, expressCall]);

    function extractPhoneGroups(obj: any): any[][] {
        const groups: any[][] = [];
        function recurse(node: any) {
            if (Array.isArray(node)) {
                if (node.length && typeof node[0] === 'object' && 'phone' in node[0]) {
                    groups.push(node); // нашли массив телефонов
                }
            } else if (typeof node === 'object' && node !== null) {
                Object.values(node).forEach(recurse);
            }
        }
        recurse(obj);
        return groups;
    }

    useEffect(() => {
        if (!selectedCall) return;

        const projNames = Object.keys(selectedCall?.projects || {});
        const projNamesSaved =
            projNames[0] === "outbound" && projNames.length === 1
                ? [selectedCall.variable_last_arg]
                : projNames;

        if (projNames.length < 2 && projNames[0] !== "outbound") return;

        const fetchPresetsAndCheckPhone = async () => {
            try {
                let myPresetsLocal = presets;

                if (presets.length === 0) {
                    const resp = await axios.post<Preset[]>("/api/v1/get_preset_list", {
                        glagol_parent: "fs.at.glagol.ai",
                        worker,
                        projects: projectPoolForCall,
                        role,
                    });
                    const data: Preset[] = resp.data;
                    myPresetsLocal = data.map(p => ({ value: p.id, label: p.preset_name, preset: p }));
                    setPresets(myPresetsLocal);
                }

                const matchedPreset = myPresetsLocal.find(p =>
                    p.preset.projects.includes(projNamesSaved[0])
                );
                if (!matchedPreset) {
                    console.log("Нет пресета под проект:", projNamesSaved[0]);
                    return;
                } else {
                    console.log("matchedPreset:", matchedPreset);
                    setSelectedPreset(matchedPreset);
                }

                // 🔎 Пытаемся найти «контакт-источник» для group_by:
                // 1) currentPhoneData (если есть у тебя такой объект с полной строкой phones)
                // 2) пробуем найти по phoneID в phonesData (если есть)
                // 3) fallback — собираем минимум из selectedCall
                const currentPhoneData =
                    // @ts-ignore — если у тебя уже есть такой стейт/проп, подставь реальный
                    (typeof getCurrentPhoneData === "function" ? getCurrentPhoneData(phoneID) : undefined) ||
                    // @ts-ignore — если хранишь массив phonesData
                    (Array.isArray(phonesData) ? phonesData.find((p: any) => p?.id === phoneID) : undefined) ||
                    // минимальный объект из selectedCall (добавь сюда нужные alias-поля под свои group_by)
                    {
                        phone: selectedCall?.b_line_num,
                        b_line_num: selectedCall?.b_line_num,
                        a_line_num: selectedCall?.a_line_num,
                        project: projNamesSaved?.[0],
                    };

                // 🧩 Строим расширенный filter_by из group_by + проект
                const groupFilter = buildGroupByFilter(matchedPreset.preset.group_by, currentPhoneData || {});
                const filter_by: Record<string, any> = {
                    project: ["IN", matchedPreset.preset.projects],
                    ...groupFilter,
                };

                console.log("get_grouped_phones.filter_by →", filter_by);

                const response2 = await axios.post<any>("/api/v1/get_grouped_phones", {
                    glagol_parent: projectPool[0].scheme || "",
                    group_by: matchedPreset.preset.group_by,
                    filter_by,
                    group_table: matchedPreset.preset.group_table,
                    role,
                });

                const projectIdData = response2.data;
                const allGroups = extractPhoneGroups(projectIdData);
                const flatPhones = allGroups.flat();

                if (!phoneID) return;

                const matchedGroups = allGroups.filter(group =>
                    group.some(item => item.id === phoneID)
                );
                console.log("matchedGroups:", matchedGroups);

                if (matchedGroups.length > 0) {
                    setShowTasksDashboard(true);

                    const matchedGroupIDs = Array.from(
                        new Set(matchedGroups.flat().map(item => item.id))
                    );

                    const openedPhones = matchedGroups.flat();

                    const groupIDs = allGroups.map(group => group.map(item => item.id));

                    setGroupIDs(groupIDs);
                    setPhonesData(flatPhones);
                    setOpenedGroup(matchedGroupIDs);
                    setOpenedPhones(openedPhones);

                    momoProjectRepo.current = true;
                } else {
                    console.log("Номер не найден → tuskMode OFF");
                    setShowTasksDashboard(false);
                }
            } catch (err) {
                console.error("Ошибка при проверке пресетов:", err);
            }
        };

        fetchPresetsAndCheckPhone();
    }, [selectedCall, phoneID, presets, projectPool, worker, projectPoolForCall, role]);

    useEffect(() => {
        // колбэки объявляем внутри эффекта, чтобы off() снял ровно их же
        const handleFsStatus = (msg: any) => {
            // общая часть может обновлять состояние статуса
            dispatch(setFsStatus(msg));

            // всё «послезвонковое» только у владельца
            if (!isOwner || !enabled) return;

            if (msg.status === "Available (On Demand)" && msg.state === "Idle") {
                setPostActive(true);
            } else if (msg.status === "Available (On Demand)" && msg.state !== "Idle") {
                setPostActive(false);
            }
        };

        const handleFsCalls = (msg: any) => {
            if (!isOwner || !enabled) return;
            const callsArray: any[] = Object.values(msg);
            dispatch(setActiveCalls(callsArray));
        };

        const handleOtherUsers = (msg:any) => {
            dispatch(setUserStatuses(msg));
        };

        // если вкладка не владелец — гарантированно снимаем прошлые подписки и выходим
        if (!isOwner || !enabled) {
            socket.off('fs_status', handleFsStatus);
            socket.off('fs_calls', handleFsCalls);
            socket.off('other_users', handleOtherUsers);
            return;
        }

        // владелец — подписываемся
        socket.on('fs_status', handleFsStatus);
        socket.on('fs_calls', handleFsCalls);
        socket.on('other_users', handleOtherUsers);

        // аккуратная отписка при любом изменении deps/размонтировании
        return () => {
            socket.off('fs_status', handleFsStatus);
            socket.off('fs_calls', handleFsCalls);
            socket.off('other_users', handleOtherUsers);
        };
    }, [dispatch, isOwner, enabled]);

    useEffect(() => console.log("outActivePhone: ",outActivePhone),[outActivePhone])
    useEffect(() => {
        if (!(activeCalls[0] && Object.keys(activeCalls[0]).length > 0)) return
        const first = activeCalls[0]
        if (first.direction === "inbound") {
            setShowTasksDashboard(false)
        }
        console.log("first: ", first)
        if (first.uuid !== "" && first.cid_num !== "" && !get_callcenter && !outboundCall){
            setGet_callcenter(true)
            setScriptDir("inbound")
            const requestParams = {
                session_key: sessionKey,
                worker,
                phone: activeCalls[0].cid_num,
            };
            socket.emit('get_callcenter_queues', requestParams);
        }
    }, [activeCall, activeCalls, get_callcenter, outboundCall]);

    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

    const onAccept = () => {
        if (!incoming) return;
        answerCall().then(() => {
            // TODO: dispatch/fs/socket.emit о принятии
        });
        // clearIncoming();
    };
    useEffect(() => console.log("incoming: ", incoming),[incoming])
    const onReject = () => {
        if (!incoming) return;
        hangUp()
        // TODO: dispatch/fs/socket.emit об отклонении
        clearIncoming();
    };

    function shortGuid(g: string, len = 8) {
        return g.length > len ? `...${g.slice(-len)}` : g;
    }

    function labelForGuid(g: string) {
        return shortGuid(g);

    }

    return (
        <div className="container-fluid">
            {enabled && (
                <>
                    {/* Аудио для удалённого потока */}
                <audio
                    ref={remoteAudioRef}
                    autoPlay
                    hidden
                />

                {/* Аудио для локального потока (mute/unmute) */}
                <audio
                    ref={localAudioRef}
                    autoPlay
                    muted
                    hidden
                />

                {incoming && incoming.state === SessionState.Initial && (
                    <NotificationPopup
                        from={incoming.remoteIdentity.uri.user}
                        onAccept={onAccept}
                        onReject={onReject}
                    />
                )}
                </>
            )}
            {/* Шапка с панелью управления (HeaderPanel) */}
            <HeaderPanel
                setShowScriptPanel={setShowScriptPanel}
                showScriptPanel={showScriptPanel}
                selectedProject={selectedProject}
                setPostActive={setPostActive}
                setSelectedProject={setSelectedProject}
                setOutboundCall={setOutboundCall}
                setActiveProjectName={setActiveProjectName}
                outActivePhone={outActivePhone}
                setOutActivePhone={setOutActivePhone}
                outActiveProjectName={outActiveProjectName}
                setOutActiveProjectName={setOutActiveProjectName}
                assignedKey={assignedKey}
                setAssignedKey={setAssignedKey}
                setIsLoading={setIsLoading}
                specialKey={specialKey}
                setSpecialKey={setSpecialKey}
                activeProjectName={activeProjectName}
                showTasksDashboard={showTasksDashboard}
                setShowTasksDashboard={setShowTasksDashboard}
                prefix={prefix}
                setPrefix={setPrefix}
                setOutboundID={setOutboundID}
                setOpenedGroup={setOpenedGroup}
                setGroupIDs={setGroupIDs}
                setOpenedPhones={setOpenedPhones}
                setPhonesData={setPhonesData}
                setSelectedPreset={setSelectedPreset}
                role={role}
                expressCall={expressCall}
                groupProjects={groupProjects}
                setManagerPanel={setManagerPanel}
                managerPanel={managerPanel}
                // setPhoneID={setPhoneID}
                // phoneID={phoneID}
                outActivePhoneData={outActivePhoneData}
                setOutActivePhoneData={setOutActivePhoneData}
                startModulesRanRef={startModulesRanRef}
            />

            {managerPanel ? (
                    (<ManagerPanel/>)
                ) :
                showTasksDashboard ? (
                    <>
                        {/* Показываем Dashboard, если нет активного звонка */}
                        {!(activeCall || postActive) && openedPhones.length === 0 && (
                            <TasksDashboard
                                openedGroup={openedGroup}
                                setOpenedGroup={setOpenedGroup}
                                phonesData={phonesData}
                                setPhonesData={setPhonesData}
                                setGroupIDs={setGroupIDs}
                                selectedPreset={selectedPreset}
                                setSelectedPreset={setSelectedPreset}
                                role={role}
                                currentPage={currentPresetPage}
                                setCurrentPage={setCurrentPresetPage}
                                startDate={startDate}
                                setStartDate={setStartDate}
                                endDate={endDate}
                                setEndDate={setEndDate}
                                selectedStatus={selectedStatus}
                                setSelectedStatus={setSelectedStatus}
                                appliedLocalFilters={appliedLocalFilters}
                                setAppliedLocalFilters={setAppliedLocalFilters}
                                appliedServerFilters={appliedServerFilters}
                                setAppliedServerFilters={setAppliedServerFilters}
                                localFilterDraft={localFilterDraft}
                                setLocalFilterDraft={setLocalFilterDraft}
                                serverFilterDraft={serverFilterDraft}
                                setServerFilterDraft={setServerFilterDraft}
                                unreadOnly={unreadOnly}
                                setUnreadOnly={setUnreadOnly}
                            />
                        )
                        }
                        <div
                            // общий «ряд», в котором скрипт и карточка
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 16,
                            }}
                        >
                            {openedPhones.length > 0 && activeGuid &&
                            <div
                                style={{
                                    order: 1,
                                    flex: '0 0 calc(50% - 8px)',
                                    marginTop: 20,
                                    minWidth: 0,
                                }}
                            >
                                {guidsFromOpened && guidsFromOpened.length > 1 && (
                                    <div className="pb-2">
                                        <ul className={styles.chatTabs}>
                                            {guidsFromOpened.map(g => {
                                                const unread = unreadByGuid[g] ?? 0;
                                                const isActive = activeGuid === g;

                                                return (
                                                    <li key={g} className={styles.chatTabsItem}>
                                                        <button
                                                            type="button"
                                                            className={`${styles.chatTabsBtn} ${isActive ? styles.isActive : ""} ${unread ? styles.hasUnread : ""}`}
                                                            onClick={() => setActiveGuid(g)}
                                                            title={labelForGuid(g)}
                                                            aria-label={`${labelForGuid(g)}${unread ? `, непрочитанных: ${unread}` : ""}`}
                                                        >
                                                            <span className={styles.chatTabsLabel}>{labelForGuid(g)}</span>
                                                            {unread > 0 && <span className={styles.chatTabsBadge}>{unread}</span>}
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {/*<ContactFilesPanel*/}
                                {/*    contacts={openedPhones}*/}
                                {/*    serverFilesByGuid={serverFilesByGuid}*/}
                                {/*/>*/}

                                <LocalChat
                                    guid={activeGuid}
                                    selfLogin={viewer.login}
                                    selfName={viewer.name}
                                    selfRole={viewer.role}
                                    collapsed={collapsed.value}
                                    onToggle={collapsed.toggle}
                                    messages={messages}
                                    height={collapsed.value ? "52px" : "clamp(420px, 65vh, 820px)"}
                                    onSend={handleSend}
                                    operatorDict={operatorDict}
                                    // formatOperatorFn={formatOperator}
                                    title={`Чат · ${activeGuid ?? ""}`}
                                    // subtitle={labelForGuid(activeGuid)}
                                    readMap={readMap}
                                />

                            </div>
                            }
                            {/* ScriptPanel */}
                            <div
                                style={{
                                    order: openedPhones.length > 0 && activeGuid ? 3 : fullWidthCard ? 2 : 1,
                                    flex: openedPhones.length > 0 && activeGuid ? '0 0 98%' : fullWidthCard ? '0 0 100%' : '0 0 48%' ,
                                    minWidth: 0,
                                }}
                            >
                                {!postActive && !activeCall && openedPhones.length > 0 && (
                                    <div style={{ marginLeft: 13, marginRight: 14 }}>
                                        {groupProjects.length > 1 && (
                                            <div style={{ display: "flex", gap: "8px", marginBottom: "6px", marginLeft: "25px" }}>
                                                {groupProjects.map(proj => {
                                                    const isActive = scriptProject === proj;
                                                    return (
                                                        <button
                                                            key={proj}
                                                            className={`${stylesButton.projectButton} ${isActive ? stylesButton.active : ""}`}
                                                            style={{
                                                                color:        isActive ? "#fff" : projectColors[proj],
                                                                background:   isActive ? projectColors[proj] : "transparent",
                                                                borderColor:  projectColors[proj],
                                                            }}
                                                            onClick={() => setScriptProject(proj)}
                                                        >
                                                            {findNameProject(proj)}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {scriptProject && (
                                    <ScriptPanel
                                        key={scriptProject}
                                        projectName={scriptProject}
                                        onClose={() => setShowScriptPanel(false)}
                                        direction={scriptDir}
                                        uuid={postCallData?.uuid}
                                        bUuid={postCallData?.b_uuid}
                                        tuskMode={showTasksDashboard}
                                    />
                                )}
                            </div>

                            <div
                                style={{
                                    order: openedPhones.length > 0 && activeGuid ? 2 : fullWidthCard ? 2 : 1,
                                    flex: openedPhones.length > 0 && activeGuid ? '0 0 48%' : fullWidthCard ? '0 0 100%' : '0 0 48%' ,
                                    minWidth: 0,
                                }}
                            >
                                {(openedPhones.length > 0 || activeCall || postActive) && (
                                        <CallControlPanel
                                            call={selectedCall}
                                            hasActiveCall={activeCall}
                                            activeProject={scriptProject}
                                            onClose={() => setSelectedCall(null)}
                                            postActive={postActive}
                                            setPostActive={setPostActive}
                                            currentPage={currentPage}
                                            outActivePhone={outActivePhone}
                                            outActiveProjectName={outActiveProjectName}
                                            assignedKey={assignedKey}
                                            isLoading={isLoading}
                                            setSelectedCall={setSelectedCall}
                                            setIsLoading={setIsLoading}
                                            specialKey={specialKey}
                                            setModules={setModules}
                                            modules={modules}
                                            prefix={prefix}
                                            outboundCall={outboundCall}
                                            tuskMode={showTasksDashboard}
                                            setTuskMode={setShowTasksDashboard}
                                            fullWidthCard={fullWidthCard}
                                            setFullWidthCard={setFullWidthCard}
                                            openedPhones={openedPhones}
                                            setOpenedPhones={setOpenedPhones}
                                            monoModules={monoModules}
                                            setMonoModules={setMonoModules}
                                            setActiveProjectName={setActiveProjectName}
                                            selectedPreset={selectedPreset}
                                            postCallData={postCallData}
                                            setPostCallData={setPostCallData}
                                            role={role}
                                            setOpenedGroup={setOpenedGroup}
                                            setPhonesData={setPhonesData}
                                            momoProjectRepo={momoProjectRepo}
                                            startModulesRanRef={startModulesRanRef}
                                            expressCall={expressCall}
                                            phoneID={phoneID}
                                            setPhoneID={setPhoneID}
                                            checkBox={activeGuid}
                                        />
                                )}
                            </div>
                        </div>
                    </>
                ) : <div className="row my-3">

                    <div className="col-12 col-md-6">
                        {(selectedCall && scriptDir && scriptProject && !postActive && !activeCalls.length) ?
                            <ScriptPanel
                                direction={scriptDir}
                                projectName={scriptProject}
                                onClose={() => setSelectedCall(null)}
                                tuskMode={showTasksDashboard}
                                selectedCall={selectedCall}
                            />
                            :
                            (
                                showScriptPanel ||
                                (activeCall && activeProjectName) ||
                                (postActive && activeProjectName)
                                    ? (
                                        <ScriptPanel
                                            direction={scriptDir}
                                            projectName={activeProjectName}
                                            onClose={() => setShowScriptPanel(false)}
                                            tuskMode={showTasksDashboard}
                                        />
                                    ) : (
                                        <CallsDashboard
                                            setSelectedCall={setSelectedCall}
                                            selectedCall={selectedCall}
                                            currentPage={currentPage}
                                            setCurrentPage={setCurrentPage}
                                            isLoading={isLoading}
                                            setIsLoading={setIsLoading}
                                        />
                                    ))}
                    </div>
                    <div className="col-12 col-md-6">
                        {(selectedCall || activeCall || postActive) && (
                            <CallControlPanel
                                call={selectedCall}
                                hasActiveCall={activeCall}
                                activeProject={activeProjectName}
                                onClose={() => setSelectedCall(null)}
                                postActive={postActive}
                                setPostActive={setPostActive}
                                currentPage={currentPage}
                                outActivePhone={outActivePhone}
                                outActiveProjectName={outActiveProjectName}
                                assignedKey={assignedKey}
                                isLoading={isLoading}
                                setIsLoading={setIsLoading}
                                specialKey={specialKey}
                                setModules={setModules}
                                setSelectedCall={setSelectedCall}
                                modules={modules}
                                prefix={prefix}
                                outboundCall={outboundCall}
                                tuskMode={showTasksDashboard}
                                postCallData={postCallData}
                                setPostCallData={setPostCallData}
                                startModulesRanRef={startModulesRanRef}
                                monoModules={monoModules}
                                setMonoModules={setMonoModules}
                                expressCall={expressCall}
                            />
                        )}
                    </div>
                </div>
            }
        </div>
    );
};

export default MainApp;
