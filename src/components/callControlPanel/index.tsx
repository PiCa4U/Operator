import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import { socket } from '../../socket';
import PhoneProjectSelect from './components/PhoneProjectSelect';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import Swal from "sweetalert2";
import EditableFields from "./components";
import {makeSelectAccessibleProjectPool, selectOperatorAccess} from "../../redux/operatorSlice";
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
import {OperatorScreenSharePanel} from "../../screenShare/OperatorScreenSharePanel";
import ContactUsersPresence from "./components/ContactUsersPresence";
import CallDurationText from "./components/CallDurationText/CallDurationText";
import PostCountdown from "./components/PostCountdown/PostCountdown";
import InternalOperatorsDialer from "./components/InternalOperatorsDialer/InternalOperatorsDialer";
import InterCallBanner from "./components/InterCallBanner/InterCallBanner";

const IcoClip = (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...p}>
        <path
            fill="currentColor"
            d="M16.5 6.5l-7.9 7.9a3 3 0 1 0 4.2 4.2l8-8a5 5 0 0 0-7.1-7.1l-8.2 8.2a7 7 0 0 0 9.9 9.9l7.8-7.8a1 1 0 1 0-1.4-1.4l-7.8 7.8a5 5 0 0 1-7.1-7.1l8.2-8.2a3 3 0 1 1 4.2 4.2l-8 8a1 1 0 1 1-1.4-1.4l7.9-7.9a1 1 0 1 0-1.4-1.4z"
        />
    </svg>
);
type AlertMsg = {
    title?: string;
    text?: string;
    type?: 'success' | 'error' | 'warning' | 'info';
};
export function normalizeUrl(path?: string) {
    const next = path ?? window.location.pathname;
    window.history.replaceState(null, '', next);
}

const runningModulesCountRef = { current: 0 } as React.MutableRefObject<number>;

const alertsQueueRef = { current: [] as AlertMsg[] } as React.MutableRefObject<AlertMsg[]>;
const isShowingAlertRef = { current: false } as React.MutableRefObject<boolean>;

const MAP_JSON_KEYS = [
    "lat",
    "lon",
    "country",
    "state",
    "city",
    "city_district",
    "road",
    "house_number",
    "postcode",
    "q",
] as const;

type MapJsonKey = typeof MAP_JSON_KEYS[number];

function tryParseJsonObject(raw: unknown): Record<string, any> | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim();
    if (!s) return null;

    try {
        const parsed = JSON.parse(s);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? parsed
            : null;
    } catch {
        return null;
    }
}

function buildPrettyAddress(obj?: Record<string, any> | null): string {
    if (!obj) return "";

    const q = String(obj.q ?? "").trim();
    if (q) return q;

    return [
        obj.country,
        obj.state,
        obj.city,
        obj.road,
        obj.house_number,
    ]
        .map(v => String(v ?? "").trim())
        .filter(Boolean)
        .join(", ");
}

function hasCoords(obj?: Record<string, any> | null): boolean {
    if (!obj) return false;
    const lat = String(obj.lat ?? "").trim();
    const lon = String(obj.lon ?? "").trim();
    return lat !== "" && lon !== "";
}

function hasAddress(obj?: Record<string, any> | null): boolean {
    if (!obj) return false;
    return Boolean(
        String(obj.q ?? "").trim() ||
        String(obj.country ?? "").trim() ||
        String(obj.state ?? "").trim() ||
        String(obj.city ?? "").trim() ||
        String(obj.city_district ?? "").trim() ||
        String(obj.road ?? "").trim() ||
        String(obj.house_number ?? "").trim() ||
        String(obj.postcode ?? "").trim()
    );
}

function toNum(v: unknown): number {
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "") return Number(v);
    return NaN;
}

function parseMapFieldConfig(raw: unknown): {
    mapping: Record<string, string>;
    defaults: Record<string, any>;
    overlay?: Record<string, any>;
} {
    let mapping: Record<string, string> = {};
    let defaults: Record<string, any> = {};
    let overlay: Record<string, any> | undefined;

    if (raw == null) return { mapping, defaults, overlay };

    let parsed: any = raw;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return { mapping, defaults, overlay };
        }
    }

    if (
        parsed &&
        typeof parsed === "object" &&
        ("mapping" in parsed || "defaults" in parsed || "overlay" in parsed)
    ) {
        if (parsed.mapping && typeof parsed.mapping === "object") {
            mapping = parsed.mapping;
        }
        if (parsed.defaults && typeof parsed.defaults === "object") {
            defaults = parsed.defaults;
        }
        if (parsed.overlay && typeof parsed.overlay === "object") {
            overlay = parsed.overlay;
        }
    } else if (parsed && typeof parsed === "object") {
        defaults = parsed;
    }

    return { mapping, defaults, overlay };
}

const mapIcon = (t?: string): 'success'|'error'|'warning'|'info' => {
    const s = String(t || '').toLowerCase();
    if (s === 'success' || s === 'error' || s === 'warning' || s === 'info') return s as any;
    if (s === 'ok' || s === 'passed' || s === 'accepted') return 'success';
    if (s === 'warn') return 'warning';
    return 'info';
};

function normalizeContactUsers(resp: any): string[] {
    const arr =
        Array.isArray(resp) ? resp :
            Array.isArray(resp?.users) ? resp.users :
                Array.isArray(resp?.sip_logins) ? resp.sip_logins :
                    Array.isArray(resp?.logins) ? resp.logins :
                        Array.isArray(resp?.data) ? resp.data :
                            [];
    return arr.map(String).map((s: any) => s.trim()).filter(Boolean);
}


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

        if (node.destination === 'alert' && node.msg && typeof node.msg === 'object') {
            push({ title: node.msg.title, text: node.msg.text, type: mapIcon(node.msg.type) });
        }

        if (node.alert && looksLikeAlertObj(node.alert)) {
            push({ title: node.alert.title, text: node.alert.text, type: mapIcon(node.alert.type) });
        }

        for (const k in node) {
            if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
            const v = (node as any)[k];
            if (v && typeof v === 'object') walk(v);
        }
    };

    walk(payload);
    return out;
}

function enqueueAlert(m: AlertMsg, swalRef: React.MutableRefObject<any>) {
    alertsQueueRef.current.push(m);
    processAlerts(swalRef);
}

function processAlerts(swalRef: React.MutableRefObject<any>) {
    if (isShowingAlertRef.current) return;
    const next = alertsQueueRef.current.shift();
    if (!next) return;

    isShowingAlertRef.current = true;

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

        if (runningModulesCountRef.current > 0 && !swalRef.current) {
            swalRef.current = Swal.fire({
                title: 'Выполняются модули',
                html: `Осталось <strong>${runningModulesCountRef.current}</strong> модулей`,
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
        }

        processAlerts(swalRef);
    });
}

type DialplanExtensionMeta = {
    name?: string | null;
    label?: string | null;
    project?: string | null;
    [key: string]: any;
};

type DialplanExtensionsResponse = Record<
    string,
    Record<string, DialplanExtensionMeta>
>;

type DialplanExtensionItem = {
    id: string;
    ext: string;
    title: string;
    project_name: string;
};

