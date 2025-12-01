import React, {useState, useEffect, useRef, useMemo} from 'react';
import { socket } from '../../socket';
import PhoneProjectSelect from './components/PhoneProjectSelect';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import Swal from "sweetalert2";
import EditableFields from "./components";
import {makeSelectFullProjectPool} from "../../redux/operatorSlice";
import SearchableSelect from "./components/select";
import {ModuleData, MonoProjectsModuleData} from "../mainApp";
import styles from "../taskDashboard/components/checkbox.module.css";
import GroupActionModal from "../taskDashboard/components";
import {OptionType, Preset} from "../taskDashboard";
import stylesButton from './index.module.css';
import axios from "axios";
import { ContactFilesPanel } from '../../features/itsm/chat/FieldsPanel';
import { chatApi } from '../../features/itsm/chat/api';
import {makeId} from "../../utils";

// --- ALERT helpers ---
type AlertMsg = {
    title?: string;
    text?: string;
    type?: 'success' | 'error' | 'warning' | 'info';
};
export function normalizeUrl(path?: string) {
    // если нужен конкретный путь — можно передать его в path
    const next = path ?? window.location.pathname;
    window.history.replaceState(null, '', next);
}

// на случай бегущего счётчика — держим его в ref
const runningModulesCountRef = { current: 0 } as React.MutableRefObject<number>;

// очередь алертов, чтобы не конфликтовало с «Выполняются модули»
const alertsQueueRef = { current: [] as AlertMsg[] } as React.MutableRefObject<AlertMsg[]>;
const isShowingAlertRef = { current: false } as React.MutableRefObject<boolean>;

const mapIcon = (t?: string): 'success'|'error'|'warning'|'info' => {
    const s = String(t || '').toLowerCase();
    if (s === 'success' || s === 'error' || s === 'warning' || s === 'info') return s as any;
    if (s === 'ok' || s === 'passed' || s === 'accepted') return 'success';
    if (s === 'warn') return 'warning';
    return 'info';
};

// достаём ВСЕ алерты из любого места payload'а
function collectAlerts(payload: any): AlertMsg[] {
    const out: AlertMsg[] = [];
    const seen = new Set<string>();

    const push = (m: AlertMsg) => {
        const key = JSON.stringify({ t: m.title || '', x: m.text || '', i: m.type || '' });
        if (!seen.has(key) && (m.title || m.text)) {
            seen.add(key);
            out.push(m);
        }
    };

    const looksLikeAlertObj = (obj: any) => {
        if (!obj || typeof obj !== 'object') return false;
        const t = String(obj.type ?? '').toLowerCase();
        const hasType = ['success','error','warning','info','ok','passed','accepted','warn'].includes(t);
        const destAlert = String((obj as any).destination ?? '')?.toLowerCase() === 'alert';
        const hasTitleOrText = typeof (obj as any).title === 'string' || typeof (obj as any).text === 'string';
        return hasTitleOrText && (hasType || destAlert);
    };

    const walk = (node: any) => {
        if (!node || typeof node !== 'object') return;

        // 1) destination/msg-формат
        if (node.destination === 'alert' && node.msg && typeof node.msg === 'object') {
            push({ title: node.msg.title, text: node.msg.text, type: mapIcon(node.msg.type) });
        }

        // 2) alert-объект как поле
        if (node.alert && looksLikeAlertObj(node.alert)) {
            push({ title: node.alert.title, text: node.alert.text, type: mapIcon(node.alert.type) });
        }

        // рекурсивно
        for (const k in node) {
            if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
            const v = (node as any)[k];
            if (v && typeof v === 'object') walk(v);
        }
    };

    walk(payload);
    return out;
}

// показать один алерт (ставится в очередь, не конфликтует со «спиннером»)
function enqueueAlert(m: AlertMsg, swalRef: React.MutableRefObject<any>) {
    alertsQueueRef.current.push(m);
    processAlerts(swalRef);
}

function processAlerts(swalRef: React.MutableRefObject<any>) {
    if (isShowingAlertRef.current) return;
    const next = alertsQueueRef.current.shift();
    if (!next) return;

    isShowingAlertRef.current = true;

    // если сейчас показывается «Выполняются модули», временно закроем
    if (swalRef.current) {
        Swal.close();
        swalRef.current = null;
    }

    Swal.fire({
        title: next.title || 'Уведомление',
        text: next.text || '',
        icon: mapIcon(next.type),
        allowOutsideClick: false,
        confirmButtonText: 'Ок'
    }).then(() => {
        isShowingAlertRef.current = false;

        // если ещё что-то крутится — вернём прогресс-диалог
        if (runningModulesCountRef.current > 0 && !swalRef.current) {
            swalRef.current = Swal.fire({
                title: 'Выполняются модули',
                html: `Осталось <strong>${runningModulesCountRef.current}</strong> модулей`,
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
        }

        // показать следующий алерт из очереди
        processAlerts(swalRef);
    });
}

// Типы (упрощённые — оставьте свои)
interface PhoneCombo {
    id: string;           // "<phone>|<comma-separated values>"
    phone: string;        // сам телефон
    values: string[];     // массив значений
    projects: string[];   // **новое** — список проектов, в которых найдены эти значения
}
export interface PhoneOption {
    id: string;
    phone: string;
    project: string;
}

export interface FieldPhoneOptions {
    showDropdown: boolean;
    distinctValues: string[];
    phoneOptions: PhoneOption[];
}
interface Project {
    comment: string | null;
    call_reason: number | null;
    call_result: number | null
    base_fields: {
        [field: string]: any;
    };
    // …any other props on each project
}

type ProjectsMap = Record<string, Project>;

declare const call: {
    projects: ProjectsMap;
};

export interface ReasonItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface ResultItem {
    id: string;
    name: string;
    description?: string;
    project_name: string;
    [key: string]: any;
}
export interface FieldDefinition {
    field_id: string;
    field_name: string;
    field_type: string;
    field_vals: string | null;
    editable: boolean;
    must_have: boolean;
    project_name: string;
    tab?: string | number;
    onchange?: string[];
    [key: string]: any;
}

export interface CallData {
    variable_last_arg: string;
    destination_id: string
    caller_id: string ;
    id: number;
    a_line_num: string;
    b_line_num: string;
    datetime_start: string;
    direction: string;           // 'inbound' | 'outbound'
    record_name?: string;
    base_fields?: { [key: string]: string };
    call_reason?: string | number;
    call_result?: string | number;
    user_comment?: string;
    project_name?: string;
    total_direction?: 'inbound' | 'outbound'
    special_key_call: string;
    special_key_conn: string;
    projects: ProjectsMap
    express: boolean
}
export interface ActiveCall {
    accountcode: string;
    application: string;
    application_data: string;
    b_accountcode: string;
    b_application: string;
    b_application_data: string;
    b_call_uuid: string;
    b_callee_direction: string;
    b_callee_name: string;
    b_callee_num: string;
    b_callstate: string;
    b_cid_name: string;
    b_cid_num: string;
    b_context: string;
    b_created: string;
    b_created_epoch: string;
    b_dest: string;
    b_dialplan: string;
    b_direction: string;
    b_hostname: string;
    b_ip_addr: string;
    b_name: string;
    b_presence_data: string;
    b_presence_id: string;
    b_read_bit_rate: string;
    b_read_codec: string;
    b_read_rate: string;
    b_secure: string;
    b_sent_callee_name: string;
    b_sent_callee_num: string;
    b_state: string;
    b_uuid: string;
    b_write_bit_rate: string;
    b_write_codec: string;
    b_write_rate: string;
    call_created_epoch: string;
    call_uuid: string;
    callee_direction: string;
    callee_name: string;
    callee_num: string;
    callstate: string;
    cid_name: string;
    cid_num: string;
    context: string;
    created: string;
    created_epoch: string;
    dest: string;
    dialplan: string;
    direction: string;
    hostname: string;
    ip_addr: string;
    name: string;
    presence_data: string;
    presence_id: string;
    read_bit_rate: string;
    read_codec: string;
    read_rate: string;
    secure: string;
    sent_callee_name: string;
    sent_callee_num: string;
    state: string;
    uuid: string;
    write_bit_rate: string;
    write_codec: string;
    write_rate: string;
}

interface MergedField {
    id: string;
    editable: boolean;
    label: string;
    type: string;
    values: string | null;
    projects: string[];
    fieldIds: Record<string, string>;
    tabsByProject: Record<string, string | null>;
    spatialGroup?: string;
    position?: number;
    group_id?: number | null;
    group_position?: number | null;
    width: number | null;

    onchangeByProject?: Record<string, string[]>;
}

type GroupFieldValues = Record<
    string,                     // project_name
    Record<string/*field_id*/, string/*value*/>
>;

export interface ExpressState {
    project: string;
    express_id: number;
    active: boolean;
    calls: number;
    agents: string[];
}

interface CallControlPanelProps {
    call: CallData | null;
    onClose: () => void;
    activeProject: string;
    postActive: boolean;
    setPostActive: (postActive: boolean) => void;
    currentPage: number;
    hasActiveCall: boolean
    outActivePhone: string | null
    outActiveProjectName: string
    assignedKey: string
    isLoading: boolean
    setIsLoading: (isLoading: boolean) => void
    specialKey: string
    modules: ModuleData[]
    setModules: (modules: ModuleData[]) => void
    prefix: string
    outboundCall: boolean
    tuskMode:boolean
    setTuskMode?: (tuskMode:boolean) => void
    fullWidthCard?: boolean
    setFullWidthCard?: (fullWidthCard: boolean) => void
    openedPhones?: any[]
    setOpenedPhones?: (openedPhones: any[]) => void
    monoModules?: MonoProjectsModuleData
    setMonoModules?: (monoModules: MonoProjectsModuleData) => void
    setActiveProjectName?: (activeProjectName: string) => void
    selectedPreset?: OptionType | null
    postCallData: ActiveCall | null
    setPostCallData: (postCallData: ActiveCall | null) => void
    role?: string,
    setOpenedGroup?: (group: any[]) => void
    setPhonesData?: (group: any[]) => void
    momoProjectRepo?: React.MutableRefObject<boolean>;
    startModulesRanRef: React.MutableRefObject<boolean>;
    expressCall: boolean
    phoneID?: number | null
    setPhoneID?: (phoneID: number | null) => void
    setSelectedCall: (call: CallData | null) => void
    isChating?: boolean
    isClient?: boolean
    checkBox?: string | null
}

type PhoneGroup = {
    phone: string;
    entries: Array<{
        project: string;
        contact_info: Record<string, string>;
    }>;
};

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
const rawFsServer = (container.dataset as any).fsServer;
const fsServer = rawFsServer || 'wwstest.glagol.ai';

const TAB_ALL = '__all__';
const TAB_ALL_LABEL = 'Остатки';

const TAB_FILES = '__files__';
const TAB_FILES_LABEL = 'Файлы';

function getContactGuid(c: any): string | null {
    return (
        (c?.guid && String(c.guid)) ||
        (c?.contact_info?.guid && String(c.contact_info.guid)) ||
        (c?.b_uuid && String(c.b_uuid)) ||
        (c?.uuid && String(c.uuid)) ||
        null
    );
}
function normalizeStorage(storage: any): string[] {
    if (!Array.isArray(storage)) return [];
    return storage
        .map((it) => (typeof it === "string" ? it : it?.name ?? it?.filename ?? ""))
        .filter((s: string) => !!s);
}
function extractFilesFromContacts(arr: any[]): string[] {
    const all: string[] = [];
    for (const c of arr ?? []) {
        const storage = normalizeStorage(c?.storage);
        for (const s of storage) if (s) all.push(s);
    }
    return Array.from(new Set(all));
}

const toTabKey = (v: any): string | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
};

const sortTabKeys = (a: string, b: string) => {
    const an = Number(a);
    const bn = Number(b);
    const aIsNum = !Number.isNaN(an);
    const bIsNum = !Number.isNaN(bn);
    if (aIsNum && bIsNum) return an - bn;
    if (aIsNum) return -1;
    if (bIsNum) return 1;
    return a.localeCompare(b, 'ru');
};

const norm = (s?: any) => String(s ?? '').trim().toLowerCase();

// если visible пустой/отсутствует — показываем поле (обратная
// совместимость). поддерживаем рус/eng варианты.
const isVisibleForRole = (visible: any, role?: string): boolean => {
    // нормализация роли
    const r = norm(role)
        .replace('оператор', 'operator')
        .replace('менеджер', 'manager');

    // приведём visible к массиву строк (если был строкой)
    const arr = visible == null
        ? null                    // отсутствует → считаем «не задано»
        : (Array.isArray(visible) ? visible : [visible])
            .map(v => norm(v)
                .replace('оператор', 'operator')
                .replace('менеджер', 'manager'))
            .filter(Boolean);

    // НОВОЕ ПОВЕДЕНИЕ:
    // 1) visible отсутствует (null/undefined) → показываем (обратная совместимость)
    if (arr === null) return true;

    // 2) visible есть, но пустой массив/пустые строки → ЯВНО скрыть из UI
    if (arr.length === 0) return false;

    // 3) '*' или 'all' → показываем всем
    if (arr.includes('*') || arr.includes('all')) return true;

    // 4) если роли нет — по умолчанию не скрываем
    if (!r) return true;

    // 5) показываем, если роль перечислена
    return arr.includes(r);
};

type ActivityLabel = string; // если у тебя там объект — заменишь тип

function useActivityPing(params: {
    enabled: boolean;              // включать только когда мы реально "в карточке"
    glagolParent: string;
    userName: string;
    activityLabels: ActivityLabel[];
}) {
    const { enabled, glagolParent, userName, activityLabels } = params;

    const labelsRef = React.useRef<ActivityLabel[]>(activityLabels);
    React.useEffect(() => {
        labelsRef.current = activityLabels;
    }, [activityLabels]);

    const urlRef = React.useRef<string>("");
    const urlSessionRef = React.useRef<string>("");

    React.useEffect(() => {
        if (!enabled) return;

        if (!urlRef.current) {
            urlRef.current = window.location.pathname + window.location.search;
        }

        if (!urlSessionRef.current) {
            // можно оставить только crypto.randomUUID, если браузеры все новые
            if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
                urlSessionRef.current = crypto.randomUUID();
            } else if (typeof makeId === "function") {
                urlSessionRef.current = makeId(32);
            } else {
                urlSessionRef.current = String(Date.now());
            }
        }

        let isWindowActive =
            document.visibilityState === "visible" && document.hasFocus();

        let lastScrollTs = 0;
        let lastInputTs  = 0;

        let windowActiveMs = 0;
        let scrollActiveMs = 0;
        let inputActiveMs  = 0;

        const INTERVAL_MS        = 30_000; // длина интервала (30 сек, как в примере)
        const TICK_MS            = 1_000;  // шаг таймера
        const ACTIVE_TTL_SCROLL  = 2_000;  // считаем скролл "активным" 2 сек после события
        const ACTIVE_TTL_INPUT   = 2_000;  // и ввод тоже

        let intervalStart = Date.now();
        let lastTick      = Date.now();

        const handleVisibility = () => {
            isWindowActive =
                document.visibilityState === "visible" && document.hasFocus();
        };
        const handleFocus = () => {
            isWindowActive = true;
        };
        const handleBlur = () => {
            isWindowActive = false;
        };
        const handleScroll = () => {
            lastScrollTs = Date.now();
        };
        const handleInput = () => {
            lastInputTs = Date.now();
        };

        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("focus", handleFocus);
        window.addEventListener("blur", handleBlur);
        window.addEventListener("scroll", handleScroll, { passive: true });
        document.addEventListener("keydown", handleInput);
        document.addEventListener("mousedown", handleInput);
        document.addEventListener("touchstart", handleInput, { passive: true });
        document.addEventListener("input", handleInput as any);

        const sendPing = (endTs: number) => {
            // ❗ требования: не слать интервалы с window_active = 0
            if (windowActiveMs <= 0) {
                windowActiveMs = scrollActiveMs = inputActiveMs = 0;
                intervalStart = endTs;
                return;
            }

            const payload = {
                glagol_parent: glagolParent,
                user_name: userName,
                url: urlRef.current,
                url_session: urlSessionRef.current,
                interval_start: new Date(intervalStart).toISOString(),
                interval_end:   new Date(endTs).toISOString(),
                window_active:  Math.round(windowActiveMs),
                scroll_active:  Math.round(scrollActiveMs),
                input_active:   Math.round(inputActiveMs),
                activity_labels: labelsRef.current ?? [],
            };

            // Если бэк повешен под /api/v1, просто поменяй путь на "/api/v1/activity/ping"
            axios.post("/api/v1/activity/ping", payload)
                .catch(err => {
                    console.warn("activity/ping failed", err);
                });

            // сбрасываем счётчики на следующий интервал
            windowActiveMs = scrollActiveMs = inputActiveMs = 0;
            intervalStart = endTs;
        };

        const timerId = window.setInterval(() => {
            const now   = Date.now();
            const delta = now - lastTick;
            lastTick    = now;

            const scrollActive = now - lastScrollTs < ACTIVE_TTL_SCROLL;
            const inputActive  = now - lastInputTs  < ACTIVE_TTL_INPUT;

            if (isWindowActive) {
                windowActiveMs += delta;
                if (scrollActive) scrollActiveMs += delta;
                if (inputActive)  inputActiveMs  += delta;
            }

            if (now - intervalStart >= INTERVAL_MS) {
                sendPing(now);
            }
        }, TICK_MS);

        return () => {
            const endTs = Date.now();

            window.clearInterval(timerId);

            document.removeEventListener("visibilitychange", handleVisibility);
            window.removeEventListener("focus", handleFocus);
            window.removeEventListener("blur", handleBlur);
            window.removeEventListener("scroll", handleScroll);
            document.removeEventListener("keydown", handleInput);
            document.removeEventListener("mousedown", handleInput);
            document.removeEventListener("touchstart", handleInput);
            document.removeEventListener("input", handleInput as any);

            // при размонтировании дольём остаток интервала
            if (enabled) {
                const delta = endTs - lastTick;
                const scrollActive = endTs - lastScrollTs < ACTIVE_TTL_SCROLL;
                const inputActive  = endTs - lastInputTs  < ACTIVE_TTL_INPUT;

                if (isWindowActive) {
                    windowActiveMs += delta;
                    if (scrollActive) scrollActiveMs += delta;
                    if (inputActive)  inputActiveMs  += delta;
                }

                if (windowActiveMs > 0) {
                    sendPing(endTs);
                }
            }
        };
    }, [enabled, glagolParent, userName]);
}