interface PhoneCombo {
    id: string;
    phone: string;
    values: string[];
    projects: string[];
}
interface ContactInfoOptionItem {
    phone: string;
    project: string;
    value: string;
    contactKey: string;
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
    direction: string;
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
    string,
    Record<string/*field_id*/, string/*value*/>
>;

export interface ExpressState {
    project: string;
    express_id: number;
    active: boolean;
    calls: number;
    agents: string[];
}

type CallLike = Partial<ActiveCall> & Record<string, any>;

function extractSipLoginFromPresence(value?: string | number | null): string {
    const raw = String(value ?? "").trim();
    if (!raw) return "";

    return raw.replace(/^sip:/i, "").split("@")[0].trim();
}

function resolveCallTargetSipLogin(callLike?: CallLike, currentSipLogin?: string): string {
    if (!callLike) return "";

    const ownSip = String(currentSipLogin ?? "").trim();

    // Для внутреннего звонка на добавочный это приоритетный источник
    const fromPresence =
        extractSipLoginFromPresence(callLike?.b_presence_id) ||
        extractSipLoginFromPresence(callLike?.presence_id);

    if (fromPresence && fromPresence !== ownSip) {
        return fromPresence;
    }

    // Фолбэк для обычных сценариев
    const rawTarget =
        String(callLike?.dest ?? "").trim() === ownSip
            ? callLike?.cid_num
            : callLike?.dest;

    return extractSipLoginFromPresence(rawTarget) || String(rawTarget ?? "").trim();
}

function isInternalExtensionTarget(callLike?: CallLike, currentSipLogin?: string): boolean {
    if (!callLike) return false;

    const ownSip = String(currentSipLogin ?? "").trim();
    const fromPresence =
        extractSipLoginFromPresence(callLike?.b_presence_id) ||
        extractSipLoginFromPresence(callLike?.presence_id);

    return Boolean(fromPresence && fromPresence !== ownSip);
}

function parseDialplanExtensions(
    resp: DialplanExtensionsResponse
): DialplanExtensionItem[] {
    const out: DialplanExtensionItem[] = [];
    const seen = new Set<string>();

    Object.entries(resp || {}).forEach(([projectKey, extensions]) => {
        if (!extensions || typeof extensions !== 'object') return;

        Object.entries(extensions).forEach(([extKey, meta]) => {
            if (!meta || typeof meta !== 'object') return;

            const project_name = String(meta.project || projectKey).trim();
            if (!project_name) return;

            const ext = String(extKey).trim();
            if (!ext) return;

            const title = String(meta.label || meta.name || ext).trim() || ext;
            const uniqKey = `${project_name}|${ext}`;

            if (seen.has(uniqKey)) return;
            seen.add(uniqKey);

            out.push({
                id: uniqKey,
                ext,
                title,
                project_name,
            });
        });
    });

    return out.sort((a, b) => {
        if (a.project_name !== b.project_name) {
            return a.project_name.localeCompare(b.project_name, 'ru');
        }

        return a.title.localeCompare(b.title, 'ru', { numeric: true });
    });
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
    setOutboundCall?: (outboundCall: boolean) => void
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
    setActiveGuid?: (guid: string) => void
    isClient?: boolean
    checkBox?: string | null
    interCall?: any;
    showInterCallHeader?: boolean;
    onHangupInterCall?: (uuid: string) => void;
    suspendStartModules?: boolean;
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
function getContactSelectionKey(c: any): string {
    return String(
        c?.guid ??
        c?.id ??
        `${String(c?.project ?? "")}:${String(c?.phone ?? "")}`
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

const isVisibleForRole = (visible: any, role?: string): boolean => {
    // нормализация роли
    const r = norm(role)
        .replace('оператор', 'operator')
        .replace('менеджер', 'manager');

    const arr = visible == null
        ? null                    // отсутствует → считаем «не задано»
        : (Array.isArray(visible) ? visible : [visible])
            .map(v => norm(v)
                .replace('оператор', 'operator')
                .replace('менеджер', 'manager'))
            .filter(Boolean);

    if (arr === null) return true;

    if (arr.length === 0) return false;

    if (arr.includes('*') || arr.includes('all')) return true;

    if (!r) return true;

    return arr.includes(r);
};

type ActivityLabel = string;

function useActivityPing(params: {
    enabled: boolean;
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

        const INTERVAL_MS        = 30_000; // длина интервала (30 сек)
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

            axios.post("/api/v1/activity/ping", payload)
                .catch(err => {
                    console.warn("activity/ping failed", err);
                });

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
                                                               setOutboundCall,
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
                                                               setActiveGuid,
                                                               isClient,
                                                               checkBox= null,
                                                               interCall,
                                                               showInterCallHeader,
                                                               onHangupInterCall,
                                                               suspendStartModules = false,
}) => {
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = '',
    } = store.getState().credentials;

    const { sessionKey } = store.getState().operator
    const operatorAccess = useSelector(selectOperatorAccess);
    const selectAccessibleProjectPool = useMemo(() => makeSelectAccessibleProjectPool(sipLogin), [sipLogin]);
    const rawAccessibleProjectPool = useSelector(selectAccessibleProjectPool);
    const accessibleProjectPool = useMemo(
        () => rawAccessibleProjectPool || [],
        [rawAccessibleProjectPool]
    );
    const projectPool = accessibleProjectPool;

    const activeCalls: ActiveCall[] = useSelector((state: RootState) => state.operator.activeCalls);
    const isMainCallHeld = useMemo(() => {
        const mainActiveCall = activeCalls?.[0];
        if (!mainActiveCall) return false;

        return (
            mainActiveCall.callstate === "HELD" ||
            mainActiveCall.b_callstate === "HELD"
        );
    }, [activeCalls]);

    const [manualNumber, setManualNumber] = useState('');

    const [dockOpen, setDockOpen] = useState(false);

    const [callReason, setCallReason] = useState('');
    const [callResult, setCallResult] = useState('');
    const [comment,   setComment]     = useState('')
    const [baseFieldValues, setBaseFieldValues] = useState<{ [fieldId: string]: string }>(
        call?.base_fields || {}
    );

    const [dialplanExtensions, setDialplanExtensions] = useState<DialplanExtensionItem[]>([]);

    const [callReasons, setCallReasons] = useState<ReasonItem[]>([]);
    const [callResults, setCallResults] = useState<ResultItem[]>([]);
    const [group_instructions, setGroup_instructions] = useState<any>(null)
    const [mergedFieldsAll, setMergedFieldsAll] = useState<MergedField[]>([]);
    const [mergedFields,    setMergedFields]    = useState<MergedField[]>([]);
    const [values, setValues] = useState<GroupFieldValues>({});

    useEffect(() => {
        console.log("values: ", values)
    }, [values]);


    const [isParams, setIsParams] = useState<boolean>(true)
    const [groupSelectedIds, setGroupSelectedIds] = useState<number[]>([]);
    const swalRef = useRef<any>(null);
    const [activeTab, setActiveTab] = useState<string>(TAB_ALL);
    const [serverFilesByGuid, setServerFilesByGuid] = useState<Record<string, string[]>>({});

    const [cardUsers, setCardUsers] = useState<string[]>([]);

    const [isLocker, setIsLocker] = useState<boolean>(false)

    const presenceIds = useMemo<number[]>(() => {
        const fromOpened = (openedPhones ?? [])
            .map((p: any) => Number(p?.id))
            .filter((n) => Number.isFinite(n));

        if (fromOpened.length) return Array.from(new Set(fromOpened));

        const single = call?.id ?? phoneID;
        const n = Number(single);
        return Number.isFinite(n) ? [n] : [];
    }, [openedPhones, call?.id, phoneID]);

    const presenceKey = useMemo(() => presenceIds.join(","), [presenceIds]);

    const groupedDialplanExtensions = useMemo(() => {
        const byProject: Record<string, DialplanExtensionItem[]> = {};

        dialplanExtensions.forEach(item => {
            const proj = item.project_name;
            if (!byProject[proj]) {
                byProject[proj] = [];
            }
            byProject[proj].push(item);
        });

        return byProject;
    }, [dialplanExtensions]);

    const groupByFactors = useMemo<string[] | undefined>(() => {
        const keys = selectedPreset?.preset?.group_by;
        const sample = openedPhones?.[0];
        if (!sample || !Array.isArray(keys) || !keys.length) return undefined;

        const values = keys
            .map((k) => String((sample as any)[k] ?? (sample as any)?.contact_info?.[k] ?? "").trim())
            .filter(Boolean);

        return values.length === keys.length ? values : undefined;
    }, [openedPhones, selectedPreset?.preset?.group_by]);

    const groupByPayload = useMemo(() => {
        // таблица шлёт массив групп => тут шлём одну группу как list-of-lists
        return groupByFactors && groupByFactors.length ? [groupByFactors] : undefined;
    }, [groupByFactors]);
    const otherUsers = useMemo(
        () => cardUsers.filter(u => String(u) !== String(sipLogin)),
        [cardUsers, sipLogin]
    );


    const POST_LIMIT = worker.includes('fs@akc24.ru') ? 12000 : 1800;

    const postSecondsRef = useRef<number>(POST_LIMIT);

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

    const getExtensionDialProject = (item: DialplanExtensionItem): string => {
        return item.project_name || activeProject || selectedProjects[0] || groupProjects[0] || '';
    };

    const ONCHANGE_DEBOUNCE_MS = 400;

    function triggerOnchangeModulesForField(
        proj: string,
        fieldId: string,
        f: MergedField,
        nextValue: string
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
        if (Array.isArray(up)) {
            return up.map((o: any) => o?.filename || o?.name || o?.storage_name).filter(Boolean);
        }
        const candidates = [up?.data, up?.result, up?.uploaded, up?.files, up?.storage];
        for (const c of candidates) {
            if (Array.isArray(c)) {
                return c.map((o: any) => o?.filename || o?.name || o?.storage_name).filter(Boolean);
            }
        }
        if (typeof up === 'object' && up?.filename) return [up.filename];
        return [];
    }

    async function uploadFilesToAllGuids(
        files: FileList,
        login: string,
        glagol_parent: string
    ) {
        if (!files?.length || !guidsFromOpened?.length) return;

        const bin = Array.from(files);
        const guids = Array.from(new Set(guidsFromOpened));

        await Promise.allSettled(
            guids.map(async (guid) => {
                try {
                    const fd = new FormData();
                    bin.forEach((f) => fd.append("files", f, f.name));

                    fd.append("created_by", login);
                    fd.append("glagol_parent", glagol_parent);

                    const { data: up } = await chatApi.post(
                        `/api/v1/storage/upload/${encodeURIComponent(guid)}`,
                        fd
                    );

                    const storage = extractUploadedNames(up);
                    if (!storage.length) {
                        console.warn("upload ok, but no filenames in response:", up);
                        window.dispatchEvent(new CustomEvent("contact-files:refresh", { detail: { guid } }));
                        return;
                    }

                    try {
                        await chatApi.post(`/api/v1/contacts/storage/add`, {
                            guid,
                            storage,
                        });
                    } catch (e: any) {
                        const code = e?.response?.status;
                        if (code !== 409 && code !== 400) throw e;
                    }

                    window.dispatchEvent(new CustomEvent("contact-files:refresh", { detail: { guid } }));
                } catch (e) {
                    console.warn("upload/attach failed for guid", guid, e);
                }
            })
        );
    }

    function setCallResultByAny(v: any) {
        const str = v == null ? '' : String(v);
        if (str === '') { setCallResult(''); return; }
        // 1) РїРѕ id
        const byId = callResults.find(r => String(r.id) === str);
        if (byId) { setCallResult(String(byId.id)); return; }
        // 2) РїРѕ name
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

    // useEffect(() => {
    //     if (activeTab !== TAB_FILES) return;
    //     const id = window.setInterval(() => void refreshAllOpenedFiles(), 60000);
    //     return () => window.clearInterval(id);
    // }, [activeTab, guidsFromOpened]);

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

    const [selectedPhoneByField, setSelectedPhoneByField] = useState<Record<string,string>>({});
    const selectedPhoneByFieldRef = useRef(selectedPhoneByField);
    useEffect(() => { selectedPhoneByFieldRef.current = selectedPhoneByField; }, [selectedPhoneByField]);
    const [selectedContactKey, setSelectedContactKey] = useState('');

    const [runningModulesCount, setRunningModulesCount] = useState(0);


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
        if (!openedPhones) return [];
        return Array.from(new Set(openedPhones.map(p => p.project)));
    }, [openedPhones]);
    useEffect(() => {
        if (groupProjects.length > 0) {
            setActiveProjectName?.(groupProjects[0]);
        }
    }, [groupProjects, setActiveProjectName])
    const [selectedProjects, setSelectedProjects] = useState<string[]>(groupProjects);


    const activityLabels = useMemo(() => {
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

        if (!firstContact) {
            return [];
        }

        keys.forEach((rawKey) => {
            const key = String(rawKey).trim();
            if (!key) return;

            let value: any = (firstContact as any)[key];

            if (
                (value === undefined || value === null || value === '') &&
                firstContact.contact_info &&
                Object.prototype.hasOwnProperty.call(firstContact.contact_info, key)
            ) {
                value = firstContact.contact_info[key];
            }

            const str = String(value ?? '').trim();
            if (str) {
                values.add(str);
            }
        });

        return Array.from(values);
    }, [projectPool, selectedProjects, openedPhones]);

    const activityEnabled =
        Boolean(hasActiveCall || postActive || (tuskMode && openedPhones && openedPhones.length));

    useActivityPing({
        enabled: activityEnabled,
        glagolParent,
        userName: sipLogin || worker,
        activityLabels: activityLabels,
    });

    function fieldHasTabForProject(f: MergedField, proj: string): boolean {
        const tk = f.tabsByProject?.[proj];
        return tk != null && String(tk).trim() !== '';
    }

    function isFieldLeftover(f: MergedField): boolean {
        let hasAnySelected = false;
        for (const p of f.projects) {
            if (!selectedProjects.includes(p)) continue;
            hasAnySelected = true;
            if (fieldHasTabForProject(f, p)) return false;
        }
        return hasAnySelected;
    }
    useEffect(() => {
        runningModulesCountRef.current = runningModulesCount;
    }, [runningModulesCount]);

    const hasLeftovers = useMemo(
        () => mergedFields.some(isFieldLeftover),
        [mergedFields, selectedProjects]
    );

    const idProjectMap = useMemo(() =>
            openedPhones?.map(ph => ({ id: ph.id, project_name: ph.project })) || [],
        [openedPhones]);

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
    function moduleComparator(a: ModuleData, b: ModuleData) {
        // 1) сначала manual, потом всё остальное
        const aManual = a.start_modes?.includes('manual') ? 0 : 1;
        const bManual = b.start_modes?.includes('manual') ? 0 : 1;
        if (aManual !== bManual) return aManual - bManual;

        // 2) общие модули (common_code) — например, раньше проектных
        const aCommon = a.common_code ? 0 : 1;
        const bCommon = b.common_code ? 0 : 1;
        if (aCommon !== bCommon) return aCommon - bCommon;

        // 3) явная позиция, если есть
        const aPos = Number.isFinite((a as any).position) ? Number((a as any).position) : Number.POSITIVE_INFINITY;
        const bPos = Number.isFinite((b as any).position) ? Number((b as any).position) : Number.POSITIVE_INFINITY;
        if (aPos !== bPos) return aPos - bPos;

        // 4) стабильный алфавит по button_name/filename
        const aName = (a.button_name ?? a.filename ?? '').toString();
        const bName = (b.button_name ?? b.filename ?? '').toString();
        return aName.localeCompare(bName, 'ru');
    }

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

    const compact = Boolean(fullWidthCard);
    const resolveGridSpan = (width?: number | null) => {
        if (!fullWidthCard) return 12;

        const numericWidth = Number(width);
        if (!Number.isFinite(numericWidth) || numericWidth <= 0) {
            return 12;
        }

        const normalizedWidth = numericWidth <= 1 ? numericWidth * 12 : numericWidth;
        return Math.max(1, Math.min(12, Math.round(normalizedWidth)));
    };
    const sanitize = (v: any) =>
        typeof v === 'string' && v.includes('|_|_|') ? '' : v;

    const outboundFlowIds = useMemo(() => {
        return Array.from(
            new Set(
                (operatorAccess.flowIds ?? [])
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id))
            )
        );
    }, [operatorAccess.flowIds]);