const CallControlPanel: React.FC<CallControlPanelProps> = ({
                                                               specialKey,
                                                               isLoading,
                                                               setIsLoading,
                                                               assignedKey,
                                                               outActiveProjectName,
                                                               outActivePhone,
                                                               call,
                                                               hasActiveCall,
                                                               onClose,
                                                               activeProject,
                                                               setPostActive,
                                                               postActive,
                                                               currentPage,
                                                               modules,
                                                               setModules,
                                                               prefix,
                                                               outboundCall,
                                                               tuskMode,
                                                               setTuskMode,
                                                               fullWidthCard,
                                                               setFullWidthCard,
                                                               openedPhones,
                                                               setOpenedPhones,
                                                               monoModules,
                                                               setMonoModules,
                                                               setActiveProjectName,
                                                               selectedPreset,
                                                               postCallData,
                                                               setPostCallData,
                                                               role,
                                                               setOpenedGroup,
                                                               setPhonesData,
                                                               momoProjectRepo,
                                                               startModulesRanRef,
                                                               expressCall,
                                                               phoneID,
                                                               setPhoneID,
                                                               setSelectedCall,
                                                               isChating,
                                                               isClient,
                                                               checkBox= null
                                                           }) => {
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = '',
    } = store.getState().credentials;

    const { sessionKey } = store.getState().operator
    useEffect(() => console.log("monoModulesCallControlPanel: ", monoModules),[monoModules])
    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];
    console.log("projectPool: ", projectPool)

    const activeCalls: ActiveCall[] = useSelector((state: RootState) => state.operator.activeCalls);

    const [manualNumber, setManualNumber] = useState('');
    // Состояния для формы
    const [dockOpen, setDockOpen] = useState(false);

    const [callReason, setCallReason] = useState('');
    const [callResult, setCallResult] = useState('');
    const [comment,   setComment]     = useState('')
    const [baseFieldValues, setBaseFieldValues] = useState<{ [fieldId: string]: string }>(
        call?.base_fields || {}
    );
    // Списки причин, результатов и полей для заполнения
    const [callReasons, setCallReasons] = useState<ReasonItem[]>([]);
    const [callResults, setCallResults] = useState<ResultItem[]>([]);
    const [group_instructions, setGroup_instructions] = useState<any>(null)
    const [mergedFieldsAll, setMergedFieldsAll] = useState<MergedField[]>([]); // ВСЕ поля
    const [mergedFields,    setMergedFields]    = useState<MergedField[]>([]); // Поля, которые рендерим
    const [values, setValues] = useState<GroupFieldValues>({});
    useEffect(() => console.log("values323123: ", values), [values])

    useEffect(() => console.log("mergedFields: ", mergedFields), [mergedFields])
    // Состояние для списка модулей, полученных с сервера
    // const [modules, setModules] = useState<ModuleData[]>([]);
    const [isParams, setIsParams] = useState<boolean>(true)
    const [groupSelectedIds, setGroupSelectedIds] = useState<number[]>([]);
    const swalRef = useRef<any>(null);
    const [activeTab, setActiveTab] = useState<string>(TAB_ALL);
    const [serverFilesByGuid, setServerFilesByGuid] = useState<Record<string, string[]>>({});

// Дебаунс-таймеры на "поле-проект"
    const debounceOnchangeTimersRef = useRef<Record<string, any>>({});
    const valuesRef = useRef(values);
    useEffect(() => { valuesRef.current = values; }, [values]);

    const baseFieldValuesRef = useRef(baseFieldValues);
    useEffect(() => { baseFieldValuesRef.current = baseFieldValues; }, [baseFieldValues]);

    const callReasonRef = useRef(callReason);
    useEffect(() => { callReasonRef.current = callReason; }, [callReason]);

    const callResultRef = useRef(callResult);
    useEffect(() => { callResultRef.current = callResult; }, [callResult]);

    const commentRef = useRef(comment);
    useEffect(() => { commentRef.current = comment; }, [comment]);

    const activeCallsRef = useRef(activeCalls);
    useEffect(() => { activeCallsRef.current = activeCalls; }, [activeCalls]);

    const postCallDataRef = useRef(postCallData);
    useEffect(() => { postCallDataRef.current = postCallData; }, [postCallData]);

    const closeDockTimerRef = useRef<number | null>(null);

    useEffect(() => {
        return () => {
            if (closeDockTimerRef.current) {
                window.clearTimeout(closeDockTimerRef.current);
                closeDockTimerRef.current = null;
            }
        };
    }, []);
// Универсальный поиск модулей по имени.
// Ищем по filename (приоритет) или по button_name.
// Сначала смотрим модуль конкретного проекта (если передан),
// затем — во всех проектах monoModules, затем — в fallback `modules`.
    function findModulesForNames(names: string[], preferredProject?: string): ModuleData[] {
        const out: ModuleData[] = [];
        const seen = new Set<string>();

        const lists: ModuleData[][] = [];

        if (preferredProject && monoModules?.[preferredProject]) {
            lists.push(monoModules[preferredProject]);
        }
        if (monoModules && Object.keys(monoModules).length) {
            lists.push(...Object.values(monoModules));
        }
        if (Array.isArray(modules) && modules.length) {
            lists.push(modules);
        }

        const pick = (needle: string): ModuleData | undefined => {
            for (const list of lists) {
                const byFile = list.find(m => String(m.filename) === needle);
                if (byFile) return byFile;
                const byBtn = list.find(m => String(m.button_name) === needle);
                if (byBtn) return byBtn;
            }
            return undefined;
        };

        names.forEach(nm => {
            const mod = pick(nm);
            if (mod && !seen.has(mod.filename)) {
                seen.add(mod.filename);
                out.push(mod);
            }
        });

        return out;
    }

// Запуск модулей, указанных в onchange поля. С дебаунсом, чтобы не стрелять на каждый keypress.
    const ONCHANGE_DEBOUNCE_MS = 400;

    function triggerOnchangeModulesForField(
        proj: string,
        fieldId: string,
        f: MergedField,
        nextValue: string // ⬅️ новое
    ) {
        const names = f.onchangeByProject?.[proj] || [];
        if (!names.length) return;

        const key = `${proj}:${fieldId}`;
        if (debounceOnchangeTimersRef.current[key]) {
            clearTimeout(debounceOnchangeTimersRef.current[key]);
        }

        debounceOnchangeTimersRef.current[key] = setTimeout(() => {
            const mods = findModulesForNames(names, proj);
            if (!mods.length) return;

            // ⬇️ «снимок» актуальных values + патч свежего значения поля
            const override: GroupFieldValues = {
                [proj]: {
                    ...(valuesRef.current?.[proj] || {}),
                    [fieldId]: nextValue
                }
            };

            setRunningModulesCount(prev => prev + mods.length);
            mods.forEach(m => {
                handleModuleRun(m, false, proj, { manual: true, overrideValues: override });
            });
        }, ONCHANGE_DEBOUNCE_MS);
    }

    const userPickedTab = useRef(false);
    const selectTab = (key: string) => {
        userPickedTab.current = true;
        setActiveTab(key);
    };

    const computeDefaultTab = () => {
        const leftTabs = availableTabs.filter(t => t !== TAB_FILES);
        return hasLeftovers ? TAB_ALL : (leftTabs[0] ?? (hasFiles ? TAB_FILES : TAB_ALL));
    };

    const guidsFromOpened = useMemo(
        () =>
            Array.from(
                new Set(
                    (openedPhones ?? [])
                        .map((c: any) => getContactGuid(c))
                        .filter(Boolean)
                        .map(String)
                )
            ),
        [openedPhones]
    );
    const guidsCsv = useMemo(() => guidsFromOpened.join(','), [guidsFromOpened]);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const hasAnyGuid = guidsFromOpened.length > 0;


    function extractUploadedNames(up: any): string[] {
        // 1) чаще всего сервер отдаёт массив объектов
        if (Array.isArray(up)) {
            return up.map((o: any) => o?.filename || o?.name || o?.storage_name).filter(Boolean);
        }
        // 2) иногда заворачивают в поле data / result / uploaded
        const candidates = [up?.data, up?.result, up?.uploaded, up?.files, up?.storage];
        for (const c of candidates) {
            if (Array.isArray(c)) {
                return c.map((o: any) => o?.filename || o?.name || o?.storage_name).filter(Boolean);
            }
        }
        // 3) fallback: одиночный объект
        if (typeof up === 'object' && up?.filename) return [up.filename];
        return [];
    }

    async function uploadFilesToAllGuids(files: FileList) {
        if (!files?.length || !guidsFromOpened?.length) return;

        const bin   = Array.from(files);
        const guids = Array.from(new Set(guidsFromOpened));

        await Promise.allSettled(
            guids.map(async (guid) => {
                try {
                    // upload
                    const fd = new FormData();
                    bin.forEach(f => fd.append('files', f, f.name)); // имя файла не обязательно, но полезно
                    const { data: up } = await chatApi.post(
                        `/api/v1/storage/upload/${encodeURIComponent(guid)}`,
                        fd
                    );
                    const storage = extractUploadedNames(up);
                    if (!storage.length) {
                        console.warn('upload ok, but no filenames in response:', up);
                        // если бэк сам сразу привязывает — просто пинганём рефреш
                        window.dispatchEvent(new CustomEvent('contact-files:refresh', { detail: { guid } }));
                        return;
                    }

                    // attach (если требуется явная привязка)
                    try {
                        await chatApi.post(`/api/v1/contacts/storage/add`, { guid, storage });
                    } catch (e: any) {
                        // если файл уже привязан и бэк даёт 409/400 — не роняем цепочку
                        const code = e?.response?.status;
                        if (code !== 409 && code !== 400) throw e;
                    }

                    // обновляем карточку только после успешной привязки
                    window.dispatchEvent(new CustomEvent('contact-files:refresh', { detail: { guid } }));
                } catch (e) {
                    console.warn('upload/attach failed for guid', guid, e);
                }
            })
        );
    }

    function setCallResultByAny(v: any) {
        const str = v == null ? '' : String(v);
        if (str === '') { setCallResult(''); return; }
        // 1) по id
        const byId = callResults.find(r => String(r.id) === str);
        if (byId) { setCallResult(String(byId.id)); return; }
        // 2) по name
        const byName = callResults.find(r => String(r.name) === str);
        if (byName) { setCallResult(String(byName.id)); return; }
        // иначе сброс
        setCallResult('');
    }

    function setCallReasonByAny(v: any) {
        const str = v == null ? '' : String(v);
        if (str === '') { setCallReason(''); return; }
        const byId = callReasons.find(r => String(r.id) === str);
        if (byId) { setCallReason(String(byId.id)); return; }
        const byName = callReasons.find(r => String(r.name) === str);
        if (byName) { setCallReason(String(byName.id)); return; }
        setCallReason('');
    }

    async function refreshContactFilesByGuid(g: string) {
        if (!g) return;
        try {
            const { data: resp } = await chatApi.get(`/api/v1/contacts/${encodeURIComponent(g)}`);
            const contacts = Array.isArray(resp?.data) ? resp.data : [];
            const files = extractFilesFromContacts(contacts);
            setServerFilesByGuid(prev => ({ ...prev, [g]: files }));
        } catch (e) {
            console.warn("refreshContactFilesByGuid failed", e);
        }
    }
    async function refreshAllOpenedFiles() {
        if (!guidsFromOpened.length) return;
        const promises = guidsFromOpened.map(g => refreshContactFilesByGuid(g));
        await Promise.allSettled(promises);
    }
    useEffect(() => {
        if (activeTab === TAB_FILES) {
            void refreshAllOpenedFiles();
        }
    }, [activeTab, guidsFromOpened]);

// 2) Лёгкий поллинг, пока открыта вкладка "Файлы" (например, раз в 60с)
    useEffect(() => {
        if (activeTab !== TAB_FILES) return;
        const id = window.setInterval(() => void refreshAllOpenedFiles(), 60000);
        return () => window.clearInterval(id);
    }, [activeTab, guidsFromOpened]);

// 3) Глобальное событие — чтобы чат (или любой другой компонент) мог пингануть обновление
    useEffect(() => {
        const handler = (e: Event) => {
            const ce = e as CustomEvent<{ guid?: string }>;
            const g = ce?.detail?.guid;
            if (g) void refreshContactFilesByGuid(g);
            else void refreshAllOpenedFiles();
        };
        window.addEventListener('contact-files:refresh', handler as EventListener);
        return () => window.removeEventListener('contact-files:refresh', handler as EventListener);
    }, [guidsFromOpened]);

    // const [selectedPhoneByField, setSelectedPhoneByField] = useState<
    //     Record<string, { phone: string; project: string }>
    // >({});
    const [selectedPhoneByField, setSelectedPhoneByField] = useState<Record<string,string>>({});

    const [runningModulesCount, setRunningModulesCount] = useState(0);

    useEffect(() => console.log("selectedPhoneByField: ", selectedPhoneByField),[selectedPhoneByField])

    const [groupModalOpen, setGroupModalOpen] = useState(false);

    useEffect(() => {
        if (hasActiveCall && !openedPhones && outboundCall) {
            socket.emit("get_project_fields",{
                projects: [outActiveProjectName],
                session_key: sessionKey,
                worker
            })
        }
    },[hasActiveCall, openedPhones, outActiveProjectName, outboundCall, sessionKey, worker])

    const getPhonesByIds = (ids: number[]) => {
        return openedPhones?.filter(p => ids.includes(p.id)) || [];
    };

    const groupProjects = useMemo(() => {
        console.log("openedPhonesMEMO: ", openedPhones)
        if (!openedPhones) return [];
        return Array.from(new Set(openedPhones.map(p => p.project)));
    }, [openedPhones]);
    useEffect(() => setActiveProjectName?.(groupProjects[0]),[groupProjects, setActiveProjectName])
    const [selectedProjects, setSelectedProjects] = useState<string[]>(groupProjects);


    const activityLabels = useMemo(() => {
        // какие поля вообще хотим использовать (обычно ["group_factor_1", "group_factor_2"])
        const keys = new Set<string>();

        projectPool.forEach((p: any) => {
            if (!selectedProjects.includes(p.project_name)) return;

            const arr = Array.isArray(p.activity_labels) ? p.activity_labels : [];
            arr.forEach((lbl: any) => {
                const s = String(lbl || '').trim();
                if (s) keys.add(s);
            });
        });

        const firstContact = openedPhones && openedPhones.length ? openedPhones[0] : null;
        const values = new Set<string>();

        // если нет контактов — просто ничего не шлём
        if (!firstContact) {
            return [];
        }

        keys.forEach((rawKey) => {
            const key = String(rawKey).trim();
            if (!key) return;

            let value: any = (firstContact as any)[key];

            // пробуем ещё и в contact_info
            if (
                (value === undefined || value === null || value === '') &&
                firstContact.contact_info &&
                Object.prototype.hasOwnProperty.call(firstContact.contact_info, key)
            ) {
                value = firstContact.contact_info[key];
            }

            // если значение есть — кладём в labels только его
            const str = String(value ?? '').trim();
            if (str) {
                values.add(str);
            }
        });

        return Array.from(values);
    }, [projectPool, selectedProjects, openedPhones]);

    // считаем, что "мы в карточке", когда:
    //  - есть активный звонок, или
    //  - идёт постобработка, или
    //  - открыт tuskMode с openedPhones
    const activityEnabled =
        Boolean(hasActiveCall || postActive || (tuskMode && openedPhones && openedPhones.length));

    useActivityPing({
        enabled: activityEnabled,
        glagolParent,
        // тут как раз "1000" — чаще всего это sipLogin
        userName: sipLogin || worker,
        activityLabels: activityLabels,
    });

    // у поля есть таб для конкретного проекта?
    function fieldHasTabForProject(f: MergedField, proj: string): boolean {
        const tk = f.tabsByProject?.[proj];
        return tk != null && String(tk).trim() !== '';
    }

// поле — «остаток», если для НИ ОДНОГО из выбранных проектов таб не задан
    function isFieldLeftover(f: MergedField): boolean {
        let hasAnySelected = false;
        for (const p of f.projects) {
            if (!selectedProjects.includes(p)) continue;
            hasAnySelected = true;
            if (fieldHasTabForProject(f, p)) return false; // есть вкладка — уже не остаток
        }
        return hasAnySelected; // есть пересечение с выбранными, но ни одного таба
    }
    useEffect(() => {
        runningModulesCountRef.current = runningModulesCount;
    }, [runningModulesCount]);

// есть ли вообще поля-остатки для текущих selectedProjects
    const hasLeftovers = useMemo(
        () => mergedFields.some(isFieldLeftover),
        [mergedFields, selectedProjects]
    );

    const idProjectMap = useMemo(() =>
            openedPhones?.map(ph => ({ id: ph.id, project_name: ph.project })) || [],
        [openedPhones]);
    useEffect(() => console.log("444groupProjects: ", groupProjects),[groupProjects])
    useEffect(() => console.log("444selectedProjects: ", selectedProjects),[selectedProjects])

    useEffect(() => {
        if (groupProjects.length === 0 && activeProject) {
            setSelectedProjects([activeProject])
        } else if (call && call.project_name) {
            if(Object.keys(call?.projects).length   > 1 ) {
                setSelectedProjects(Object.keys(call?.projects))
            } else if (call.project_name === "outbound") {
                setSelectedProjects([cleanProjectName(call.variable_last_arg)])
            } else {
                setSelectedProjects([cleanProjectName(call.project_name)])
            }
        } else {
            setSelectedProjects(groupProjects)
        }
    },[activeProject, call, groupProjects])
// ---- Стабильная сортировка модулей ----
    function moduleComparator(a: ModuleData, b: ModuleData) {
        // 1) сначала manual, потом всё остальное
        const aManual = a.start_modes?.includes('manual') ? 0 : 1;
        const bManual = b.start_modes?.includes('manual') ? 0 : 1;
        if (aManual !== bManual) return aManual - bManual;

        // 2) общие модули (common_code) — например, раньше проектных
        const aCommon = a.common_code ? 0 : 1;
        const bCommon = b.common_code ? 0 : 1;
        if (aCommon !== bCommon) return aCommon - bCommon;

        // 3) явная позиция, если есть (чем меньше — тем раньше)
        const aPos = Number.isFinite((a as any).position) ? Number((a as any).position) : Number.POSITIVE_INFINITY;
        const bPos = Number.isFinite((b as any).position) ? Number((b as any).position) : Number.POSITIVE_INFINITY;
        if (aPos !== bPos) return aPos - bPos;

        // 4) стабильный алфавит по button_name/filename
        const aName = (a.button_name ?? a.filename ?? '').toString();
        const bName = (b.button_name ?? b.filename ?? '').toString();
        return aName.localeCompare(bName, 'ru');
    }

    /** Нормализация monoModules: всегда отдаём объект и сортируем модули в каждом проекте */
    function normalizeMono(mm?: MonoProjectsModuleData): MonoProjectsModuleData {
        if (!mm || typeof mm !== 'object') return {};
        const out: MonoProjectsModuleData = {};
        for (const [project, mods] of Object.entries(mm)) {
            out[project] = [...(mods ?? [])].sort(moduleComparator);
        }
        return out;
    }


    const projectColors = useMemo(() => {
        const palette = [
            '#4c78a8', // спокойный синий
            '#f58518', // оранжевый (как в кнопке "перерыв")
            '#54a24b', // зелёный (но не яркий как #0f0)
            '#e45756', // мягкий красный (не ядреный)
            '#b279a2', // фиолетовый
            '#9d755d', // коричневатый / теплый нейтральный
            '#bab0ac', // серо-бежевый
            '#72b7b2', // бирюзовый
            '#f2cf5b', // жёлто-золотистый (подходит к твоему header'у)
            '#7b4173', // тёмно-лиловый
        ];        return groupProjects.reduce<Record<string,string>>((acc, proj, i) => {
            acc[proj] = palette[i % palette.length];
            return acc;
        }, {});
    }, [groupProjects]);

    const toggleProject = (proj: string) => {
        setSelectedProjects(prev => {
            if (prev.includes(proj)) {
                // не даём сбросить все
                if (prev.length === 1) return prev;
                return prev.filter(p => p !== proj);
            } else {
                return [...prev, proj];
            }
        });
    };

    const compact = tuskMode && fullWidthCard;
    const sanitize = (v: any) =>
        typeof v === 'string' && v.includes('|_|_|') ? '' : v;

    const projectPoolForCall = useMemo(() => {
        return projectPool.filter(project => (project.out_active && project.active)).map(project => project.project_name);
    }, [projectPool]);

    // Активные звонки (из redux)
    // const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false

    // Логика «постобработки»
    const POST_LIMIT = worker.includes('fs@akc24.ru') ? 12000 : 1200;
    const [postSeconds, setPostSeconds] = useState(POST_LIMIT);
    useEffect(() => console.log("postCall: ", postCallData),[postCallData])

    const forbiddenProjects = ['api_call', 'no_project_out'];
    const project = call?.project_name || '';
    const hideReportFields = forbiddenProjects.includes(project);

    const prevCallRef = useRef<ActiveCall | null>(null);

// useEffect для openedPhones в tuskMode
    useEffect(() => {
        if (openedPhones && openedPhones.length) {
            const projects = Array.from(new Set(openedPhones.map(p => p.project)));
            console.log("AGNAINDANSDN", projects);

            if (isClient && projects.length) {
                // клиент → тянем данные через API
                const qs = new URLSearchParams();
                qs.set("glagol_parent", glagolParent);
                projects.forEach(p => qs.append("projects", p));

                axios
                    .get(`/api/v1/project_fields?${qs.toString()}`)
                    .then(({ data }) => {
                        handleProjectFields(data)
                    })
                    .catch(err => {
                        console.error("Ошибка project_fields (client):", err);
                    });
            } else if (projects.length) {
                // оператор → по сокету
                socket.emit("get_project_fields", {
                    projects: projects,
                    session_key: sessionKey,
                    worker
                });
            }
        }
    }, [openedPhones, tuskMode, sessionKey, worker, isClient, selectedProjects]);


// useEffect для входящего звонка
    useEffect(() => {
        if (activeCalls[0]?.direction === "inbound" && activeProject) {
            socket.emit("get_project_fields", {
                projects: [activeProject],
                session_key: sessionKey,
                worker
            });
        }
    }, [activeCalls, activeProject, sessionKey, worker]);

// useEffect для постобработки или завершённого звонка
    useEffect(() => {
        if (!hasActiveCall && !postActive && call?.project_name) {
            const projectNames = Object.keys(call.projects).map((proj => cleanProjectName(proj)));
            if (projectNames.length === 1 && projectNames[0] === "outbound") {
                socket.emit("get_project_fields", {
                    projects: [call.variable_last_arg],
                    session_key: sessionKey,
                    worker
                });
            } else {
                socket.emit("get_project_fields", {
                    projects: projectNames,
                    session_key: sessionKey,
                    worker
                });
            }

            console.log("projectNames: ", projectNames)
            const projectName = projectNames[0];
            const projectDataArray = Object.values(call.projects) as Array<{
                call_reason: number;
                call_result: number;
                comment: string;
                base_fields: Record<string, string>;
            }>;

            setValues({ [projectName]: {} });

            const firstProjectData = projectDataArray[0];
            const baseFields = firstProjectData?.base_fields || {};
            console.log("baseFieldsbaseFieldsbaseFieldsbaseFields: ", baseFields)

            const sanitized: Record<string, string> = {};
            Object.entries(baseFields).forEach(([fid, val]) => {
                if (!fid.startsWith("AS_")) return;
                sanitized[fid] = String(val);
            });

            console.log("sanitized: ", sanitized)
            setValues({ [projectName]: sanitized });
            console.log("valueanotherOneTRADE1")
        }
    }, [call, hasActiveCall, postActive, sessionKey, worker]);

    useEffect(() => console.log("activeProject: ", activeProject),[activeProject])
    useEffect(() => console.log("selectedProjs: ", selectedProjects),[selectedProjects])
// ────────────────────────────────────────────────────────────────────────────────
    const handleProjectFields = (data: {
        project_fields: string;
        as_is_dict: Record<string, FieldDefinition[]>;
        call_reasons: ReasonItem[];
        call_results: ResultItem[];
        group_instructions: any;
    }) => {
        const mapAll = new Map<string, MergedField>();
        const mapUi  = new Map<string, MergedField>();
        setGroup_instructions(data.group_instructions || null);

        const push = (map: Map<string, MergedField>, projName: string, f: FieldDefinition) => {
            const key = [f.field_name, f.field_type, f.field_vals || "", (f as any).spatial_group || ""].join("|");
            const tabKey = toTabKey((f as any).tab);
            const oc: string[] = Array.isArray((f as any).onchange)
                ? (f as any).onchange.map(String)
                : [];

            if (!map.has(key)) {
                map.set(key, {
                    id: key,
                    label: f.field_name,
                    type: f.field_type,
                    values: f.field_vals,
                    editable: f.editable,
                    projects: [projName],
                    fieldIds: { [projName]: f.field_id },
                    tabsByProject: { [projName]: tabKey },
                    spatialGroup: (f as any).spatial_group,
                    group_position: f.group_position || null,
                    group_id: f.group_id || null,
                    width: f.width ?? 12,
                    onchangeByProject: { [projName]: oc }, // <-- НОВОЕ
                });
            } else {
                const e = map.get(key)!;
                if (!e.projects.includes(projName)) e.projects.push(projName);
                e.fieldIds[projName] = f.field_id;
                e.tabsByProject[projName] = tabKey;
                e.onchangeByProject = { ...(e.onchangeByProject || {}), [projName]: oc }; // <-- НОВОЕ
            }
        };

        Object.entries(data.as_is_dict).forEach(([projName, fields]) => {
            if ((selectedProjects.length && !selectedProjects.includes(projName)) || !selectedProjects.length) return;

            fields.forEach(f => {
                // ВСЕГДА добавляем в "все поля"
                push(mapAll, projName, f);

                // В UI добавляем только если поле видно для роли
                if (isVisibleForRole((f as any).visible, role)) {
                    push(mapUi, projName, f);
                }
            });
        });

        const all = Array.from(mapAll.values());
        const ui  = Array.from(mapUi.values());

        setMergedFieldsAll(all);  // «под капотом» для модулей/сохранения
        setMergedFields(ui);      // только то, что рендерим

            // Инициализируем пустые значения сразу для всех выбранных проектов
            const init: GroupFieldValues = { ...values }; // не пустой, а текущий
            if (selectedProjects.length) {
                selectedProjects.forEach(p => {
                    console.log("init[p]: ", init[p])
                    if (!init[p]) {
                        init[p] = {};
                    }
                });
            }
            console.log("initValues: ", values)
            console.log("init: ", init)
            console.log("TEST123call: ",call)
            console.log("TEST123momoProjectRepo: ",momoProjectRepo)

            if (call && momoProjectRepo && momoProjectRepo.current) {
                // 1) InitKwargs — копируем base_fields всех проектов
                type InitKwargs = {
                    [K in keyof ProjectsMap]: ProjectsMap[K]['base_fields']
                };
                const initKwargs = Object.entries(call.projects).reduce<InitKwargs>(
                    (acc, [projName, project]) => {
                        acc[projName as keyof ProjectsMap] = project.base_fields;
                        return acc;
                    },
                    {} as InitKwargs
                );
                console.log("initVALUESinitKwargs: ",initKwargs)
                // if (!manualCallRef.current) {
                    setValues(initKwargs);
                // }


                // 2) Берём первый проект, чтобы инициализировать причину/результат/комментарий
                const firstProject   = Object.values(call.projects)[0];
                const projNames = Object.keys(call.projects)
                const rawReasonId    = firstProject.call_reason;
                const rawResultId    = firstProject.call_result;
                const rawComment     = firstProject.comment || '';

                // 3) Находим в списках по id и project_name нужные объекты, достаём .name
                const reasonItem = callReasons.find(r =>
                    String(r.id) === String(rawReasonId)
                );
                const resultItem = callResults.find(r =>
                    String(r.id) === String(rawResultId)
                );

                setComment(rawComment);
                setCallReason(String(rawReasonId) || '');
                setCallResult(String(rawResultId) || '');
            } else {
                console.log("manualCallRef.currentINIT: ", manualCallRef.current)
                // if (!manualCallRef.current) {
                    setValues(init);
                // }
            }

            if (selectedProjects.length) {
                setCallReasons(
                    data.call_reasons.filter(r => selectedProjects.includes(r.project_name))
                );
                setCallResults(
                    data.call_results.filter(r => selectedProjects.includes(r.project_name))
                );
            }

            // При необходимости, мы также обновляем basicFields, чтобы в tuskMode
            // можно было опираться на них, если вам нужны оба набора полей:
        }

// ✅ Правильная инициализация значений:

    useEffect(() => {
        // if (!tuskMode) return;

        socket.on("project_fields", handleProjectFields);
        return () => {
            socket.off("project_fields", handleProjectFields);
        };
    }, [openedPhones, call, hasActiveCall, selectedProjects, values]);

    useEffect(() => {
        const handleReports = (msg: any) => {
            const item = msg.find((c: any) => c.special_key_call === postCallData?.call_uuid)
            if (item) {
                setIsLoading(false)
            }
        }
        socket.on('fs_report', handleReports);

        return () => {
            socket.off('fs_report', handleReports);
        };
    },[postCallData, setIsLoading, socket])

    useEffect(() => {
        if (hasActiveCall) {
            // Очистка полей формы, как и раньше
            setCallReason('');
            setCallResult('');
            setComment('');
            setBaseFieldValues({});

        }
    },[hasActiveCall])

    useEffect(() => {
        if (!hasActiveCall) {
            startModulesRanRef.current = false;
        }
    }, [hasActiveCall]);

    useEffect(() => {

        if (hasActiveCall && activeCalls.length && !postActive && activeCalls[0].application){
            setPostCallData(activeCalls[0] as ActiveCall);
        }

        // if (hasActiveCall  && !postActive && activeCalls[0].application) {
        //     const startModules = modules.filter(
        //         (mod) => mod.start_modes && mod.start_modes[activeProject] === "start"
        //     );
        //     if (activeCalls.length === 1) {
        //         startModules.forEach((mod) => {
        //             handleModuleRun(mod);
        //         });
        //
        //     }
        // }
    }, [activeCalls, activeProject, hasActiveCall, modules, postActive]);

    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }
    function cleanProjectName(name?: string | null): string {
        const _name = name ?? '';
        return _name
            // убираем скобки "(…)" и суффикс "@default"
            .replace(/(\s*\(.*?\)|@default)\s*$/g, '')
            .trim();
    }

    console.log("cleanProjectName: ", cleanProjectName("test_2@default"))

    useEffect(() => {
        if (!hasActiveCall && !postActive && call) {
            const projectName = cleanProjectName(call.project_name!);

            const projectDataArray = Object.values(call.projects) as Array<{
                call_reason: number;
                call_result: number;
                comment: string;
                base_fields: Record<string, string>;
            }>;

            const firstProjectData = projectDataArray[0];
            if (firstProjectData && projectDataArray.length < 2) {
                setCallReason(String(firstProjectData.call_reason) !== "null" ? String(firstProjectData.call_reason) : "");
                setCallResult(String(firstProjectData.call_result) !== "null" ? String(firstProjectData.call_result) : "");
                setComment(firstProjectData.comment || "");
                // setValues({ [projectName]: firstProjectData.base_fields || {}})
            }
        }
    }, [call, hasActiveCall, postActive]);

    // Обработка ответа сервера для "get_modules"
    useEffect(() => {
        // setModules([]);
        // startModulesRanRef.current = false;
        console.log()
        // if ((!hasActiveCall && (!openedPhones?.length || !call))) return;
        console.log("it's working")
        const handleModules = (data: any) => {
            if (data && typeof data === 'object' && setMonoModules) {
                setMonoModules(normalizeMono(data)); // <— было: setMonoModules(data)
            }
        };

        socket.on('get_modules', handleModules);

        if (tuskMode && selectedProjects.length) {
            socket.emit('get_modules', {
                worker,
                // sip_login: sipLogin,
                session_key: sessionKey,
                // action: 'get_modules',
                projects: selectedProjects,
            });

        } else if (!tuskMode && activeProject){
            socket.emit('get_modules', {
                worker,
                // sip_login: sipLogin,
                session_key: sessionKey,
                // action: 'get_modules',
                projects: [activeProject],
            });

        }

        return () => {
            socket.off('get_modules', handleModules );
            // setModules([]);
        };

    }, [openedPhones, hasActiveCall, activeProject, worker, sessionKey, setModules, tuskMode, setMonoModules, selectedProjects]);

    useEffect(() => console.log("activeProject: ", activeProject),[activeProject])

    useEffect(() => {
        if (runningModulesCount > 0) {
            if (!swalRef.current) {
                // Открываем новый Swal и сохраняем промис в ref
                swalRef.current = Swal.fire({
                    title: 'Выполняются модули',
                    html: `Осталось <strong>${runningModulesCount}</strong> модулей`,
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });
            } else {

                const container = Swal.getHtmlContainer();
                if (container) {
                    const strong = container.querySelector('strong');
                    if (strong) {
                        strong.textContent = String(runningModulesCount);
                    }
                }
            }
        } else {
            if (swalRef.current) {
                Swal.close();
                swalRef.current = null;
            }
        }
    }, [runningModulesCount]);