    // Активные звонки
    // const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false


    const forbiddenProjects = ['api_call', 'no_project_out'];
    const project = call?.project_name || '';
    const hideReportFields = forbiddenProjects.includes(project);


    useEffect(() => {
        if (openedPhones && openedPhones.length) {
            const projects = Array.from(new Set(openedPhones.map(p => p.project)));

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


    useEffect(() => {
        if (activeCalls[0]?.direction === "inbound" && activeProject) {
            socket.emit("get_project_fields", {
                projects: [activeProject],
                session_key: sessionKey,
                worker
            });
        }
    }, [activeCalls, activeProject, sessionKey, worker]);

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

            const sanitized: Record<string, string> = {};
            Object.entries(baseFields).forEach(([fid, val]) => {
                if (!fid.startsWith("AS_")) return;
                sanitized[fid] = String(val);
            });

            setValues({ [projectName]: sanitized });
        }
    }, [call, hasActiveCall, postActive, sessionKey, worker]);

// в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
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
                    onchangeByProject: { [projName]: oc },
                });
            } else {
                const e = map.get(key)!;
                if (!e.projects.includes(projName)) e.projects.push(projName);
                e.fieldIds[projName] = f.field_id;
                e.tabsByProject[projName] = tabKey;
                e.onchangeByProject = { ...(e.onchangeByProject || {}), [projName]: oc };
            }
        };

        Object.entries(data.as_is_dict).forEach(([projName, fields]) => {
            if ((selectedProjects.length && !selectedProjects.includes(projName)) || !selectedProjects.length) return;

            fields.forEach(f => {
                push(mapAll, projName, f);

                if (isVisibleForRole((f as any).visible, role)) {
                    push(mapUi, projName, f);
                }
            });
        });

        const all = Array.from(mapAll.values());
        const ui  = Array.from(mapUi.values());

        setMergedFieldsAll(all);
        setMergedFields(ui);

            const init: GroupFieldValues = { ...values };
            if (selectedProjects.length) {
                selectedProjects.forEach(p => {
                    if (!init[p]) {
                        init[p] = {};
                    }
                });
            }

            if (call && momoProjectRepo && momoProjectRepo.current) {
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
                    setValues(initKwargs);


                const firstProject   = Object.values(call.projects)[0];
                const projNames = Object.keys(call.projects)
                const rawReasonId    = firstProject.call_reason;
                const rawResultId    = firstProject.call_result;
                const rawComment     = firstProject.comment || '';

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
                const preferredByProject = new Map<string, any>();
                const preferredContact =
                    (openedPhones || []).find((ph: any) => Number(ph?.id) === Number(phoneID)) ||
                    (openedPhones || [])[0] ||
                    null;

                selectedProjects.forEach((proj) => {
                    const cleanProj = cleanProjectName(proj);
                    const match =
                        (openedPhones || []).find(
                            (ph: any) =>
                                cleanProjectName(String(ph?.project ?? "")) === cleanProj &&
                                Number(ph?.id) === Number(phoneID)
                        ) ||
                        (openedPhones || []).find(
                            (ph: any) => cleanProjectName(String(ph?.project ?? "")) === cleanProj
                        ) ||
                        preferredContact;

                    if (match) {
                        preferredByProject.set(proj, match);
                    }
                });

                setValues((prev) => {
                    const nextValues: GroupFieldValues = { ...prev };

                    Object.keys(init).forEach((proj) => {
                        const contactInfo = preferredByProject.get(proj)?.contact_info || {};
                        nextValues[proj] = {
                            ...(prev[proj] || {}),
                            ...(init[proj] || {}),
                            ...contactInfo,
                        };
                    });

                    return nextValues;
                });
            }

            if (selectedProjects.length) {
                setCallReasons(
                    data.call_reasons.filter(r => selectedProjects.includes(r.project_name))
                );
                setCallResults(
                    data.call_results.filter(r => selectedProjects.includes(r.project_name))
                );
            }

        }


    useEffect(() => {

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
            .replace(/(\s*\(.*?\)|@default)\s*$/g, '')
            .trim();
    }


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

    useEffect(() => {
        const handleModules = (data: any) => {
            if (data && typeof data === 'object' && setMonoModules) {
                setMonoModules(normalizeMono(data));
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


    useEffect(() => {
        if (runningModulesCount > 0) {
            if (!swalRef.current) {
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
        const scopeProjects =
            selectedProjects.length > 0 ? selectedProjects : Object.keys(monoModules || {});

        const projectList: string[] = mod.common_code || tuskMode
            ? scopeProjects.filter((project) =>
                (monoModules?.[project] || []).some((m) => m.filename === mod.filename)
            )
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


    useEffect(() => {
        const handleModuleResult = (...args: any[]) => {
            const raw: Record<string, any> | undefined = args.find(a => typeof a === 'object' && a !== null);
            if (!raw) return;

            const alerts = collectAlerts(raw);
            alerts.forEach(a => enqueueAlert(a, swalRef));
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
                return;
            }


            setRunningModulesCount(prev => Math.max(0, prev - 1));

            const dataObj = raw;
            const core = (dataObj && typeof dataObj === 'object' && typeof dataObj.spec === 'object')
                ? dataObj.spec
                : dataObj;

            if ('project_name' in dataObj && 'result' in dataObj && tuskMode) {
                const project = dataObj.project_name as string;
                const result  = dataObj.result || {};
                Object.entries(result).forEach(([fieldKey, value]) => {
                    if (fieldKey === 'msg' || fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type') return;
                    let v: string;
                    if (value == null) v = '';
                    else if (typeof value === 'object') v = JSON.stringify(value);
                    else v = String(value);
                    void applyFieldUpdate(project, fieldKey, v);
                });
                return;
            }

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
                        void applyFieldUpdate(project, fieldKey, v);
                    });
                });
                return;
            }

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
                if (fieldKey === 'msg' || fieldKey === 'alert' || fieldKey === 'title' || fieldKey === 'text' || fieldKey === 'type' || fieldKey === 'destination') return;

                let v: string;
                if (value == null) v = '';
                else if (typeof value === 'object') v = JSON.stringify(value);
                else v = String(value);

                void applyFieldUpdate(project, fieldKey, v);
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

    const hydrateMapJsonValue = useCallback(
        async (
            project: string,
            fieldKey: string,
            rawValue: string
        ): Promise<string> => {
            const fieldMeta = mergedFieldsAll.find(
                (f) => f.type === "map" && f.fieldIds[project] === fieldKey
            );

            if (!fieldMeta) {
                return rawValue;
            }

            const { mapping, defaults } = parseMapFieldConfig(fieldMeta.values);
            const isDefaultsOnly = !mapping || Object.keys(mapping).length === 0;

            // Пока гидрируем только старый формат map-поля, где всё хранится в одном JSON
            if (!isDefaultsOnly) {
                return rawValue;
            }

            const incomingObj = tryParseJsonObject(rawValue);
            if (!incomingObj) {
                return rawValue;
            }

            const prevRaw = valuesRef.current?.[project]?.[fieldKey];
            const prevObj = tryParseJsonObject(prevRaw);

            // собираем базовый объект
            const full: Record<string, string> = {};
            for (const k of MAP_JSON_KEYS) {
                full[k] = String(incomingObj[k] ?? defaults?.[k] ?? "");
            }

            const coordsExist = hasCoords(full);
            const addressExist = hasAddress(full);

            // 1) Есть координаты, но нет адреса → reverse
            if (coordsExist && !addressExist) {
                const lat = toNum(full.lat);
                const lon = toNum(full.lon);

                if (Number.isFinite(lat) && Number.isFinite(lon)) {
                    try {
                        const { data } = await axios.get("/api/v1/location/reverse", {
                            params: {
                                glagol_parent: glagolParent,
                                lon,
                                lat,
                            },
                        });

                        const raw =
                            data && typeof data === "object" && "data" in data
                                ? (data as any).data
                                : data;

                        const address =
                            raw?.address && typeof raw.address === "object"
                                ? raw.address
                                : raw || {};

                        full.country = String(address.country ?? full.country ?? "");
                        full.state = String(address.state ?? address.region ?? full.state ?? "");
                        full.city = String(address.city ?? full.city ?? "");
                        full.city_district = String(address.city_district ?? full.city_district ?? "");
                        full.road = String(address.road ?? full.road ?? "");
                        full.house_number = String(address.house_number ?? full.house_number ?? "");
                        full.postcode = String(address.postcode ?? full.postcode ?? "");

                        const pretty = buildPrettyAddress(full);
                        if (pretty) {
                            full.q = pretty;
                        }
                    } catch (e) {
                        // fallback: если раньше уже был хороший адрес — не теряем его
                        if (prevObj && hasCoords(prevObj) && hasAddress(prevObj)) {
                            const sameLat = String(prevObj.lat ?? "").trim() === String(full.lat ?? "").trim();
                            const sameLon = String(prevObj.lon ?? "").trim() === String(full.lon ?? "").trim();

                            if (sameLat && sameLon) {
                                for (const k of MAP_JSON_KEYS) {
                                    if (!String(full[k] ?? "").trim()) {
                                        full[k] = String(prevObj[k] ?? "");
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 2) Есть адрес, но нет координат → search (+ при желании нормализуем reverse)
            if (!hasCoords(full) && hasAddress(full)) {
                const q = buildPrettyAddress(full);

                if (q) {
                    try {
                        const { data } = await axios.get("/api/v1/location/search", {
                            params: {
                                glagol_parent: glagolParent,
                                q,
                            },
                        });

                        let raw: any = data;
                        if (raw && typeof raw === "object" && "data" in raw) raw = raw.data;

                        let arr: any[] = [];
                        if (Array.isArray(raw)) arr = raw;
                        else if (Array.isArray(raw?.result)) arr = raw.result;
                        else if (Array.isArray(data?.result)) arr = data.result;
                        else if (raw && typeof raw === "object" && ("lat" in raw || "lon" in raw)) arr = [raw];
                        else if (data && typeof data === "object" && ("lat" in data || "lon" in data)) arr = [data];

                        const first = arr[0];
                        const lat = toNum(first?.lat ?? first?.data?.lat);
                        const lon = toNum(first?.lon ?? first?.data?.lon);

                        if (Number.isFinite(lat) && Number.isFinite(lon)) {
                            full.lat = String(lat);
                            full.lon = String(lon);

                            // лучше добить reverse, чтобы получить нормальные address-поля
                            try {
                                const { data: reverseData } = await axios.get("/api/v1/location/reverse", {
                                    params: {
                                        glagol_parent: glagolParent,
                                        lon,
                                        lat,
                                    },
                                });

                                const reverseRaw =
                                    reverseData && typeof reverseData === "object" && "data" in reverseData
                                        ? (reverseData as any).data
                                        : reverseData;

                                const address =
                                    reverseRaw?.address && typeof reverseRaw.address === "object"
                                        ? reverseRaw.address
                                        : reverseRaw || {};

                                full.country = String(address.country ?? full.country ?? "");
                                full.state = String(address.state ?? address.region ?? full.state ?? "");
                                full.city = String(address.city ?? full.city ?? "");
                                full.city_district = String(address.city_district ?? full.city_district ?? "");
                                full.road = String(address.road ?? full.road ?? "");
                                full.house_number = String(address.house_number ?? full.house_number ?? "");
                                full.postcode = String(address.postcode ?? full.postcode ?? "");

                                const pretty = buildPrettyAddress(full);
                                if (pretty) {
                                    full.q = pretty;
                                }
                            } catch {
                                if (!String(full.q).trim()) {
                                    full.q = q;
                                }
                            }
                        }
                    } catch {
                        // если поиск не удался — оставляем как есть
                    }
                }
            }

            return JSON.stringify(full);
        },
        [mergedFieldsAll, glagolParent]
    );

    async function applyFieldUpdate(project: string, fieldKey: string, v: string) {
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
                } catch {}
                return;

            case 'call_reason':
                setCallReason(v);
                return;

            case 'call_result':
                setCallResult(v);
                return;

            case 'comment':
                setComment(v);
                return;

            default: {
                const normalizedValue = await hydrateMapJsonValue(project, fieldKey, v);

                setValues(prev => ({
                    ...prev,
                    [project]: {
                        ...prev[project],
                        [fieldKey]: normalizedValue
                    }
                }));
                return;
            }
        }
    }

    const startModules = useMemo<ModuleData[]>(() => {
        if (monoModules && Object.keys(monoModules).length) {
            const projectsScope = selectedProjects.length ? selectedProjects : Object.keys(monoModules);
            const seen = new Set<string>();
            const out: ModuleData[] = [];

            projectsScope.forEach((project) => {
                (monoModules[project] || []).forEach((mod) => {
                    if (!Array.isArray(mod.start_modes) || !mod.start_modes.includes('start')) return;

                    const key = mod.common_code
                        ? `common::${mod.filename}`
                        : `${project}::${mod.filename}`;

                    if (seen.has(key)) return;
                    seen.add(key);
                    out.push(mod);
                });
            });

            return out.sort(moduleComparator);
        }

        return modules
            .filter(mod =>
                Array.isArray(mod.start_modes) &&
                mod.start_modes.includes('start')
            )
            .sort(moduleComparator);
    }, [monoModules, modules, selectedProjects]);

    const startModulesPayloadReady = useMemo(() => {
        if (!startModules.length) return false;
        if (!openedPhones?.length || !selectedProjects.length) return true;

        return selectedProjects.every((proj) => {
            const cleanProj = cleanProjectName(proj);
            const preferredContact =
                (openedPhones || []).find(
                    (ph: any) =>
                        cleanProjectName(String(ph?.project ?? "")) === cleanProj &&
                        Number(ph?.id) === Number(phoneID)
                ) ||
                (openedPhones || []).find(
                    (ph: any) => cleanProjectName(String(ph?.project ?? "")) === cleanProj
                );

            const contactInfo = preferredContact?.contact_info || {};
            const requiredEntries = Object.entries(contactInfo).filter(
                ([, value]) => String(value ?? '').trim() !== ''
            );

            if (!requiredEntries.length) return true;

            const projectValues = values[proj] || {};
            return requiredEntries.every(
                ([fieldId, value]) => String(projectValues[fieldId] ?? '').trim() === String(value).trim()
            );
        });
    }, [startModules, openedPhones, selectedProjects, phoneID, values]);
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


    const startContextKey = useMemo(() => {
        // 1) активный звонок — ключ по uuid (или call_uuid)
        if (hasActiveCall) {
            const ac = activeCalls?.[0];
            const u = String(ac?.uuid || ac?.call_uuid || ac?.b_uuid || "");
            return u ? `call:${u}` : "call:unknown";
        }

        // 2) tusk-карточка — ключ по наборам ids (стабильно)
        if (tuskMode) {
            const ids = (openedPhones ?? [])
                .map((p: any) => Number(p?.id))
                .filter((n) => Number.isFinite(n))
                .sort((a, b) => a - b)
                .join(",");
            return `tusk:${ids}`;
        }

        // 3) редактирование сохранённого call
        if (call?.id != null) return `edit:${call.id}`;

        return "none";
    }, [hasActiveCall, activeCalls, tuskMode, openedPhones, call?.id]);

    const lastStartContextRef = useRef<string>("none");

    useEffect(() => {
        if (startContextKey === "none") return;

        if (lastStartContextRef.current !== startContextKey) {
            lastStartContextRef.current = startContextKey;

            if (!postActive) {
                startModulesRanRef.current = false;
            }
        }
    }, [startContextKey, startModulesRanRef, postActive]);


    useEffect(() => {
        if (suspendStartModules) return;
        if (startModulesRanRef.current) return;
        if (!startModulesPayloadReady) return;

        if (startModules.length && (hasActiveCall || call)) {
            setRunningModulesCount(startModules.length);
            startModules.forEach(mod => handleModuleRun(mod, false, undefined, { manual: true }));
            startModulesRanRef.current = true;
            return;
        }

        const countPhones = openedPhones?.length ?? 0;
        if (startModules.length && tuskMode && countPhones > 0 && !postActive) {
            setRunningModulesCount(startModules.length);
            startModules.forEach(mod => handleModuleRun(mod, false, undefined, { manual: true }));
            startModulesRanRef.current = true;
        }
    }, [
        startContextKey,
        hasActiveCall,
        tuskMode,
        openedPhones,
        postActive,
        startModules,
        startModulesPayloadReady,
        handleModuleRun,
        suspendStartModules,
    ]);
//     useEffect(() => {
//         if (!hasActiveCall) {
//             startModulesRanRef.current = false;
//         }
//     }, [hasActiveCall]);

    useEffect(() => {
        if (hasActiveCall) {
            setIsParams(true)
            postSecondsRef.current = POST_LIMIT;
        }
    }, [hasActiveCall]);

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
        postSecondsRef.current = POST_LIMIT;
        setCallReason('');
        setCallResult('');
        setComment('');
        setBaseFieldValues({});
    };

    const handleHold = () => {
        const currentUUID = activeCalls[0]?.call_uuid;
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
                // axios.post("/api/v1/group_lock/off", {
                //     glagol_parent: glagolParent,
                //     group_by: groupByFactors,
                //     factors: selectedPreset?.preset?.group_by ?? []
                // });

                // socket.emit("group_lock_off", {
                //     group_by: groupByPayload,
                //     session_key: sessionKey,
                //     worker
                // })
            }

            setIsParams(false)
            setPostActive(true)
            postSecondsRef.current = POST_LIMIT;
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

    const handleRedirectToInterCall = () => {
        const uuid1 =
            activeCalls[0].direction === "outbound" && !expressCall
                ? activeCalls[0]?.b_uuid
                : activeCalls[0]?.uuid;

        const uuid2 =
            interCall?.dest === sipLogin
                ? interCall?.uuid
                : interCall?.b_uuid;

        if (!uuid1 || !uuid2) return;

        const targetSipLogin = resolveCallTargetSipLogin(interCall, sipLogin);
        const internalExtension = isInternalExtensionTarget(interCall, sipLogin);

        if (!internalExtension) {
            socket.emit("transfer_data", {
                worker,
                session_key: sessionKey,
                target_sip_login: targetSipLogin,
                data: openedPhones,
            });
        }
    };

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

        const post_time = Math.max(0, Math.min(POST_LIMIT, POST_LIMIT - postSecondsRef.current));

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
        postSecondsRef.current = POST_LIMIT;;
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

        const post_time = Math.max(0, Math.min(POST_LIMIT, POST_LIMIT - postSecondsRef.current));
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
                    ...(assignedKey ? { assigned_key: assignedKey } : {}),
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
            postSecondsRef.current = POST_LIMIT;
            onClose();
        }
    };


    function extractSuffix(input?: string | null): string {
        return input?.split(' ').pop() ?? '';
    }

    const iconCol = call?.total_direction === 'outbound' ? '#f26666' : '#7cd420';

    // const callFromCard = (project_name: string, phone: string, phoneId?: number) => {
    //     manualCallRef.current = true;
    //     startModulesRanRef.current = true
    //
    //     if (phoneId) {
    //         if (setPhoneID) {
    //             setPhoneID(phoneId);
    //         }
    //     }
    //
    //     socket.emit('call', {
    //         phone,
    //         project_name,
    //         session_key: sessionKey,
    //         sip_login: sipLogin,
    //         worker
    //     });
    // };

    const callFromCard = async (project_name: string, phone: string, phoneId?: number) => {
        manualCallRef.current = true;
        startModulesRanRef.current = true;
        setOutboundCall?.(true);

        if (phoneId && setPhoneID) {
            setPhoneID(phoneId);
        }

        try {
            await axios.post("/api/v1/calls/call", {
                glagol_parent: glagolParent,
                project_name,
                sip_login: sipLogin,
                phone,
            });

            await Swal.fire({
                icon: "success",
                title: "Вызов инициализирован",
                timer: 1200,
                showConfirmButton: false,
            });
        } catch (error: any) {
            setOutboundCall?.(false);
            startModulesRanRef.current = false;
            manualCallRef.current = false;
            console.error("Ошибка при вызове:", error);

            await Swal.fire({
                icon: "error",
                title: "Ошибка при старте вызова",
                text:
                    error?.response?.data?.message ||
                    error?.response?.data?.error ||
                    error?.message ||
                    "Не удалось запустить вызов",
            });
        }
    };

    const getGroupProjects = (
        openedPhones: Array<{ phone: string; project: string }>
    ): string[] => {
        if (!openedPhones?.length) return [];
        const projectsSet = new Set(openedPhones.map(p => p.project));
        return Array.from(projectsSet);
    };

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
                id: ph.id,
                project: ph.project,
                contact_info: ph.contact_info || {},
            });
        });

        return Array.from(map.values());
    }, [openedPhones]);

    useEffect(() => {
        if (!glagolParent) {
            setDialplanExtensions([]);
            return;
        }

        let cancelled = false;

        axios
            .get("/api/v1/dialplan/extensions", {
                params: {
                    glagol_parent: glagolParent,
                },
            })
            .then(({ data }) => {
                if (cancelled) return;
                setDialplanExtensions(parseDialplanExtensions(data));
            })
            .catch((error) => {
                if (cancelled) return;
                console.error("Ошибка при загрузке внутренних номеров:", error);
                setDialplanExtensions([]);
            });

        return () => {
            cancelled = true;
        };
    }, [glagolParent]);

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
        setOpenedPhones?.([]);
        setOpenedGroup?.([]);
        setPhonesData?.([]);
        startModulesRanRef.current = false;

        setActiveProjectName?.('');

        if (momoProjectRepo && momoProjectRepo.current && setTuskMode) {
            setTuskMode(false);
        }

        setSelectedCall(null);

        normalizeUrl();
        onClose();
    };

    const renderGroupPhones = () => {
        if (!phoneGroups.length) return null;

        return (
            <div
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    marginBottom: 16,
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 12,
                    }}
                >
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
                    <button className="btn btn-outline-warning mr-2" onClick={() => handleHold()}>
                        <span className="material-icons">{iconName}</span>
                    </button>
                    <button className="btn btn-outline-danger mr-2" onClick={() => handleStop(mainActiveCall, 1)}>
                        <span className="material-icons">call_end</span>
                    </button>
                </div>
                <div className="d-flex align-items-center mt-2">
                  <span className="material-icons" style={{ color: iconColor }}>
                    {mainActiveCall.direction === 'outbound' ? 'logout' : 'login'}
                  </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600}}>
                        {mainActiveCall.direction === 'outbound' && mainActiveCall.name.startsWith("sofia/internal") ?
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
                        {isHeld ? 'На удержании' : 'Вызов активен'}:</strong>{" "}
                        <CallDurationText created={mainActiveCall.created} glagol_parent={glagolParent}/>
                </div>
                {!tuskMode && <strong style={{whiteSpace: 'nowrap', marginTop: "4px", fontWeight: 600, fontSize: 16}}>
                    {`Проект: ${findNameProject(activeProject)}`}
                </strong>}
            </div>
        );
    };
    const renderPostCallHeader = () => {

        const iconColor = postCallData?.direction === 'outbound' ? '#f26666' : '#7cd420';
        const iconName = postCallData?.direction === 'outbound' ? 'logout' : 'login';
        const phoneNumber = postCallData?.direction === 'outbound' && postCallData.name.startsWith("sofia/internal") ? postCallData.b_callee_num : postCallData?.cid_num;
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
        if (!outboundFlowIds.length) {
            Swal.fire({
                icon: 'warning',
                title: 'Нет доступных flow',
                text: 'У оператора не настроены flow для получения следующей задачи.',
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
            flow_ids: outboundFlowIds,
            start_type: "auto",
            tz_offset: getTzOffsetMinutes(),
        });
    };

    const renderActionDock = () => {
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
            pointerEvents: 'none',
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
            pointerEvents: dockOpen ? 'auto' : 'none',
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
                <div
                    id="actions-dock-panel"
                    style={panel}
                    role="menu"
                    aria-hidden={!dockOpen}
                    onMouseEnter={openDock}
                    onMouseLeave={() => delayedClose()}
                >
                    <div style={header}>Действия</div>

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
                                if (openedPhones && isLocker) {
                                    axios.post("/api/v1/group_lock/off", {
                                        glagol_parent: glagolParent,
                                        group_by: groupByFactors,
                                        factors: selectedPreset?.preset?.group_by ?? []
                                    });

                                    // socket.emit("group_lock_off", {
                                    //     group_by: groupByPayload,
                                    //     session_key: sessionKey,
                                    //     worker
                                    // })
                                }
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
                                axios.post("/api/v1/group_lock/off", {
                                    glagol_parent: glagolParent,
                                    group_by: groupByFactors,
                                    factors: selectedPreset?.preset?.group_by ?? []
                                });
                                handleNextTask();
                                delayedClose();
                            }}
                            title="Получить следующую задачу"
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

                    {/* �?нтеграции (общие) */}
                    {(manualCommon.length > 0 || manualModules.length > 0) && (
                        <>
                            <div style={sectionTitle}>�?нтеграции</div>
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

                    {/* �?нтеграции по проектам (только в tuskMode) */}
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
        if (!call) return null;
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
    const contactInfoOptions = useMemo(() => {
        const result: Record<string, ContactInfoOptionItem[]> = {};
        (openedPhones || []).forEach(ph => {
            const contactKey = getContactSelectionKey(ph);
            Object.entries(ph.contact_info || {}).forEach(([fieldId, value]) => {
                if (!result[fieldId]) result[fieldId] = [];
                result[fieldId].push({
                    phone: ph.phone,
                    project: ph.project,
                    value: String(value),
                    contactKey,
                });
            });
        });
        return result;
    }, [openedPhones]);

    const contactsByKey = useMemo(() => {
        const map = new Map<string, any>();
        (openedPhones || []).forEach((ph) => {
            map.set(getContactSelectionKey(ph), ph);
        });
        return map;
    }, [openedPhones]);

    const preferredContactKey = useMemo(() => {
        const preferredContact =
            (openedPhones || []).find((ph: any) => Number(ph?.id) === Number(phoneID)) ||
            (openedPhones || [])[0] ||
            null;

        return preferredContact ? getContactSelectionKey(preferredContact) : '';
    }, [openedPhones, phoneID]);

    const contactSelectionContextKey = useMemo(() => {
        const ids = (openedPhones || [])
            .map((ph: any) => Number(ph?.id))
            .filter((id) => Number.isFinite(id))
            .sort((a, b) => a - b)
            .join(',');

        return `${String(phoneID ?? '')}|${ids}`;
    }, [openedPhones, phoneID]);

    const contactFieldIds = useMemo(
        () => Object.keys(contactInfoOptions),
        [contactInfoOptions]
    );

    const syncSelectedContactInfo = useCallback((contactKey: string) => {
        const selectedContact = contactsByKey.get(contactKey);
        if (!selectedContact || !contactFieldIds.length) return;

        const selectedGuid = getContactGuid(selectedContact);
        if (selectedGuid) {
            setActiveGuid?.(selectedGuid);
        }

        const projectsScope = Array.from(
            new Set([...(selectedProjects || []), ...(groupProjects || [])].filter(Boolean))
        );
        if (!projectsScope.length) return;

        const selectedContactInfo = selectedContact?.contact_info || {};

        setValues((cur) => {
            let changed = false;
            const nextValues: GroupFieldValues = { ...cur };

            projectsScope.forEach((proj) => {
                const prevProjectValues = cur[proj] || {};
                let nextProjectValues = prevProjectValues;

                contactFieldIds.forEach((fieldId) => {
                    const nextValue = String(selectedContactInfo[fieldId] ?? '');
                    const currentValue = String(prevProjectValues[fieldId] ?? '');
                    if (currentValue === nextValue) return;

                    if (nextProjectValues === prevProjectValues) {
                        nextProjectValues = { ...prevProjectValues };
                    }
                    nextProjectValues[fieldId] = nextValue;
                    changed = true;
                });

                if (nextProjectValues !== prevProjectValues) {
                    nextValues[proj] = nextProjectValues;
                }
            });

            return changed ? nextValues : cur;
        });
    }, [contactsByKey, contactFieldIds, selectedProjects, groupProjects, setActiveGuid]);

    const lastContactSelectionContextRef = useRef('');

    useEffect(() => {
        if (!openedPhones?.length) {
            setSelectedContactKey((prev) => (prev ? '' : prev));
            if (Object.keys(selectedPhoneByFieldRef.current).length) setSelectedPhoneByField({});
            lastContactSelectionContextRef.current = '';
            return;
        }

        setSelectedContactKey((prev) => {
            const shouldResetToPreferred =
                lastContactSelectionContextRef.current !== contactSelectionContextKey;

            lastContactSelectionContextRef.current = contactSelectionContextKey;

            if (shouldResetToPreferred && preferredContactKey) {
                return preferredContactKey;
            }
            if (prev && contactsByKey.has(prev)) {
                return prev;
            }
            return preferredContactKey;
        });
    }, [openedPhones, preferredContactKey, contactsByKey, contactSelectionContextKey]);

    useEffect(() => {
        if (!openedPhones?.length || !selectedContactKey) return;

        const nextSelected: Record<string, string> = {};
        mergedFieldsAll.forEach((f) => {
            const { showDropdown, combos } = getFieldPhoneOptions(f, contactInfoOptions);
            if (!showDropdown || !combos.length) return;

            const chosenKey = combos.some((combo) => combo.id === selectedContactKey)
                ? selectedContactKey
                : '';

            f.projects.forEach((proj) => {
                const fieldId = f.fieldIds[proj];
                if (!fieldId) return;

                const uiKey = f.projects.length > 1 ? f.id : fieldId;
                nextSelected[uiKey] = chosenKey;
            });
        });

        setSelectedPhoneByField((prev) => {
            const prevKeys = Object.keys(prev);
            const nextKeys = Object.keys(nextSelected);
            const sameShape =
                prevKeys.length === nextKeys.length &&
                nextKeys.every((key) => prev[key] === nextSelected[key]);

            return sameShape ? prev : nextSelected;
        });

        syncSelectedContactInfo(selectedContactKey);
    }, [openedPhones, selectedContactKey, mergedFieldsAll, contactInfoOptions, syncSelectedContactInfo]);


    useEffect(() => {
        if (!openedPhones?.length || selectedContactKey) return;

        const nextValues: GroupFieldValues = {};
        selectedProjects.forEach(proj => { nextValues[proj] = { ...(valuesRef.current?.[proj] || {}) }; });

        const nextSelected: Record<string, string> = {};

        mergedFieldsAll.forEach(f => {
            const { showDropdown, distinctValueSets, combos } =
                getFieldPhoneOptions(f, contactInfoOptions);
            const isVisibleInUi = mergedFields.some(u => u.id === f.id);

            f.projects.forEach(proj => {
                if (!nextValues[proj]) return;
                const fieldId = f.fieldIds[proj];
                if (!fieldId) return;

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
    }, [contactInfoOptions, selectedProjects, openedPhones, mergedFieldsAll, mergedFields, selectedContactKey]);

    useEffect(() => {
        if (!openedPhones?.length) return;

        const dropdownValues: GroupFieldValues = {};
        const dropdownSelected: Record<string, string> = {};
        let hasDropdowns = false;

        mergedFieldsAll.forEach((f) => {
            const { showDropdown, combos } = getFieldPhoneOptions(f, contactInfoOptions);
            if (!showDropdown || !combos.length) return;

            hasDropdowns = true;
            const isVisibleInUi = mergedFields.some((u) => u.id === f.id);

            f.projects.forEach((proj) => {
                if (!selectedProjects.includes(proj)) return;

                const fieldId = f.fieldIds[proj];
                if (!fieldId) return;

                if (!dropdownValues[proj]) {
                    dropdownValues[proj] = {};
                }

                const uiKey = f.projects.length > 1 ? f.id : fieldId;
                const persistedSelection = selectedPhoneByFieldRef.current?.[uiKey];
                const chosenCombo = persistedSelection
                    ? combos.find((c) => c.id === persistedSelection)
                    : combos[0];

                dropdownValues[proj][fieldId] = chosenCombo ? chosenCombo.values.join(", ") : "";

                if (isVisibleInUi) {
                    dropdownSelected[uiKey] = chosenCombo?.id || "";
                }
            });
        });

        if (!hasDropdowns) return;

        setValues((cur) => {
            const merged: GroupFieldValues = { ...cur };
            Object.entries(dropdownValues).forEach(([proj, fields]) => {
                merged[proj] = { ...(cur[proj] || {}), ...fields };
            });
            return merged;
        });

        setSelectedPhoneByField(dropdownSelected);
    }, [contactInfoOptions, selectedProjects, openedPhones, mergedFieldsAll, mergedFields]);

    useEffect(() => {
        if (!openedPhones?.length) return;

        setValues(prev => {
            const nextValues: GroupFieldValues = { ...prev };

            Object.entries(contactInfoOptions).forEach(([fieldId, opts]) => {
                const vals = opts.map(o => o.value).filter(v => v !== '');
                const uniq = Array.from(new Set(vals));

                if (uniq.length === 1) {
                    const single = uniq[0];
                    selectedProjects.forEach(proj => {
                        if (!nextValues[proj]) nextValues[proj] = {};
                        nextValues[proj][fieldId] = single;
                    });
                }
            });

            return nextValues;
        });
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

    useEffect(() => {
        const defaultTab = computeDefaultTab();

        if (activeTab !== TAB_ALL && activeTab !== TAB_FILES && !availableTabs.includes(activeTab)) {
            setActiveTab(defaultTab);
            return;
        }

        if (activeTab === TAB_ALL && !hasLeftovers) {
            setActiveTab(defaultTab);
            return;
        }

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

    const filteredMergedFields = useMemo(() => {
        if (activeTab === TAB_FILES) return [];
        if (activeTab === TAB_ALL) return mergedFields.filter(isFieldLeftover);
        return mergedFields.filter(f => fieldInActiveTab(f));
    }, [mergedFields, activeTab, selectedProjects]);

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
        contactInfoOptions: Record<string, ContactInfoOptionItem[]>
    ): {
        showDropdown: boolean;
        distinctValueSets: string[];
        combos: PhoneCombo[];
    } {
        const items = f.projects.flatMap(proj => {
            const id = f.fieldIds[proj];
            return (contactInfoOptions[id] || [])
                .map(o => ({ phone: o.phone, project: o.project, value: o.value, contactKey: o.contactKey }))
                .filter(x => x.value);
        });

        const byContact: Record<string, { phone: string; values: string[]; projects: string[] }> = {};
        items.forEach(({ phone, project, value, contactKey }) => {
            if (!byContact[contactKey]) {
                byContact[contactKey] = { phone, values: [], projects: [] };
            }
            byContact[contactKey].values.push(value);
            byContact[contactKey].projects.push(project);
        });

        const combos: PhoneCombo[] = Object.entries(byContact).map(
            ([contactKey, { phone, values, projects }]) => {
                const uniqVals = Array.from(new Set(values));
                const uniqProjs = Array.from(new Set(projects));
                return {
                    id: contactKey,
                    phone,
                    values: uniqVals,
                    projects: uniqProjs
                };
            }
        );

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

    const closeButton = (isLocker?: boolean) => {
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
        if (openedPhones && isLocker) {
            axios.post("/api/v1/group_lock/off", {
                glagol_parent: glagolParent,
                group_by: groupByFactors,
                factors: selectedPreset?.preset?.group_by ?? []
            });

            // socket.emit("group_lock_off", {
            //     group_by: groupByPayload,
            //     session_key: sessionKey,
            //     worker
            // })
        }
    }


    // @ts-ignore
    return (
        <div>
            {/*{renderModules()}*/}
            <div className="col ml-2 pr-0 mr-0 mr-1">
                <div className="card col ml-0">
                    <div className="card-body">
                        <div style={{display: "flex", flexDirection: "row", }}>
                            <ContactUsersPresence
                                enabled={Boolean(sipLogin) && presenceIds.length > 0}
                                sipLogin={sipLogin}
                                ids={presenceIds}
                                group_by={groupByFactors}
                                factors={selectedPreset?.preset?.group_by ?? []}
                                pollMs={5000}
                                role={role}
                                closeButton={closeButton}
                                setIsLocker={setIsLocker}
                            />
                        </div>

                        {showInterCallHeader && interCall && (
                            <InterCallBanner
                                interCall={interCall}
                                canTransfer={activeCalls.length > 0}
                                onTransfer={handleRedirectToInterCall}
                                onHangup={(uuid) => onHangupInterCall?.(uuid)}
                                style={{ marginBottom: 10 }}
                            />
                        )}

                        {hasActiveCall && !interCall && (
                            <InternalOperatorsDialer
                                enabled={hasActiveCall}
                                currentLogin={sipLogin}
                                openedPhones={openedPhones ?? []}
                                handleHold={handleHold}
                                isMainCallHeld={isMainCallHeld}
                                dialplanExtensions={dialplanExtensions}
                                findProjectLabel={findNameProject}
                            />
                        )}                
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
                                            <div style={{ display: 'flex', marginBottom: 8 }}>
                                                <button
                                                    type="button"
                                                    className="btn btn-outline-secondary d-inline-flex align-items-center"
                                                    title="Прикрепить файлы"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={!hasAnyGuid}
                                                    style={{ gap: 8 }}
                                                >
                                                    <IcoClip />
                                                    <span>Прикрепить</span>
                                                </button>
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    multiple
                                                    style={{ display: 'none' }}
                                                    onChange={(e) => {
                                                        if (e.target.files) void uploadFilesToAllGuids(e.target.files, sipLogin, glagolParent);
                                                        e.currentTarget.value = '';
                                                    }}
                                                />
                                            </div>

                                            <ContactFilesPanel
                                                contacts={(openedPhones || [])}
                                                serverFilesByGuid={serverFilesByGuid}
                                                alwaysOpen
                                                glagolParent={glagolParent}
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
                                                                            {String.fromCodePoint(0x2139, 0xfe0f)}
                                                                        </abbr>
                                                                    </div>
                                                                    <PhoneProjectSelect
                                                                        value={combos.some(c => c.id === selectedContactKey) ? selectedContactKey : ''}
                                                                        onChange={val => {
                                                                            if (!val) return;
                                                                            const chosenCombo = combos.find(c => c.id === val);
                                                                            const joinedValues = chosenCombo ? chosenCombo.values.join(', ') : '';
                                                                            setSelectedContactKey(val);
                                                                            syncSelectedContactInfo(val);
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
                                                            const spanGroup = resolveGridSpan(group.width);

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
                                                                                gridColumn: `span ${resolveGridSpan(f.width)}`,
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
                                                                                                    {String.fromCodePoint(0x2139, 0xfe0f)}
                                                                                                </abbr>
                                                                                            </div>
                                                                                             <PhoneProjectSelect
                                                                                                 value={combos.some(c => c.id === selectedContactKey) ? selectedContactKey : ''}
                                                                                                 onChange={val => {
                                                                                                     if (!val) return;
                                                                                                     const chosenCombo = combos.find(c => c.id === val);
                                                                                                     const joinedValues = chosenCombo ? chosenCombo.values.join(', ') : '';
                                                                                                     setSelectedContactKey(val);
                                                                                                     syncSelectedContactInfo(val);
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
                                                                    border: '1px solid #ccc',
                                                                    borderRadius: 4,
                                                                    padding: 8,
                                                                    display: 'grid',
                                                                    gridTemplateColumns: 'repeat(12, minmax(0,1fr))',
                                                                    alignItems: 'start',
                                                                    gap: '0 16px',
                                                                    marginBottom: 16,
                                                                }}
                                                            >

                                                                {orphanFields.map((f: MergedField) => {
                                                                    const fieldId = f.fieldIds[proj];
                                                                    const spanField = resolveGridSpan(f.width);
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
                                    <PostCountdown
                                        // key нужен, чтобы компонент гарантированно сбрасывался на новый пост-звонок
                                        key={`${postCallData?.call_uuid ?? ""}:${postActive ? 1 : 0}:${POST_LIMIT}`}
                                        enabled={postActive}
                                        limitSec={POST_LIMIT}
                                        secondsRef={postSecondsRef}
                                        onExpire={handleAutoReturn}
                                    />
                                    <button
                                        className="btn btn-outline-success"
                                        onClick={handlePostSave}
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
                        {(!isChating && !checkBox) &&
                            <div className="d-flex justify-end mb-3">
                                <label style={{ cursor: 'pointer', fontWeight: 500, display: "flex", gap: 8, marginTop: 8}}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(fullWidthCard)}
                                        className={styles.customCheckbox}
                                        onChange={() => setFullWidthCard?.(!fullWidthCard)}
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
            <GroupActionModal
                isOpen={groupModalOpen}
                onClose={() => setGroupModalOpen(false)}
                preset={selectedPreset?.preset ?? null}
                ids={memoizedIds}
                glagolParent={glagolParent}
                role={role || "operator"}
                idProjectMap={idProjectMap}
                onSelectionChange={setGroupSelectedIds}
                handleGroupSave={handleGroupSave}
                phoneID={phoneID}
            />
            {/*<OperatorScreenSharePanel />*/}
            {renderActionDock()}
        </div>
    );
};

export default CallControlPanel;