// добавил четвёртый аргумент options с флагом manual
    const handleModuleRun = (
        mod: ModuleData,
        common_code?: false,
        proj?: string,
        options?: { manual?: boolean; overrideValues?: GroupFieldValues }
    ) => {
        if (!monoModules) {
            console.warn('Описание monoModules отсутствует');
            return;
        }

        const manual = Boolean(options?.manual);

        // 1) Определяем список проектов (как было)
        const projectList: string[] = mod.common_code || tuskMode
            ? Object.entries(monoModules)
                .filter(([_, mods]) => mods.some(m => m.filename === mod.filename))
                .map(([project]) => project)
            : activeProject
                ? [activeProject]
                : call && Object.keys(call.projects)[0] !== "outbound"
                    ? [cleanProjectName(Object.keys(call.projects)[0])]
                    : call
                        ? [call.variable_last_arg]
                        : [""];

        if (projectList.length === 0) {
            console.warn(`Не найдено ни одного проекта для модуля ${mod.filename}`);
            return;
        }

        const projectsPayload: Record<string, Record<string, string>> = {};
        projectList.forEach(project => {
            const projectMod = monoModules[project].find(m => m.filename === mod.filename) || mod;
            const specKwargs = projectMod.kwargs || {};

            // ⬇️ берём актуальные values с учётом override
            const fieldMap =
                (options?.overrideValues?.[project]) ||
                (valuesRef.current?.[project]) ||
                baseFieldValuesRef.current ||
                {};

            const kw: Record<string, string> = {};

            Object.entries(specKwargs).forEach(([inputName, spec]: [string, any]) => {
                const key = spec.source;
                let value = '';

                switch (key) {
                    case 'operator_id':
                        value = sipLogin;
                        break;
                    case 'user':
                        value = worker;
                        break;
                    case 'call_reason':
                        value = callReasons.find(r => String(r.id) === String(callReasonRef.current))?.name || '';
                        break;
                    case 'call_result':
                        value = callResults.find(r => String(r.id) === String(callResultRef.current))?.name || '';
                        break;
                    case 'phone': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.direction === 'outbound' ? ac?.b_dest : (ac?.cid_num || '');
                        break;
                    }
                    case 'uuid': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.uuid || postCallDataRef.current?.uuid || '';
                        break;
                    }
                    case 'b_uuid': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.b_uuid || postCallDataRef.current?.b_uuid || '';
                        break;
                    }
                    case 'datetime_start': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.created || '';
                        break;
                    }
                    case 'dest': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.dest || '';
                        break;
                    }
                    case 'cid_num': {
                        const ac = activeCallsRef.current?.[0];
                        value = ac?.cid_num || '';
                        break;
                    }
                    case 'comment':
                        value = commentRef.current || '';
                        break;
                    default:
                        // ⬇️ главное: берём из актуальной карты полей
                        value = fieldMap[key] || '';
                }

                kw[key] = value;
            });

            if (guidsCsv) {
                if (!('guid' in kw) || String(kw.guid).trim() === '') {
                    kw.guid = guidsCsv;
                }
            }
            if (kw.user == null) kw.user = String(worker ?? '');
            if (kw.project == null) kw.project = project;

            projectsPayload[project] = kw;
        });

        const ac0 = activeCallsRef.current?.[0];
        const payload = {
            filename:    mod.filename,
            common_code: Boolean(mod.common_code),
            session_key: sessionKey,
            uuid:        ac0?.uuid   || postCallDataRef.current?.uuid   || '',
            b_uuid:      ac0?.b_uuid || postCallDataRef.current?.b_uuid || '',
            worker,
            projects:    projectsPayload,
        };

        socket.emit('run_module', payload);
    };


    //
// Слушаем ответы от run_module и распределяем значения по проектам
    useEffect(() => {
        const handleModuleResult = (...args: any[]) => {
            // 1) вытаскиваем первый объектный аргумент
            const raw: Record<string, any> | undefined = args.find(a => typeof a === 'object' && a !== null);
            if (!raw) return;

            // 2) сразу собираем алерты из всех мест (корень + spec + вложенности)
            const alerts = collectAlerts(raw);
            alerts.forEach(a => enqueueAlert(a, swalRef));
            // 2.1) целевая "дырка" через destination
            const dst = String((raw as any)?.destination ?? (raw as any)?.spec?.destination ?? '').toLowerCase();
            if (dst === 'comment' || dst === 'call_result' || dst === 'call_reason') {
                const v =
                    (raw as any)?.value ??
                    (raw as any)?.text ??
                    (raw as any)?.spec?.value ??
                    (raw as any)?.spec?.text ?? '';
                if (dst === 'comment')       setComment(String(v ?? ''));
                else if (dst === 'call_result') setCallResultByAny(v);
                else if (dst === 'call_reason') setCallReasonByAny(v);

                setRunningModulesCount(prev => Math.max(0, prev - 1));
                return; // дальше не маппим поля — целевое назначение уже обработали
            }


            // 3) тикаем счётчик прогресса
            setRunningModulesCount(prev => Math.max(0, prev - 1));

            // 4) для применения значений по полям работаем в первую очередь со spec (если он есть)
            const dataObj = raw;
            const core = (dataObj && typeof dataObj === 'object' && typeof dataObj.spec === 'object')
                ? dataObj.spec
                : dataObj;

            // несколько различных форматов, которые уже были — оставляем, но кормим их "core"
            if ('project_name' in dataObj && 'result' in dataObj && tuskMode) {
                const project = dataObj.project_name as string;
                const result  = dataObj.result || {};
                Object.entries(result).forEach(([fieldKey, value]) => {
                    if (fieldKey === 'msg' || fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type') return;
                    let v: string;
                    if (value == null) v = '';
                    else if (typeof value === 'object') v = JSON.stringify(value);
                    else v = String(value);
                    applyFieldUpdate(project, fieldKey, v);
                });
                return;
            }

            // карта проектов → объекты — (когда приходит множество проектов)
            if (core && typeof core === 'object' &&
                Object.values(core).length > 0 &&
                Object.values(core).every(v => typeof v === 'object' && v !== null && !Array.isArray(v))) {
                Object.entries(core).forEach(([project, result]) => {
                    Object.entries(result || {}).forEach(([fieldKey, value]) => {
                        if (fieldKey === 'msg' || fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type') return;
                        let v: string;
                        if (value == null) v = '';
                        else if (typeof value === 'object') v = JSON.stringify(value);
                        else v = String(value);
                        applyFieldUpdate(project, fieldKey, v);
                    });
                });
                return;
            }

            // плоский ответ с полями (теперь — чаще это core === spec)
            let project = activeProject;
            if (tuskMode) {
                const fieldKeys = Object.keys(core || {});
                const guess = fieldKeys.find(f =>
                    Object.entries(values).some(([_, fields]) => Object.keys(fields).includes(f))
                );
                if (guess) {
                    const entry = Object.entries(values).find(([_, fields]) => fields.hasOwnProperty(guess));
                    if (entry) project = entry[0];
                }
            }

            Object.entries(core || {}).forEach(([fieldKey, value]) => {
                // игнорируем служебные ключи, чтобы не портить значения
                if (fieldKey === 'msg' || fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type' || fieldKey === 'destination') return;

                let v: string;
                if (value == null) v = '';
                else if (typeof value === 'object') v = JSON.stringify(value);
                else v = String(value);

                applyFieldUpdate(project, fieldKey, v);
            });
        };

        socket.on('run_module', handleModuleResult);
        return () => {
            socket.off('run_module', handleModuleResult);
        };
    }, [
        activeProject,
        values,
        tuskMode,
        callReasons,
        callResults,
        postCallData,
        activeCalls,
    ]);



    function applyFieldUpdate(project: string, fieldKey: string, v: string) {
        // не заливаем служебные ключи в базовые поля
        if (fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type' || fieldKey === 'destination') {
            return;
        }

        switch (fieldKey) {
            case 'msg':
                try {
                    const maybe = JSON.parse(v);
                    if (maybe && typeof maybe === 'object' && (maybe.title || maybe.text)) {
                        enqueueAlert({ title: maybe.title, text: maybe.text, type: mapIcon(maybe.type) }, swalRef);
                    }
                } catch { /* ignore */ }
                return;

            case 'call_reason': setCallReason(v); return;
            case 'call_result': setCallResult(v); return;
            case 'comment':     setComment(v);    return;

            default:
                setValues(prev => ({
                    ...prev,
                    [project]: {
                        ...prev[project],
                        [fieldKey]: v
                    }
                }));
        }
    }

    const startModules = useMemo<ModuleData[]>(() => {
        if (monoModules) {
            // flatten всех модулей из monoModules
            return Object.values(monoModules)
                .flat()
                .filter(mod =>
                    Array.isArray(mod.start_modes) &&
                    mod.start_modes.includes('start')
                );
        } else {
            return modules.filter(mod =>
                Array.isArray(mod.start_modes) &&
                mod.start_modes.includes('start')
            );
        }
    }, [monoModules, modules]);
    const hasFiles = useMemo(() => {
        const contactsHas = Array.isArray(openedPhones) && openedPhones.some(c => Array.isArray(c?.storage) && c.storage.length > 0);
        return contactsHas;
    }, [ openedPhones]);

// ручные модули — всё, что не стартовое
    const manualModules = useMemo<ModuleData[]>(() => {
        if (monoModules && Object.keys(monoModules).length) {
            return Object.values(monoModules)
                .flat()
                .filter(mod =>
                    mod.start_modes.includes('manual')
                );
        } else {
            return modules.filter(mod =>
                mod.start_modes.includes('manual')
            );
        }
    }, [monoModules, modules]);
    useEffect(() => console.log("runningModulesCount: ", runningModulesCount),[runningModulesCount])
    useEffect(() => {
        // если уже запустили — не запускаем снова
        if (startModulesRanRef.current) return;
        console.log("START")

        // 1) активный звонок
        if (startModules.length && (hasActiveCall || call)) {
            console.log("startModules")
            setRunningModulesCount(startModules.length)
            startModules.forEach(mod => handleModuleRun(mod, false, undefined, { manual: true }));
            startModulesRanRef.current = true;
            return;
        }

        // 2) таск-мод: карточка открыта (есть openedPhones), но колл не активен и не в пост-моде
        const countPhones = openedPhones?.length ?? 0;
        if (startModules.length && tuskMode && countPhones > 0 && !postActive) {
            console.log("TUSKMODESTART")
            setRunningModulesCount(startModules.length)
            startModules.forEach(mod => handleModuleRun(mod, false, undefined, { manual: true }));
            startModulesRanRef.current = true;
        }
    }, [
        hasActiveCall,
        tuskMode,
        // смотрим на сам массив, а не на length — тогда зависимость сработает и при смене проекта
        openedPhones,
        postActive,
        startModules,
        handleModuleRun,
    ]);

// когда звонок кончается — сбрасываем флаг, чтобы при следующем звонке стартеры снова сработали
//     useEffect(() => {
//         if (!hasActiveCall) {
//             startModulesRanRef.current = false;
//         }
//     }, [hasActiveCall]);

    // Логика постобработки (если звонок завершён)
    useEffect(() => {
        const prevCall = prevCallRef.current;
        const thisCall = hasActiveCall ? activeCalls[0] : null;
        if (prevCall && !postActive && !activeCalls[0]?.application ) {
            socket.emit('fs_post_started', {
                session_key: sessionKey,
                sip_login: sipLogin,
                worker
            })
            setIsParams(false)
            setPostActive(true);
            setPostSeconds(POST_LIMIT)
        }
        if (hasActiveCall) {
            setIsParams(true)
            setPostActive(false);
            setPostSeconds(POST_LIMIT);
        }
        prevCallRef.current = thisCall;
    }, [hasActiveCall, activeCalls, POST_LIMIT]);

    useEffect(() => {
        let timer: NodeJS.Timeout | null = null;
        if (postActive && postSeconds > 0) {
            timer = setInterval(() => setPostSeconds(sec => sec - 1), 1000);
        } else if (postActive && postSeconds <= 0) {
            handleAutoReturn();
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [postActive, postSeconds]);

    const handleAutoReturn = () => {
        Swal.fire({
            title: "Время постобработки истекло",
            icon: "warning",
            timer: 1500,
        });
        socket.emit('change_state_fs', {
            sip_login: sipLogin,
            worker,
            session_key: sessionKey,
            state: 'waiting',
            reason: 'auto_return',
            page: 'online',
        });
        setPostActive(false);
        setIsParams(true)
        setPostSeconds(POST_LIMIT);
        setCallReason('');
        setCallResult('');
        setComment('');
        setBaseFieldValues({});
    };

    // Функции управления активным вызовом: удержание и завершение
    const handleHold = (activeCall: ActiveCall) => {
        const currentUUID = activeCall?.call_uuid;
        if (!currentUUID) return;
        socket.emit('sofia_operations', {
            worker,
            session_key: sessionKey,
            uuid: currentUUID,
            action: 'hold_toggle'
        });
    };

    const handleStop = (activeCall: ActiveCall, callSection: number) => {
        const currentUUID = activeCall?.call_uuid || activeCall.uuid;
        if (!currentUUID) return;
        socket.emit('sofia_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            uuid: currentUUID,
            action: 'uuid_break',
            idle_set: true
        });
        setIsLoading(true)
        // socket.emit('get_fs_report', {
        //     worker,
        //     session_key: sessionKey,
        //     sip_login: sipLogin,
        //     level: 0,
        // });
        if (callSection === 1) {
            // socket.emit('fs_post_started', {
            //     session_key: sessionKey,
            //     sip_login: sipLogin,
            //     worker
            // })

            if (openedPhones) {
                const ids = openedPhones?.map((item) => item.id)
                socket.emit("group_lock_off", {
                    ids,
                    session_key: sessionKey,
                    worker
                })
            }

            setIsParams(false)
            setPostActive(true)
            setPostSeconds(POST_LIMIT);
        }
    };

    const handleRedirect = () => {
        if (activeCalls.length < 2) return;
        const uuid1 = activeCalls[0].direction === "outbound" ? activeCalls[0]?.b_uuid : activeCalls[0]?.uuid;
        const uuid2 = activeCalls[1]?.b_uuid;
        if (!uuid1 || !uuid2) return;
        socket.emit('sofia_operations', {
            worker,
            session_key: sessionKey,
            uuid: uuid1,
            uuid_2: uuid2,
            action: 'uuid_bridge'
        });
    };

    useEffect(()=> console.log("selectedCall: ", call),[call])
    const handleSave = () => {
        // if (!callReason || !callResult) {
        //     Swal.fire({ title: "Ошибка", text: "Проверьте заполнение обязательных полей", icon: "error" });
        //     return;
        // }
        const reasonNumber = typeof callReason === "string" ? parseInt(callReason, 10) : callReason
        const resultNumber = typeof callResult === "string" ? parseInt(callResult, 10) : callResult
        const projectsPayload: Record<string, {
            call_reason: number;
            call_result: number;
            comment: string;
            base_fields: Record<string, string>;
        }> = {};

        // const sanitizedBaseFields = Object.fromEntries(
        //     Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
        // );
        const sanitizedBaseFields = Object.values(values)[0]

        projectsPayload[call?.project_name ?? "proj"] = {
            call_reason: reasonNumber,
            call_result: resultNumber,
            comment,
            base_fields: sanitizedBaseFields,
        };
        const uuid = call?.express ? call.special_key_conn : call?.total_direction === "outbound" ? call?.special_key_conn : call?.special_key_conn
        const b_uuid = call?.express ? call.special_key_conn : call?.total_direction === "outbound" ? call?.special_key_conn : call?.special_key_call
        const phoneNumber = postCallData?.direction === 'outbound' && postCallData?.application !== 'uuid_bridge' ? postCallData.b_callee_num : postCallData?.cid_num;

        socket.emit("edit_call_fs", {
            b_uuid: b_uuid,
            uuid: uuid,
            session_key: sessionKey,
            worker,
            projects: projectsPayload,
            phone: phoneNumber,
        });
        setIsLoading(true)
        socket.emit('get_fs_report', {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: (currentPage - 1) * 10,
        });
        onClose();
    };

    const handleGroupSave = () => {
        // if (!callReason || !callResult) {
        //     Swal.fire({ title: "Ошибка", text: "Выберите причину и результат", icon: "error" });
        //     return;
        // }
        if (!groupModalOpen) {
            setGroupModalOpen(true);
            return;
        }
        // if (setOpenedGroup && setPhonesData && setOpenedPhones) {
        //     setOpenedGroup([])
        //     setPhonesData([])
        //     setOpenedPhones([])
        // }

        const post_time = POST_LIMIT - postSeconds

        const selectedContacts = getPhonesByIds(groupSelectedIds);
        const statusText = callResults.find(r => String(r.id) === String(callResult))?.name || '';

        const groupedByProject = selectedContacts.reduce<Record<string, string[]>>((acc, contact) => {
            if (!acc[contact.project]) {
                acc[contact.project] = [];
            }
            acc[contact.project].push(contact.id);
            return acc;
        }, {});

        const uuid = expressCall ? postCallData?.b_uuid : postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.b_uuid
        const b_uuid = expressCall ? postCallData?.b_uuid : postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.uuid

        const phoneNumber = postCallData?.direction === 'outbound' && postCallData?.application !== 'uuid_bridge' ? postCallData.b_callee_num : postCallData?.cid_num;
        console.log("Object.entries(groupedByProject): ",Object.entries(groupedByProject))
        if (statusText) {
            Object.entries(groupedByProject).forEach(([project_name, ids]) => {
                const payload: any = {
                    ids,
                    project_name,
                    base_fields: values[project_name],
                    uuid,
                    b_uuid,
                    session_key: sessionKey,
                    worker,
                    status: statusText,
                };

                if (phoneID) {
                    payload.call_id = phoneID;
                }

                socket.emit("update_phone_status", payload);
            });
        }


        const reasonNum = Number(callReason);
        const resultNum = Number(callResult);

        const projectsPayload: Record<string, {
            call_reason: number;
            call_result: number;
            comment: string;
            base_fields: Record<string, string>;
        }> = {};

        selectedProjects.forEach(proj => {
            const baseFieldsForProj = values[proj] || {};
            const sanitizedFields = Object.fromEntries(
                Object.entries(baseFieldsForProj).map(([fid, val]) =>
                    [fid, typeof val === "string" && val.includes("|_|_|") ? "" : val]
                )
            );

            projectsPayload[proj] = {
                call_reason: reasonNum,
                call_result: resultNum,
                comment,
                base_fields: sanitizedFields,
            };
        });


        // const b_uuid = postCallData?.b_uuid;
        // const uuid = postCallData?.b_uuid;


        socket.emit("edit_call_fs", {
            b_uuid,
            uuid,
            session_key: sessionKey,
            worker,
            projects: projectsPayload,
            post_time,
            phone: phoneNumber
        });
        socket.emit("change_state_fs", {
            sip_login: sipLogin,
            worker,
            session_key: sessionKey,
            state: "waiting",
            reason: "manual_return",
            page: "online",
        });
        socket.emit("get_fs_report", {
            worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            level: 0,
        });

        setIsLoading(true);
        // setOpenedPhones?.([])
        setPostActive(false);
        setPostSeconds(POST_LIMIT);
        onClose();
    };
    const availableTabs = useMemo(() => {
        const set = new Set<string>();
        for (const f of mergedFields) {
            for (const proj of f.projects) {
                if (!selectedProjects.includes(proj)) continue;
                const tk = f.tabsByProject?.[proj];
                if (tk != null && String(tk).trim() !== '') set.add(String(tk));
            }
        }
        const arr = Array.from(set).sort(sortTabKeys);
        if (hasFiles || hasAnyGuid) arr.push(TAB_FILES);   // <-- ВАЖНО
        return arr;
    }, [mergedFields, selectedProjects, hasFiles, hasAnyGuid]);

    const handlePostSave = () => {
        // if (!callReason || !callResult) {
        //     Swal.fire({
        //         title: "Ошибка",
        //         text: "Проверьте заполнение обязательных полей",
        //         icon: "error",
        //     });
        //     return;
        // }

        const post_time = POST_LIMIT - postSeconds
        if(tuskMode) {
            handleGroupSave()
        } else {
            const reasonText =
                callReasons.find((r) => String(r.id) === callReason)?.name || "";
            const resultText =
                callResults.find((r) => String(r.id) === callResult)?.name || "";

            const reasonNumber = typeof callReason === "string" ? parseInt(callReason, 10) : callReason
            const resultNumber = typeof callResult === "string" ? parseInt(callResult, 10) : callResult
            if (outboundCall) {
                socket.emit('outbound_call_update', {
                    'worker': worker,
                    'session_key':sessionKey,
                    'assigned_key': assignedKey,
                    'base_fields':baseFieldValues,
                    'log_status':'saved',
                    'phone_status': resultText,
                    'special_key':specialKey,
                    'project_name':outActiveProjectName
                })
            }
            // const uuid = postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.b_uuid
            // const b_uuid = postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.uuid

            const uuid = expressCall ? postCallData?.b_uuid : postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.b_uuid
            const b_uuid = expressCall ? postCallData?.b_uuid : postCallData?.direction === "outbound" ? postCallData?.call_uuid : postCallData?.uuid

            const sanitizedBaseFields = Object.fromEntries(
                Object.entries(baseFieldValues).map(([k, v]) => [k, sanitize(v)])
            );
            const phoneNumber = postCallData?.direction === 'outbound' && postCallData?.application !== 'uuid_bridge' ? postCallData.b_callee_num : postCallData?.cid_num;

            socket.emit("edit_call_fs", {
                b_uuid,
                uuid,
                projects: {
                    [activeProject]: {
                        call_reason: reasonNumber,
                        call_result: resultNumber,
                        comment,
                        base_fields: values[activeProject],
                    },
                },
                post_time,
                session_key: sessionKey,
                worker,
                phone: phoneNumber
            });
            // socket.emit('edit_call_fs', {
            //     b_uuid: call?.special_key_call ,
            //     uuid: call?.special_key_conn ,
            //     // call_id: call?.id,
            //     project_name: call?.project_name,
            //     call_reason: reasonNumber,
            //     call_result: resultNumber,
            //     comment,
            //     session_key: sessionKey,
            //     worker,
            //     base_fields: baseFieldValues,
            //     // reason_text: reasonText,
            //     // result_text: resultText
            // });

            socket.emit("change_state_fs", {
                sip_login: sipLogin,
                worker,
                session_key: sessionKey,

                state: "waiting",
                reason: "manual_return",
                page: "online",
            });
            setIsLoading(true)
            socket.emit("get_fs_report", {
                worker,
                session_key: sessionKey,
                sip_login: sipLogin,
                level: 0,
            });
            setIsParams(true)
            setPostActive(false);
            setPostSeconds(POST_LIMIT);
            onClose();
        }
    };


    const [callDuration, setCallDuration] = useState(0);
    const [secondCallDuration, setSecondCallDuration] = useState(0)

    useEffect(() => {
        let interval: NodeJS.Timeout | null = null;
        if (hasActiveCall) {
            interval = setInterval(() => {
                // const startTimeStr = activeCalls[0].b_created;
                const startTimeStr = activeCalls[0].created;
                if (startTimeStr) {
                    const startMs = new Date(startTimeStr).getTime();
                    const now = Date.now();
                    const diffSec = Math.floor((now - startMs) / 1000);
                    setCallDuration(diffSec);
                }
                if (activeCalls.length > 1) {
                    const startTimeStr = activeCalls[1].created;
                    if (startTimeStr) {
                        const startMs = new Date(startTimeStr).getTime();
                        const now = Date.now();
                        const diffSec = Math.floor((now - startMs) / 1000);
                        setSecondCallDuration(diffSec);
                    }
                }
            }, 1000);
        } else {
            setCallDuration(0);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [hasActiveCall, activeCalls]);

    function formatDuration(sec: number): string {
        const minutes = Math.floor(sec / 60);
        const seconds = sec % 60;
        return `${minutes} мин. ${seconds} сек.`;
    }

    function extractSuffix(input?: string | null): string {
        return input?.split(' ').pop() ?? '';
    }

    const iconCol = call?.total_direction === 'outbound' ? '#f26666' : '#7cd420';

    const callFromCard = (project_name: string, phone: string, phoneId?: number) => {
        manualCallRef.current = true;
        startModulesRanRef.current = true

        if (phoneId) {
            if (setPhoneID) {
                setPhoneID(phoneId);
            }
        }

        socket.emit('call', {
            phone,
            project_name,
            session_key: sessionKey,
            sip_login: sipLogin,
            worker
        });
    };

    const getGroupProjects = (
        openedPhones: Array<{ phone: string; project: string }>
    ): string[] => {
        if (!openedPhones?.length) return [];
        // Извлекаем все project и убираем дубликаты
        const projectsSet = new Set(openedPhones.map(p => p.project));
        return Array.from(projectsSet);
    };

    // Группируем телефоны: phoneGroups
    const phoneGroups = useMemo(() => {
        const map = new Map<
            string,
            {
                phone: string;
                entries: Array<{
                    id: number;
                    project: string;
                    contact_info: any;
                }>;
            }
        >();

        (openedPhones || []).forEach(ph => {
            if (!map.has(ph.phone)) {
                map.set(ph.phone, { phone: ph.phone, entries: [] });
            }

            map.get(ph.phone)!.entries.push({
                id: ph.id, // добавляем id
                project: ph.project,
                contact_info: ph.contact_info || {},
            });
        });

        return Array.from(map.values());
    }, [openedPhones]);

    useEffect(() => console.log("phoneGroups: ", phoneGroups),[phoneGroups])
// Строим карту вариантов для каждого поля
    const contactInfoVariants = useMemo(() => {
        const result: Record<string, Set<string>> = {};
        phoneGroups.forEach(group => {
            group.entries.forEach(entry => {
                Object.entries(entry.contact_info || {}).forEach(([fieldId, value]) => {
                    if (!result[fieldId]) result[fieldId] = new Set();
                    result[fieldId].add(String(value));
                });
            });
        });
        return result;
    }, [phoneGroups]);


    const handleSetTusk = async () => {
        if ((!selectedPreset?.preset.group_by || !openedPhones?.length)) return;

        const groupedByProject: Record<string, typeof openedPhones> = {};
        for (const phone of openedPhones) {
            const proj = phone.project || "unknown";
            if (!groupedByProject[proj]) groupedByProject[proj] = [];
            groupedByProject[proj].push(phone);
        }
        try {
            const requests = Object.entries(groupedByProject).map(([project_name, phones]) => {
                const sample = phones[0];
                const filter_by: Record<string, string> = {};

                selectedPreset.preset.group_by.forEach(groupField => {
                    if (sample && groupField in sample) {
                        filter_by[groupField] = sample[groupField];
                    }
                });

                if (!Object.keys(filter_by).length) return null;

                return axios.put('/api/v1/phones/update', {
                    glagol_parent: glagolParent,
                    project_name,
                    filter_by,
                    update: {
                        manager: sipLogin
                    }
                });
            }).filter(Boolean);

            await Promise.all(requests);

            Swal.fire({
                icon: 'success',
                title: 'Группа закреплена',
                text: 'Выбранная группа успешно закреплена за оператором.'
            });
        } catch (err) {
            console.error('Ошибка при закреплении группы:', err);
            // Уведомление об ошибке (опционально)
            Swal.fire({
                icon: 'error',
                title: 'Ошибка',
                text: 'Произошла ошибка при закреплении группы.'
            });
        }
    };
    const renderContactInfoSelector = (
        phone: string,
        fieldId: string,
        entries: Array<{ project: string; contact_info: Record<string, any> }> = []
    ) => {
        const variants = (entries || [])
            .map(e => ({
                project: e.project,
                value: e.contact_info[fieldId] || '',
            }))
            .filter(v => v.value !== '');

        const unique = Array.from(new Set(variants.map(v => v.value)));
        if (unique.length <= 1) return null;

        return (
            <select
                style={{ marginBottom: 4 }}
                onChange={e => {
                    const val = e.target.value;
                    selectedProjects.forEach(proj => {
                        setValues(prev => ({
                            ...prev,
                            [proj]: {
                                ...prev[proj],
                                [fieldId]: val
                            }
                        }));
                    });
                }}
            >
                <option value="">Выберите значение</option>
                {variants.map((v, idx) => (
                    <option key={idx} value={v.value}>
                        {v.value} ({findNameProject(v.project)})
                    </option>
                ))}
            </select>
        );
    };

    const manualCallRef = useRef<boolean>(false)
    const handleCloseCard = () => {
        // ровно то же поведение, что у твоих крестиков в карточках
        setOpenedPhones?.([]);
        setOpenedGroup?.([]);
        setPhonesData?.([]);
        startModulesRanRef.current = false;

        setActiveProjectName?.('');

        if (momoProjectRepo && momoProjectRepo.current && setTuskMode) {
            setTuskMode(false);
        }

        // на случай выбранного звонка
        setSelectedCall(null);

        normalizeUrl();
        onClose();
    };

    useEffect(() => console.log("phoneGroups: ", phoneGroups),[phoneGroups])
    const renderGroupPhones = () => {
        if (!phoneGroups.length) return null;

        return (
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                <button
                    onClick={() => {
                        setOpenedPhones?.([]);
                        setOpenedGroup?.([]);
                        setPhonesData?.([]);
                        startModulesRanRef.current = false;
                        if (setActiveProjectName) {
                            setActiveProjectName("")
                        }
                        if (momoProjectRepo && momoProjectRepo.current && setTuskMode) {
                            setTuskMode(false);
                            onClose();
                        }
                        normalizeUrl();
                    }}
                    className="btn btn-outline-light text text-dark"
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
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

                {/* Первая карточка: свободный ввод номера */}
                <div
                    key="manual-entry"
                    style={{
                        border: '1px solid #ddd',
                        borderRadius: 6,
                        padding: 8,
                        minWidth: 180,
                        maxWidth: 240,
                        flex: '0 1 auto',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                        background: '#fff',
                    }}
                >
                    <input
                        type="text"
                        placeholder="Введите номер..."
                        value={manualNumber}
                        onChange={e => {
                            const onlyDigits = e.target.value.replace(/\D/g, '');
                            setManualNumber(onlyDigits);
                        }}
                        className="form-control mb-2"
                        inputMode="numeric"
                        pattern="\d*"
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {groupProjects.map(proj => {
                            const label = findNameProject(proj);
                            return (
                                <button
                                    key={`manual-${proj}`}
                                    className="btn btn-sm btn-outline-success"
                                    onClick={() => {
                                        if (manualNumber.trim()) callFromCard(proj, manualNumber.trim());
                                    }}
                                    title={`Вызов ${label}`}
                                    style={{
                                        marginRight: 4,
                                        marginBottom: 4,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        overflow: 'hidden',
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                        verticalAlign: 'bottom',
                                    }}
                                >
                                    <span>Вызов&nbsp;</span>
                                    <span
                                        style={{
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis',
                                            minWidth: 0,
                                        }}
                                    >
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {phoneGroups.map(group => {
                    const firstId = group.entries[0]?.id;

                    return (
                        <div
                            key={group.phone}
                            style={{
                                border: '1px solid #ddd',
                                borderRadius: 6,
                                padding: 8,
                                minWidth: 180,
                                maxWidth: 240,
                                flex: '0 1 auto',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                background: '#fff',
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 14,
                                    fontWeight: 600,
                                    marginBottom: 6,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                }}
                            >
                                {group.phone}
                            </div>
                            {Array.from(new Set(group.entries.map(e => e.project))).map(proj => {
                                const label = findNameProject(proj);
                                return (
                                    <button
                                        key={proj}
                                        className="btn btn-sm btn-outline-success"
                                        style={{
                                            marginRight: 4,
                                            marginBottom: 4,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            maxWidth: 200,
                                            overflow: 'hidden',
                                            whiteSpace: 'nowrap',
                                            textOverflow: 'ellipsis',
                                            verticalAlign: 'bottom',
                                        }}
                                        title={`Вызов ${label}`}
                                        onClick={() => callFromCard(proj, group.phone, firstId)}
                                    >
                                        <span>Вызов&nbsp;</span>
                                        <span
                                            style={{
                                                overflow: 'hidden',
                                                whiteSpace: 'nowrap',
                                                textOverflow: 'ellipsis',
                                                minWidth: 0,
                                            }}
                                        >
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}

                        </div>
                    );
                })}
            </div>
        );
    };


    const renderActiveCallHeader = (activeCall: ActiveCall) => {
        const mainActiveCall = activeCall || postCallData
        const isHeld = (mainActiveCall.callstate === 'HELD' || mainActiveCall.b_callstate === 'HELD');
        const iconName = isHeld ? 'play_arrow' : 'pause';
        const iconColor = mainActiveCall.direction === 'outbound' ?  '#f26666' : '#7cd420';
        return (
            <div className="mb-3">
                <div className="d-flex">
                    <button className="btn btn-outline-warning mr-2" onClick={() => handleHold(mainActiveCall)}>
                        <span className="material-icons">{iconName}</span>
                    </button>
                    <button className="btn btn-outline-danger mr-2" onClick={() => handleStop(mainActiveCall, 1)}>
                        <span className="material-icons">call_end</span>
                    </button>
                    {activeCalls.length > 1 &&
                        <button className="btn btn-outline-success" onClick={handleRedirect}>
                            Объединить вызовы
                        </button>
                    }
                </div>
                <div className="d-flex align-items-center mt-2">
                  <span className="material-icons" style={{ color: iconColor }}>
                    {mainActiveCall.direction === 'outbound' ? 'logout' : 'login'}
                  </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                        {mainActiveCall.direction === 'outbound' && mainActiveCall.application !== 'uuid_bridge'?
                            // mainActiveCall.callee_num ||
                            extractSuffix(mainActiveCall.b_callee_num) : extractSuffix(mainActiveCall.cid_num)}
                        {' | '}
                        {new Date(mainActiveCall.created).toLocaleString()}
                    </strong>
                </div>
                <div className="mt-2 mb-2">
                    <strong style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: isHeld ? "#cba200" : "#0BB918"
                    }}
                    >
                        {isHeld ? 'На удержании' : 'Вызов активен'}:</strong> {formatDuration(callDuration)}
                </div>
                {!tuskMode && <strong style={{whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16}}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </strong>}
            </div>
        );
    };
    useEffect(() => console.log("activeProject: ", activeProject),[activeProject])
    const renderPostCallHeader = () => {

        const iconColor = postCallData?.direction === 'outbound' ? '#f26666' : '#7cd420';
        const iconName = postCallData?.direction === 'outbound' ? 'logout' : 'login';
        const phoneNumber = postCallData?.direction === 'outbound' && postCallData?.application !== 'uuid_bridge' ? postCallData.b_callee_num : postCallData?.cid_num;
        const startDate = new Date(postCallData?.b_created || "0").toLocaleString();

        return (
            <div className="mb-3">

                <div className="d-flex align-items-center">
                    <span className="material-icons" style={{ color: iconColor }}>{iconName}</span>

                    <strong className="ml-2" style={{ whiteSpace: 'nowrap', fontWeight: 600, fontSize: 16 }}>{phoneNumber} | {startDate}</strong>
                </div>
                {!tuskMode && <label className="mt-3"
                                     style={{whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16}}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </label>}
            </div>
        );
    };

    const renderSecondCall = () => {
        if (activeCalls.length > 1 && Object.keys(activeCalls[1]).length > 0 && activeCalls[1].application) {
            const sc = activeCalls[1];
            const isHeld = sc.callstate === 'HELD' || sc.b_callstate === 'HELD';
            const iconName = isHeld ? 'play_arrow' : 'pause';
            const iconColor = sc.direction === 'outbound' ? '#f26666' : '#7cd420';
            // Вычисляем длительность второго звонка (в секундах)
            // const secondCallDuration = Math.floor(
            //     (Date.now() - new Date(sc.b_created).getTime()) / 1000
            // );

            return (
                <div className="mt-3">
                    <div className="card col ml-3 w-100" style={{ marginTop: '1rem' }}>
                        <div className="card-body" style={{ padding: '1rem' }}>
                            <div className="d-flex">
                                <button
                                    className="btn btn-outline-warning mr-2"
                                    onClick={() => handleHold(sc)}
                                >
                                    <span className="material-icons">{iconName}</span>
                                </button>
                                <button
                                    className="btn btn-outline-danger mr-2"
                                    onClick={() => handleStop(sc, 2)}
                                >
                                    <span className="material-icons">call_end</span>
                                </button>
                            </div>
                            <div className="d-flex align-items-center mt-2">
                              <span
                                  className="material-icons"
                                  style={{ color: iconColor }}
                              >
                                {sc.direction === 'outbound' ? 'logout' : 'login'}
                              </span>
                                <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                                    {sc.direction === 'outbound' ? sc.callee_num  : extractSuffix(sc.cid_num)}
                                    {' | '}
                                    {new Date(sc.created).toLocaleString()}
                                </strong>
                            </div>
                            <div className="mt-2 mb-2">
                                <strong style={{ fontSize: 16, fontWeight: 400 }}>
                                    {isHeld ? 'На удержании' : 'Вызов активен'}:
                                </strong>{' '}
                                {formatDuration(secondCallDuration)}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }
        return null;
    };

    useEffect(() => {
        const handleSocketError = (msg: any) => {
            if (msg && typeof msg === 'object' && 'error' in msg) {
                if (swalRef.current) {
                    Swal.close();
                    swalRef.current = null;
                }

                Swal.fire({
                    icon: 'error',
                    title: 'Ошибка при запуске модуля',
                    text: msg.error,
                    confirmButtonText: 'Ок'
                });

                setRunningModulesCount(0);
            }
        };

        socket.on('error', handleSocketError);

        return () => {
            socket.off('error', handleSocketError);
        };
    }, []);

    const commonModules = useMemo(() => {
        if (!monoModules) return [];

        const entries = Object.entries(monoModules);
        if (entries.length === 0) return [];

        const moduleMap: Record<string, { count: number, sample: ModuleData }> = {};

        for (const [_, mods] of entries) {
            const uniqueFilenames = new Set<string>();
            for (const mod of mods) {
                if (!mod.common_code) continue;
                if (!mod.start_modes?.includes('manual')) continue;
                if (uniqueFilenames.has(mod.filename)) continue;

                uniqueFilenames.add(mod.filename);
                if (!moduleMap[mod.filename]) {
                    moduleMap[mod.filename] = { count: 1, sample: mod };
                } else {
                    moduleMap[mod.filename].count += 1;
                }
            }
        }

        const totalProjects = entries.length;

        return Object.values(moduleMap)
            .filter(({ count }) => count === totalProjects)
            .map(({ sample }) => sample);
    }, [monoModules]);

    const projectModules = useMemo(() => {
        if (!monoModules) return {};

        const commons = new Set(commonModules.map(mod => mod.filename));

        const result: Record<string, ModuleData[]> = {};
        for (const [project, mods] of Object.entries(monoModules)) {
            result[project] = mods.filter(mod => !commons.has(mod.filename));
        }

        return result;
    }, [monoModules, commonModules]);
    const renderModules = () => {
        // if ((!hasActiveCall && !postActive) || (!openedPhones?.length || !call)) {
        //     return null;
        // }

        // если совсем нет модулей
        const allCount =
            // tuskMode ?
                Object.values(monoModules || {}).flat().length
        //     : modules.length;
        if (allCount === 0) {
            return null;
        }

        // обычный режим — только ручные из modules
        if (!tuskMode) {
            return (
                <div style={{ display: "flex", gap: 8, margin: "0 0 10px 0", alignItems: "center" }}>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>Модули:</div>
                    {manualModules.map((mod, idx) => (
                        <button
                            key={idx}
                            onClick={() => {
                                handleModuleRun(mod, false, undefined, { manual: true });
                                setRunningModulesCount(1)
                            }}
                            className="btn btn-outline-success"
                        >
                            {mod.button_name || mod.filename}
                        </button>
                    ))}
                </div>
            );
        }

        // tuskMode — ручные общие + ручные проектные
        if (monoModules) {
            return (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "0 0 10px 0" }}>
                    {/* ручные общие модули */}
                    {commonModules
                        .map((mod, idx) => (
                            <button
                                key={`common-${mod.filename}-${idx}`}
                                onClick={() => {
                                    handleModuleRun(mod, false, undefined, { manual: true });
                                    setRunningModulesCount(1)
                                }}
                                className="btn btn-outline-dark"
                            >
                                {mod.button_name || mod.filename}
                            </button>
                        ))
                    }

                    {/* ручные проектные модули */}
                    {Object.entries(projectModules).map(([proj, mods]) =>
                        mods
                            .filter(mod => mod.start_modes?.includes("manual"))
                            .map((mod, idx) => (
                                <button
                                    key={`${proj}-${mod.filename}-${idx}`}
                                    onClick={() => {
                                        handleModuleRun(mod, false, proj, { manual: true });
                                        setRunningModulesCount(1)
                                    }}
                                    className="btn"
                                    style={{
                                        border: `1px solid ${projectColors[proj]}`,
                                        color: projectColors[proj],
                                    }}
                                >
                                    {mod.button_name || mod.filename}
                                </button>
                            ))
                    )}
                </div>
            );
        }

        return null;
    };

    const getTzOffsetMinutes = () => -new Date().getTimezoneOffset();
    const handleNextTask = () => {
        if (!projectPoolForCall || projectPoolForCall.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Нет проектов для обзвона',
                text: 'В пуле нет активных исходящих проектов.',
            });
            return;
        }

        socket.emit('outbound_call_get', {
            assign: true,
            batch: 1,
            // break: true,
            worker,
            interface: "glagol",
            sip_login: sipLogin,
            session_key: sessionKey,
            projects_pool: projectPoolForCall,
            start_type: "auto",
            tz_offset: getTzOffsetMinutes(),
        });
    };

    const renderActionDock = () => {
        // показываем док, если вообще есть что нажимать
        const manualCommon = commonModules.filter(m => m.start_modes?.includes('manual'));
        const manualByProject = Object.fromEntries(
            Object.entries(projectModules).map(([proj, mods]) => [
                proj,
                mods.filter(m => m.start_modes?.includes('manual')),
            ])
        );
        const hasAnyProjectManual = Object.values(manualByProject).some(arr => arr.length > 0);
        const shouldShow =
            manualModules.length > 0 || manualCommon.length > 0 || hasAnyProjectManual || postActive;

        if (!shouldShow) return null;

        const openDock = () => {
            if (closeDockTimerRef.current) {
                window.clearTimeout(closeDockTimerRef.current);
                closeDockTimerRef.current = null;
            }
            setDockOpen(true);
        };

        const delayedClose = (ms = 180) => {
            if (closeDockTimerRef.current) {
                window.clearTimeout(closeDockTimerRef.current);
            }
            closeDockTimerRef.current = window.setTimeout(() => {
                setDockOpen(false);
                closeDockTimerRef.current = null;
            }, ms);
        };

        // стили
        const wrap: React.CSSProperties = {
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            pointerEvents: 'none', // кликабельно только то, что внутри с 'auto'
        };
        const fab: React.CSSProperties = {
            pointerEvents: 'auto',
            width: 52,
            height: 52,
            borderRadius: 26,
            boxShadow: '0 8px 20px rgba(0,0,0,.2)',
            background: '#111827',
            color: '#fff',
            border: '1px solid rgba(255,255,255,.12)',
            display: 'grid',
            placeItems: 'center',
            cursor: 'pointer',
            transition: 'transform .15s ease',
        };
        const panel: React.CSSProperties = {
            pointerEvents: dockOpen ? 'auto' : 'none', // <-- ключевая правка
            width: 360,
            maxWidth: '90vw',
            maxHeight: '60vh',
            overflow: 'auto',
            marginBottom: 8,
            borderRadius: 12,
            background: '#fff',
            border: '1px solid rgba(0,0,0,.08)',
            boxShadow: '0 12px 36px rgba(0,0,0,.18)',
            transform: `translateY(${dockOpen ? 0 : 8}px)`,
            opacity: dockOpen ? 1 : 0,
            transition: 'opacity .12s ease, transform .12s ease',
            padding: 10,
            willChange: 'opacity, transform',
        };
        const header: React.CSSProperties = {
            fontWeight: 700,
            fontSize: 14,
            color: '#111827',
            margin: '4px 0 8px',
        };
        const sectionTitle: React.CSSProperties = {
            fontWeight: 600,
            fontSize: 12,
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            margin: '10px 0 6px',
        };
        const grid: React.CSSProperties = {
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
            gap: 6,
        };
        const chip: React.CSSProperties = {
            fontSize: 12,
            padding: '6px 10px',
            borderRadius: 10,
            background: '#111827',
            color: '#fff',
            border: '1px solid rgba(255,255,255,.12)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        };

        return (
            <div style={wrap} aria-live="polite">
                {/* Панель с кнопками */}
                <div
                    id="actions-dock-panel"
                    style={panel}
                    role="menu"
                    aria-hidden={!dockOpen}
                    onMouseEnter={openDock}
                    onMouseLeave={() => delayedClose()}
                >
                    <div style={header}>Действия</div>

                    {/* Save / Save & Return */}
                    <div style={grid}>
                        <button
                            style={{
                                ...chip,
                                background: '#fff',
                                color: '#ef4444',
                                border: '1px solid #ef4444',
                            }}
                            onClick={() => {
                                setDockOpen(false);
                                handleCloseCard();
                            }}
                            title="Закрыть карточку"
                        >
                            Закрыть карточку
                        </button>

                        {postActive && (
                            <button
                                style={chip}
                                onClick={() => {
                                    if (postActive) handlePostSave();
                                    else handleSave();
                                }}
                                title={postActive ? 'Сохранить и вернуться на линию' : 'Сохранить'}
                            >
                                {postActive ? 'Сохранить и вернуться' : 'Сохранить'}
                            </button>
                        )}
                        <button
                            style={{
                                ...chip,
                                background: '#fff',
                                color: '#2563eb',
                                border: '1px solid #2563eb',
                            }}
                            onClick={() => {
                                handleNextTask();
                                delayedClose();
                            }}
                            title="Получить следующую задачу"
                            // если хочешь, можно блокировать при активном звонке:
                            // disabled={hasActiveCall}
                        >
                            <span
                                className="material-icons"
                                style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}
                            >
                                skip_next
                            </span>
                            <span>Следующая задача</span>
                        </button>
                    </div>

                    {/* Интеграции (общие) */}
                    {(manualCommon.length > 0 || manualModules.length > 0) && (
                        <>
                            <div style={sectionTitle}>Интеграции</div>
                            <div style={grid}>
                                {(tuskMode ? manualCommon : manualModules).map((mod) => (
                                    <button
                                        key={`dock-common-${mod.filename}`}
                                        style={chip}
                                        onClick={() => {
                                            handleModuleRun(mod, false, undefined, { manual: true });
                                            setRunningModulesCount(1);
                                        }}
                                        title={mod.filename}
                                    >
                                        {mod.button_name || mod.filename}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Интеграции по проектам (только в tuskMode) */}
                    {tuskMode &&
                        Object.entries(manualByProject).map(([proj, mods]) =>
                                mods.length ? (
                                    <div key={`dock-proj-${proj}`} style={{ marginTop: 8 }}>
                                        <div
                                            style={{
                                                ...sectionTitle,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}
                                            title={proj}
                                        >
                  <span
                      style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: projectColors[proj] || '#6b7280',
                          border: '1px solid rgba(0,0,0,.12)',
                      }}
                  />
                                            {findNameProject(proj)}
                                        </div>
                                        <div style={grid}>
                                            {mods.map((mod) => (
                                                <button
                                                    key={`dock-${proj}-${mod.filename}`}
                                                    style={{
                                                        ...chip,
                                                        background: '#fff',
                                                        color: projectColors[proj] || '#111827',
                                                        border: `1px solid ${projectColors[proj] || '#e5e7eb'}`,
                                                    }}
                                                    onClick={() => {
                                                        handleModuleRun(mod, false, proj, { manual: true });
                                                        setRunningModulesCount(1);
                                                    }}
                                                    title={`${findNameProject(proj)} • ${mod.filename}`}
                                                >
                                                    {mod.button_name || mod.filename}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null
                        )}
                </div>

                {/* Кнопка-значок */}
                <button
                    aria-label="Действия"
                    aria-expanded={dockOpen}
                    aria-controls="actions-dock-panel"
                    style={{ ...fab, transform: dockOpen ? 'scale(1.04)' : 'scale(1)' }}
                    onClick={() => setDockOpen(v => !v)}
                    onMouseEnter={openDock}
                    onMouseLeave={() => delayedClose()}
                    onFocus={openDock}
                    onBlur={() => delayedClose()}
                    onTouchStart={(e) => {
                        e.preventDefault();
                        setDockOpen(v => !v);
                    }}
                    title="Действия"
                >
                    <span className="material-icons">bolt</span>
                </button>
            </div>
        );
    };

    const phoneProjectOptions = useMemo(() => {
        const result: Array<{ phone: string; project: string }> = [];
        const seen = new Set<string>();

        (openedPhones || []).forEach(ph => {
            const key = `${ph.phone}|${ph.project}`;
            if (!seen.has(key)) {
                seen.add(key);
                result.push({ phone: ph.phone, project: ph.project });
            }
        });

        return result;
    }, [openedPhones]);

    const renderSelectedCallHeader = () => {
        return(
            <div>
                <div className="d-flex align-items-center my-2">
                    <span className="material-icons" style={{ color: iconCol }}>
                        {call?.total_direction === 'outbound' ? 'logout' : 'login'}
                    </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                        {call?.total_direction === 'outbound' ? call?.b_line_num || call.caller_id || '—' : call?.a_line_num || call?.destination_id || call?.caller_id || '—'}
                        {' | '}
                        {new Date(call?.datetime_start || "0").toLocaleString()}
                    </strong>
                </div>
                <button
                    onClick={() => {
                        setOpenedPhones?.([]);
                        setOpenedGroup?.([]);
                        setPhonesData?.([]);
                        startModulesRanRef.current = false;
                        if (setActiveProjectName) {
                            setActiveProjectName("")
                        }
                        if (momoProjectRepo && momoProjectRepo.current && setTuskMode) {
                            setTuskMode(false);
                            onClose();
                        }
                        normalizeUrl();
                        setSelectedCall(null)
                    }}
                    className="btn btn-outline-light text text-dark"
                    style={{
                        position: 'absolute',
                        top: 20,
                        right: 20,
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
                {!hasActiveCall && call?.record_name && (
                    <div className="mb-3">
                        <audio controls style={{ width: '100%' }}>
                            <source
                                src={`https://my.glagol.ai/get_cc_audio/${fsServer}/${call.record_name}`}
                                type="audio/mpeg"
                            />
                            Ваш браузер не поддерживает аудиоплеер
                        </audio>
                    </div>
                )}
                {((hasActiveCall || postActive) || !hideReportFields) && (
                    <label
                        className="mb-2"
                        style={{
                            whiteSpace: 'nowrap',
                            marginTop: "4px",
                            fontWeight: 600,
                            fontSize: 16
                        }}
                    >
                        Проект:&nbsp;
                        <span>
                            {findNameProject(call?.project_name || "")}
                        </span>
                    </label>
                )}
            </div>
        )
    }
// в начале компонента
// map: fieldId → массив всех найденных { phone, project, value }
    const contactInfoOptions = useMemo(() => {
        const result: Record<string, Array<{ phone: string; project: string; value: string }>> = {};
        (openedPhones || []).forEach(ph => {
            Object.entries(ph.contact_info || {}).forEach(([fieldId, value]) => {
                if (!result[fieldId]) result[fieldId] = [];
                result[fieldId].push({
                    phone: ph.phone,
                    project: ph.project,
                    value: String(value),
                });
            });
        });
        return result;
    }, [openedPhones]);
    useEffect(() => console.log("contactInfoOptions: ", contactInfoOptions),[contactInfoOptions])
// вот этот эффект надо добавить **после** объявления contactInfoOptions и перед return(...)
    useEffect(() => {
        // 1) сброс
        // setValues({});

        // если ничего не открыто — дальше не инициализируем
        if (!openedPhones?.length) return;

        // 2) заполняем заново
        const next: GroupFieldValues = {};
        // у нас selectedProjects уже содержит нужный набор проектов
        selectedProjects.forEach(proj => {
            next[proj] = {};
        });

        // для каждого поля смотрим, есть ли ровно одна уникальная value
        Object.entries(contactInfoOptions).forEach(([fieldId, opts]) => {
            const uniq = Array.from(new Set(opts.map(o => o.value).filter(v => v !== '')));
            if (uniq.length === 1) {
                // единственный вариант — распихиваем по всем проектам
                selectedProjects.forEach(proj => {
                    next[proj][fieldId] = uniq[0];
                });
            }
        });
        if (!manualCallRef.current) {
            setValues(next);
        }
    }, [openedPhones, contactInfoOptions, selectedProjects]);

    useEffect(() => {
        if (!openedPhones?.length) return;

        // значения считаем по ВСЕМ полям
        const nextValues: GroupFieldValues = {};
        selectedProjects.forEach(proj => { nextValues[proj] = { ...(values[proj] || {}) }; });

        // выбранные опции для дропдаунов — только для видимых полей
        const nextSelected: Record<string, string> = {};

        mergedFieldsAll.forEach(f => {
            const { showDropdown, distinctValueSets, combos } =
                getFieldPhoneOptions(f, contactInfoOptions);

            f.projects.forEach(proj => {
                if (!nextValues[proj]) return;
                const fieldId = f.fieldIds[proj];

                if (!showDropdown) {
                    if (!nextValues[proj][fieldId] && distinctValueSets[0]) {
                        nextValues[proj][fieldId] = distinctValueSets[0];
                    }
                } else if (combos.length > 0 && !nextValues[proj][fieldId]) {
                    nextValues[proj][fieldId] = combos[0].values.join(", ");
                    // фиксируем selected только если поле видно в UI
                    if (mergedFields.some(u => u.id === f.id)) {
                        const uiKey = f.projects.length > 1 ? f.id : fieldId;
                        nextSelected[uiKey] = combos[0].id;
                    }
                }
            });
        });

        setValues(cur => {
            const merged: GroupFieldValues = { ...cur };
            Object.keys(nextValues).forEach(p => {
                merged[p] = { ...(cur[p] || {}), ...nextValues[p] };
            });
            return merged;
        });
        setSelectedPhoneByField(nextSelected);
    }, [contactInfoOptions, selectedProjects, openedPhones, mergedFieldsAll, mergedFields]);

    // Делаем ТОЛЬКО если у нас уже есть openedPhones и выбранные проекты
// вверху компонента, рядом с другими useEffects
    useEffect(() => {
        // если нет телефонов – ничего не делаем
        if (!openedPhones?.length) return;

        // клонируем текущее состояние, чтобы не затирать старые данные
        const nextValues: GroupFieldValues = { ...values };

        // пройдём по всем полям, для которых есть contact_info
        Object.entries(contactInfoOptions).forEach(([fieldId, opts]) => {
            // отфильтруем только те варианты, у которых value непустая строка
            const vals = opts.map(o => o.value).filter(v => v !== '');
            const uniq = Array.from(new Set(vals));

            // если для этого fieldId ровно 1 вариант – подставляем его во все проекты
            if (uniq.length === 1) {
                const single = uniq[0];
                selectedProjects.forEach(proj => {
                    // инициализируем подпроект, если ещё нет
                    if (!nextValues[proj]) nextValues[proj] = {};
                    nextValues[proj][fieldId] = single;
                });
            }
        });

        setValues(nextValues);
    }, [openedPhones, contactInfoOptions, selectedProjects]);

//     const availableTabs = useMemo(() => {
//         const set = new Set<string>();
//         for (const f of mergedFields) {
//             for (const proj of f.projects) {
//                 if (!selectedProjects.includes(proj)) continue;
//                 const tk = f.tabsByProject?.[proj];
//                 if (tk != null && String(tk).trim() !== '') set.add(String(tk));
//             }
//         }
//         const arr = Array.from(set).sort(sortTabKeys);
//         if (hasFiles) arr.push(TAB_FILES);
//         return arr;
//     }, [mergedFields, selectedProjects, hasFiles]);

// TABS: корректно переключаемся, учитывая «Остатки»
    useEffect(() => {
        const defaultTab = computeDefaultTab();

        // 1) текущая вкладка исчезла (и это не Остатки/Файлы) — идём на дефолт
        if (activeTab !== TAB_ALL && activeTab !== TAB_FILES && !availableTabs.includes(activeTab)) {
            setActiveTab(defaultTab);
            return;
        }

        // 2) были «Остатки», но их больше нет — идём на дефолт
        if (activeTab === TAB_ALL && !hasLeftovers) {
            setActiveTab(defaultTab);
            return;
        }

        // 3) сейчас открыты ФАЙЛЫ, но появилась «левая» вкладка — переключаемся,
        //    НО только если пользователь сам ещё не выбирал вкладку.
        if (!userPickedTab.current && activeTab === TAB_FILES && defaultTab !== TAB_FILES) {
            setActiveTab(defaultTab);
        }
    }, [availableTabs, hasLeftovers, hasFiles, activeTab]);

    const tabsToRender = useMemo(() => {
        const arr = [...availableTabs];
        if (hasLeftovers) arr.unshift(TAB_ALL); // «Остатки» только если есть что показать
        return arr;
    }, [availableTabs, hasLeftovers]);
    const tabLabel = (key: string) => key === TAB_ALL ? TAB_ALL_LABEL : key === TAB_FILES ? TAB_FILES_LABEL : key;

// TABS: проверка, входит ли поле в активную вкладку (учитывая проект)
// TABS: проверка, входит ли поле в активную вкладку (учитывая проект)
    const fieldInActiveTab = (f: MergedField, proj?: string) => {
        if (activeTab === TAB_FILES) return false;

        // «Остатки»: показываем только поля без вкладки
        if (activeTab === TAB_ALL) {
            if (proj) return !fieldHasTabForProject(f, proj);
            return isFieldLeftover(f);
        }

        // Обычные вкладки — как раньше
        if (proj) {
            const tk = f.tabsByProject?.[proj] ?? null;
            return tk != null && String(tk) === activeTab;
        }
        return f.projects.some(p =>
            selectedProjects.includes(p) &&
            f.tabsByProject?.[p] != null &&
            String(f.tabsByProject[p]!) === activeTab
        );
    };

// TABS: отфильтрованный список полей
    const filteredMergedFields = useMemo(() => {
        if (activeTab === TAB_FILES) return [];
        if (activeTab === TAB_ALL) return mergedFields.filter(isFieldLeftover);
        return mergedFields.filter(f => fieldInActiveTab(f));
    }, [mergedFields, activeTab, selectedProjects]);

// ⬇️ И САМЫЕ ВАЖНЫЕ заменители старых вычислений:
    const commonFields = filteredMergedFields.filter(f => f.projects.length > 1);

    const uniqueFieldsByProject: Record<string, MergedField[]> = {};
    selectedProjects.forEach(proj => {
        uniqueFieldsByProject[proj] = filteredMergedFields
            .filter(f => f.projects.length === 1 && f.projects[0] === proj && fieldInActiveTab(f, proj));
    });

    const shouldShowMeta = tuskMode
        ? (hasActiveCall || postActive)
        : (hasActiveCall || postActive || !hideReportFields);

    const memoizedIds = useMemo(() => {
        return openedPhones?.map(p => p.id) || [];
    }, [openedPhones]);


    function getFieldPhoneOptions(
        f: MergedField,
        contactInfoOptions: Record<string, Array<{phone:string,project:string,value:string}>>
    ): {
        showDropdown: boolean;
        distinctValueSets: string[];
        combos: PhoneCombo[];
    } {
        // 1) забираем все тройки {phone,project,value}
        const items = f.projects.flatMap(proj => {
            const id = f.fieldIds[proj];
            return (contactInfoOptions[id] || [])
                .map(o => ({ phone: o.phone, project: o.project, value: o.value }))
                .filter(x => x.value);
        });

        // 2) группируем по телефону
        const byPhone: Record<string, { values: string[]; projects: string[] }> = {};
        items.forEach(({ phone, project, value }) => {
            if (!byPhone[phone]) {
                byPhone[phone] = { values: [], projects: [] };
            }
            byPhone[phone].values.push(value);
            byPhone[phone].projects.push(project);
        });

        // 3) собираем combos уже с projects
        const combos: PhoneCombo[] = Object.entries(byPhone).map(
            ([phone, { values, projects }]) => {
                const uniqVals = Array.from(new Set(values));
                const uniqProjs = Array.from(new Set(projects));
                return {
                    id: `${phone}|${uniqVals.join(',')}`,
                    phone,
                    values: uniqVals,
                    projects: uniqProjs
                };
            }
        );

        // 4) distinctValueSets
        const distinctValueSets = Array.from(
            new Set(combos.map(c => c.values.join(', ')))
        );

        return {
            showDropdown: distinctValueSets.length > 1,
            distinctValueSets,
            combos
        };
    }

    const sortedCallReasons = useMemo(() => {
        return [...callReasons].sort((a, b) => Number(a.id) - Number(b.id));
    }, [callReasons]);

    const sortedCallResults = useMemo(() => {
        return [...callResults].sort((a, b) => Number(a.id) - Number(b.id));
    }, [callResults]);

    return (
        <div style={{marginTop: 20}}>
            {/*{renderModules()}*/}
            <div className="col ml-2 pr-0 mr-0 mr-1">
                <div className="card col ml-0">
                    <div className="card-body">
                        {hasActiveCall && renderActiveCallHeader(activeCalls[0])}
                        {!hasActiveCall && postActive && renderPostCallHeader()}
                        {tuskMode && !hasActiveCall && !postActive && !isChating && renderGroupPhones()}

                        <div>
                            {!(tuskMode && !call ) && !hasActiveCall && !postActive && (
                                renderSelectedCallHeader()
                            )}


                        {/*{(tuskMode && (hasActiveCall || postActive)) && (*/}
                            {mergedFields.length > 0 && (

                                <div style={{ padding:1}}>
                                <div style={{ display: "flex", gap: 8 }}>
                                    {groupProjects
                                        .filter(proj => typeof proj === 'string' && proj.trim() !== '' && proj !== "0")
                                        .map(proj => {
                                            const selected = selectedProjects.includes(proj);
                                            return (
                                                <button
                                                    key={proj}
                                                    onClick={() => toggleProject(proj)}
                                                    disabled={selectedProjects.length === 1 && selectedProjects[0] === proj}
                                                    className={`${stylesButton.projectButton} ${selected ? stylesButton.active : ''}`}
                                                    style={{
                                                        color: selected ? '#fff' : projectColors[proj],
                                                        background: selected ? projectColors[proj] : 'transparent',
                                                        borderColor: projectColors[proj],
                                                        borderRadius: '0.75rem',
                                                    }}
                                                >
                                                    {findNameProject(proj)}
                                                </button>
                                            );
                                        })}
                                </div>
                                    {/* TABS: панель вкладок */}
                                    {tabsToRender.length > 0 && (
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                            {tabsToRender.map(tabKey => {
                                                const selected = activeTab === tabKey;
                                                return (
                                                    <button
                                                        key={tabKey}
                                                        onClick={() => selectTab(tabKey)}
                                                        className={`${stylesButton.projectButton} ${selected ? stylesButton.active : ''}`}
                                                        style={{
                                                            color: selected ? '#fff' : '#4b5563',
                                                            background: selected ? '#4b5563' : 'transparent',
                                                            borderColor: '#4b5563',
                                                            borderRadius: '0.75rem',
                                                        }}
                                                        title={tabKey === TAB_ALL ? 'Показать остатки (поля без вкладки)' : `Показать поля вкладки ${tabLabel(tabKey)}`}
                                                    >
                                                        {tabLabel(tabKey)}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {activeTab === TAB_FILES && (
                                        <div style={{ marginTop: 8, marginBottom: 12 }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                                                <button
                                                    className="btn btn-outline-secondary"
                                                    title="Прикрепить файлы"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={!hasAnyGuid}
                                                >
                                                    <span className="material-icons" style={{ verticalAlign: 'middle' }}>attach_file</span>
                                                </button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    multiple
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        if (e.target.files) void uploadFilesToAllGuids(e.target.files);
                                                        // сбрасываем, чтобы повторно можно было выбрать тот же файл
                                                        e.currentTarget.value = '';
                                                    }}
                                                />
                                            </div>

                                            <ContactFilesPanel
                                                contacts={(openedPhones || [])}
                                                serverFilesByGuid={serverFilesByGuid}
                                                alwaysOpen
                                            />
                                        </div>
                                    )}
                                    {commonFields.length > 0 && (
                                        <div style={{ marginTop: 8, marginBottom: 8 }}>
                                            <div style={{ border: `2px solid black`, borderRadius: 4, padding: 8 }}>
                                                {commonFields.map(f => {
                                                    const { showDropdown, combos } = getFieldPhoneOptions(f, contactInfoOptions);

                                                    const infoText = combos
                                                        .map(c => `${c.phone} (${c.projects.map(findNameProject).join(', ')}) → ${c.values.join(', ')}`)
                                                        .join("\n")
                                                    const initial = f.projects.reduce<string | undefined>((acc, proj) => {
                                                        const id = f.fieldIds[proj];
                                                        return acc ?? values[proj]?.[id];
                                                    }, undefined) ?? "";

                                                    return (
                                                        <div key={f.id} style={{ marginBottom: 16 }}>
                                                            {showDropdown && (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <label style={{ fontWeight: 500 }}>{`Контактная информация для ${f.label}`}</label>
                                                                        <abbr
                                                                            title={infoText}
                                                                            style={{
                                                                                textDecoration: 'none',
                                                                                cursor: 'help',
                                                                                color: '#6c757d',
                                                                                fontSize: '1rem',
                                                                                lineHeight: 1,
                                                                                marginBottom: 10
                                                                            }}
                                                                        >
                                                                            ℹ️
                                                                        </abbr>
                                                                    </div>
                                                                    <PhoneProjectSelect
                                                                        value={selectedPhoneByField[f.id] || ''}
                                                                        onChange={val => {
                                                                            setSelectedPhoneByField(cur => ({ ...cur, [f.id]: val }));
                                                                            const [, joinedValues] = val.split('|');
                                                                            setValues(cur => {
                                                                                const next = { ...cur };
                                                                                f.projects.forEach(proj => {
                                                                                    const fid = f.fieldIds[proj];
                                                                                    next[proj] = { ...next[proj], [fid]: joinedValues };
                                                                                });
                                                                                return next;
                                                                            });
                                                                            // ← onchange-триггеры
                                                                            f.projects.forEach(proj => {
                                                                                const fid = f.fieldIds[proj];
                                                                                triggerOnchangeModulesForField(proj, fid, f, joinedValues);
                                                                            });
                                                                        }}
                                                                        options={combos.map(c => ({
                                                                            id: c.id,
                                                                            name: c.values.join(', ')
                                                                        }))}
                                                                        placeholder="выберите вариант…"
                                                                    />
                                                                </div>
                                                            )}

                                                            <EditableFields
                                                                params={[{
                                                                    field_id: f.id,
                                                                    field_name: f.label,
                                                                    field_type: f.type,
                                                                    field_vals: f.values,
                                                                    editable: f.editable,
                                                                    must_have: false,
                                                                    project_name: ''
                                                                }]}
                                                                initialValues={{ [f.id]: initial }}
                                                                onChange={nv => {
                                                                    const v = nv[f.id] || '';
                                                                    setValues(cur => {
                                                                        const next = { ...cur };
                                                                        f.projects.forEach(proj => {
                                                                            const fid = f.fieldIds[proj];
                                                                            next[proj] = { ...next[proj], [fid]: v };
                                                                        });
                                                                        return next;
                                                                    });
                                                                    f.projects.forEach(proj => {
                                                                        const fid = f.fieldIds[proj];
                                                                        triggerOnchangeModulesForField(proj, fid, f, v);
                                                                    });
                                                                }}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ marginTop: 4, marginBottom: 4 }}>
                                        {selectedProjects.map(proj => {
                                            const fields = uniqueFieldsByProject[proj];
                                            if (!fields.length) return null;

                                            // Определяем валидные группы и их поля
                                            const validGroupIds = new Set(
                                                (group_instructions[proj]?.groups || []).map((g: any) => g.id)
                                            );
                                            const groupedFields = (group_instructions[proj]?.groups || [])
                                                .slice()
                                                .sort((a: any, b: any) => a.position - b.position)
                                                .map((group: any) => ({
                                                    group,
                                                    fields: fields
                                                        .filter(f => f.group_id === group.id && fieldInActiveTab(f, proj))
                                                        .sort((a, b) => (a.group_position ?? 0) - (b.group_position ?? 0)),
                                                }))
                                                .filter((gf: any) => gf.fields.length > 0);

                                            const orphanFields = fields.filter(
                                                f => (f.group_id == null || !validGroupIds.has(f.group_id)) && fieldInActiveTab(f, proj)
                                            );

                                            return (
                                                <div
                                                    key={proj}
                                                    style={{
                                                        border: `2px solid ${projectColors[proj]}`,
                                                        borderRadius: 4,
                                                        padding: 8,
                                                        marginBottom: 12,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: 'grid',
                                                            gridTemplateColumns: 'repeat(12, minmax(0,1fr))',
                                                            gap: '16px',
                                                            // alignItems: 'stretch',
                                                            marginBottom: 16,
                                                        }}
                                                    >
                                                        {groupedFields.map(({ group, fields }: { group:any, fields:any }) => {
                                                            const spanGroup = (group.width === 0.5 && openedPhones?.length && fullWidthCard) ? 6 : 12;

                                                            return (
                                                                <div
                                                                    key={group.id}
                                                                    style={{
                                                                        gridColumn: `span ${spanGroup}`,
                                                                        border: '1px solid #ccc',
                                                                        borderRadius: 4,
                                                                        padding: 8,
                                                                        display: 'grid',
                                                                        gridTemplateColumns: 'repeat(12, minmax(0,1fr))',
                                                                        alignItems: 'start',
                                                                        gap: '0 16px',
                                                                    }}
                                                                >
                                                                    <div style={{ gridColumn: '1 / -1', fontWeight: 600, marginBottom: 8 }}>
                                                                        {group.group_name}
                                                                    </div>

                                                                    {fields.map((f: MergedField) => {
                                                                        const fieldId = f.fieldIds[proj];
                                                                        const { showDropdown, distinctValueSets, combos } =
                                                                            getFieldPhoneOptions(f, contactInfoOptions);

                                                                        const infoText = combos
                                                                            .map(c => `${c.phone} (${c.projects.map(findNameProject).join(', ')}) → ${c.values.join(', ')}`)
                                                                            .join("\n")
                                                                        const current =
                                                                            values[proj]?.[fieldId] ??
                                                                            distinctValueSets[0] ??
                                                                            '';

                                                                        return (
                                                                            <div
                                                                                key={f.id}
                                                                                style={{
                                                                                    gridColumn: `span ${fullWidthCard ? (f.width || 12) : 12}`,
                                                                                    alignSelf: 'start',
                                                                                }}
                                                                            >
                                                                                {showDropdown ? (
                                                                                    <div style={{ display: 'flex',  flexDirection: "column"}}>
                                                                                        <div style={{display: 'flex',gap: 8, flexDirection: "row", alignItems: "center"}}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                                <label style={{ fontWeight: 500 }}>{`Контактная информация для ${f.label}`}</label>
                                                                                                <abbr
                                                                                                    title={infoText}
                                                                                                    style={{
                                                                                                        textDecoration: 'none',
                                                                                                        cursor: 'help',
                                                                                                        color: '#6c757d',
                                                                                                        fontSize: '1rem',
                                                                                                        lineHeight: 1,
                                                                                                        marginBottom: 10
                                                                                                    }}
                                                                                                >
                                                                                                    ℹ️
                                                                                                </abbr>
                                                                                            </div>
                                                                                            <PhoneProjectSelect
                                                                                                value={selectedPhoneByField[fieldId] || ''}
                                                                                                onChange={val => {
                                                                                                    setSelectedPhoneByField(cur => ({ ...cur, [fieldId]: val }));
                                                                                                    const [phone, joinedValues] = val.split('|');
                                                                                                    setValues(cur => ({
                                                                                                        ...cur,
                                                                                                        [proj]: { ...cur[proj], [fieldId]: joinedValues }
                                                                                                    }));
                                                                                                    // ← onchange-триггеры
                                                                                                    triggerOnchangeModulesForField(proj, fieldId, f, joinedValues);
                                                                                                }}
                                                                                                options={combos.map(c => ({
                                                                                                    id: c.id,
                                                                                                    name: c.values.join(', ')
                                                                                                }))}
                                                                                                placeholder="выберите вариант…"
                                                                                            />
                                                                                        </div>
                                                                                        <EditableFields
                                                                                            params={[{
                                                                                                field_id: f.id,
                                                                                                field_name: f.label,
                                                                                                field_type: f.type,
                                                                                                field_vals: f.values,
                                                                                                editable: f.editable,
                                                                                                must_have: false,
                                                                                                project_name: proj,
                                                                                            }]}
                                                                                            initialValues={{ [f.id]: current }}
                                                                                            onChange={nv => {
                                                                                                const v = nv[f.id] || '';
                                                                                                setValues(cur => ({
                                                                                                    ...cur,
                                                                                                    [proj]: { ...cur[proj], [fieldId]: v }
                                                                                                }));
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                ) : (
                                                                                    <div>

                                                                                        <EditableFields
                                                                                            params={[{
                                                                                                field_id: f.id,
                                                                                                field_name: f.label,
                                                                                                field_type: f.type,
                                                                                                field_vals: f.values,
                                                                                                editable: f.editable,
                                                                                                must_have: false,
                                                                                                project_name: proj,
                                                                                            }]}
                                                                                            initialValues={{ [f.id]: current }}
                                                                                            onChange={nv => {
                                                                                                const v = nv[f.id] || '';
                                                                                                setValues(cur => ({
                                                                                                    ...cur,
                                                                                                    [proj]: { ...cur[proj], [fieldId]: v }
                                                                                                }));
                                                                                                triggerOnchangeModulesForField(proj, fieldId, f, v);;
                                                                                            }}
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            );
                                                        })}

                                                        {orphanFields.length > 0 && (
                                                            <div
                                                                key="__orphans__"
                                                                style={{
                                                                    gridColumn: 'span 12',
                                                                    border: '1px solid #ccc',          // как у групп (можешь поменять на dashed)
                                                                    borderRadius: 4,
                                                                    padding: 8,
                                                                    display: 'grid',
                                                                    gridTemplateColumns: 'repeat(12, minmax(0,1fr))',
                                                                    alignItems: 'start',
                                                                    gap: '0 16px',                      // такой же горизонтальный шаг
                                                                    marginBottom: 16,
                                                                }}
                                                            >
                                                                {/*/!* Заголовок блока (если не нужен — удали этот div) *!/*/}
                                                                {/*<div style={{ gridColumn: '1 / -1', fontWeight: 600, marginBottom: 8 }}>*/}
                                                                {/*    Без группы*/}
                                                                {/*</div>*/}

                                                                {orphanFields.map((f: MergedField) => {
                                                                    const fieldId = f.fieldIds[proj];
                                                                    const spanField = fullWidthCard ? (f.width || 12) : 12;
                                                                    const current = values[proj]?.[fieldId] || '';

                                                                    return (
                                                                        <div
                                                                            key={f.id}
                                                                            style={{
                                                                                gridColumn: `span ${spanField}`,
                                                                                alignSelf: 'start',
                                                                                minWidth: 0,
                                                                            }}
                                                                        >
                                                                            <EditableFields
                                                                                params={[{
                                                                                    field_id: f.id,
                                                                                    field_name: f.label,
                                                                                    field_type: f.type,
                                                                                    field_vals: f.values,
                                                                                    editable: f.editable,
                                                                                    must_have: false,
                                                                                    project_name: proj,
                                                                                }]}
                                                                                initialValues={{ [f.id]: current }}
                                                                                onChange={nv => {
                                                                                    const v = nv[f.id] || '';
                                                                                    setValues(cur => ({
                                                                                        ...cur,
                                                                                        [proj]: { ...cur[proj], [fieldId]: v },
                                                                                    }));
                                                                                    triggerOnchangeModulesForField(proj, fieldId, f, v);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {(shouldShowMeta || tuskMode) && (
                                <div
                                    className="form-group"
                                    style={
                                        compact
                                            ? { flex: '1 1 100%', minWidth: 0 }
                                            : {}
                                    }
                                >
                                    <textarea
                                        className="form-control"
                                        placeholder="Введите комментарий"
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        style={compact ? { width: '100%' } : {}}
                                    />
                                </div>
                            )}
                            {shouldShowMeta && fullWidthCard ? (
                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 12,
                                        marginBottom: 8,
                                        flexWrap: 'wrap'
                                    }}
                                >
                                    {[
                                        {
                                            label: 'Причина звонка',
                                            value: callReason,
                                            onChange: setCallReason,
                                            options: sortedCallReasons
                                        },
                                        {
                                            label: 'Результат звонка',
                                            value: callResult,
                                            onChange: setCallResult,
                                            options: sortedCallResults
                                        }
                                    ]
                                        // Оставляем только те, у которых есть опции
                                        .filter(({ options }) => options && options.length > 0)
                                        .map(({ label, value, onChange, options }, idx) => (
                                            <div
                                                key={idx}
                                                className="form-group"
                                                style={{
                                                    flex: '1 1 calc(50% - 6px)',
                                                    minWidth: 0,
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: 4
                                                }}
                                            >
                                                <label style={{ fontWeight: 400, fontSize: 16 }}>
                                                    {label}: <span style={{ color: 'red' }}>*</span>
                                                </label>
                                                <SearchableSelect
                                                    options={options}
                                                    value={value}
                                                    onChange={onChange}
                                                    placeholder={`Выберите ${label.toLowerCase()}...`}
                                                    augmentSaved={!hasActiveCall && !postActive}
                                                />
                                            </div>
                                        ))}
                                </div>
                            ) : (
                                <>
                                    {(shouldShowMeta || tuskMode) && callReasons.length > 0 && (
                                        <div className="form-group d-flex align-items-center" style={compact ? { flex: '1 1 calc(50% - 12px)', minWidth: 0, gap: 8 } : { flex: '1 1 0%', minWidth: 0, gap: 8 }}>
                                            <label className="mb-0" style={{ whiteSpace: 'nowrap', fontWeight: 400, fontSize: 16 }}>
                                                Причина звонка: <span style={{ color: 'red' }}>*</span>
                                            </label>
                                            <SearchableSelect
                                                options={callReasons}
                                                value={callReason}
                                                onChange={setCallReason}
                                                placeholder="Выберите причину..."
                                                augmentSaved={!hasActiveCall && !postActive}
                                            />
                                        </div>
                                    )}

                                    {(shouldShowMeta || tuskMode) && callResults.length > 0 && (
                                        <div className="form-group d-flex align-items-center" style={compact ? { flex: '1 1 calc(50% - 22px)', minWidth: 0, gap: 8 } : { flex: '1 1 0%', minWidth: 0, gap: 8 }}>
                                            <label className="mb-0" style={{ whiteSpace: 'nowrap', fontWeight: 400, fontSize: 16 }}>
                                                Результат звонка: <span style={{ color: 'red' }}>*</span>
                                            </label>
                                            <SearchableSelect
                                                options={callResults}
                                                value={callResult}
                                                onChange={setCallResult}
                                                placeholder="Выберите результат..."
                                                augmentSaved={!hasActiveCall && !postActive}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                            {renderModules()}
                        </div>

                        {/* Кнопка «Сохранить» для обычного режима */}
                        {(shouldShowMeta && !hasActiveCall && !postActive) && (
                            <div className="card-footer d-flex justify-content-end">
                                <button className="btn btn-outline-success" onClick={handleSave}>
                                    Сохранить
                                </button>
                            </div>
                        )}
                        <div style={{display: "flex", flexDirection: "column", gap: 16}}>
                            {postActive && (
                                <div className="mt-3">
                                    <p>Постобработка: осталось {postSeconds} сек.</p>
                                    <button
                                        className="btn btn-outline-success"
                                        onClick={handlePostSave}
                                        // disabled={isLoading}
                                    >
                                        Сохранить и вернуться на линию
                                    </button>
                                </div>
                            )}
                            {/*{(tuskMode && openedPhones && !hasActiveCall && !isClient) && (*/}
                            {/*    <button*/}
                            {/*        className="btn btn-outline-success"*/}
                            {/*        onClick={handleSetTusk}*/}
                            {/*        style={{width: 250}}*/}
                            {/*    >*/}
                            {/*        Закрепить за мной*/}
                            {/*    </button>*/}
                            {/*)}*/}
                        </div>
                        {(tuskMode && !isChating && !checkBox) &&
                            <div className="d-flex justify-end mb-3">
                                <label style={{ cursor: 'pointer', fontWeight: 500, display: "flex", gap: 8, marginTop: 8}}>
                                    <input
                                        type="checkbox"
                                        checked={fullWidthCard}
                                        className={styles.customCheckbox}
                                        onChange={() => setFullWidthCard ? setFullWidthCard(!fullWidthCard) : console.log("nan")}
                                    />
                                    <div style={{ marginTop: 2}}>
                                        На всю ширину
                                    </div>
                                </label>
                            </div>
                        }
                    </div>
                </div>
            </div>
            {renderSecondCall()}

            <GroupActionModal
                isOpen={groupModalOpen}
                onClose={() => setGroupModalOpen(false)}
                preset={selectedPreset?.preset ?? null}
                ids={memoizedIds}
                glagolParent="fs.at.glagol.ai"
                role={role || "operator"}
                idProjectMap={idProjectMap}
                onSelectionChange={setGroupSelectedIds}
                handleGroupSave={handleGroupSave}
                phoneID={phoneID}
            />
            {renderActionDock()}
        </div>
    );
};

export default CallControlPanel;
