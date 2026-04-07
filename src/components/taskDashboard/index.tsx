import React, {useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect} from 'react';
import * as XLSX from 'xlsx';
import SearchableSelect from '../callControlPanel/components/select/index';
import styles from "./components/checkbox.module.css"
import {
    makeSelectAccessibleProjectPool,
    selectOperatorAccess,
} from "../../redux/operatorSlice";
import { useSelector} from "react-redux";
import GroupActionModal from "./components/index";
import MultiSelect from "../callControlPanel/components/multiselect";

import Swal from "sweetalert2";
import {socket} from "../../socket";
import {RootState, store} from "../../redux/store";
import {ExpressState} from "../callControlPanel";
import axios from "axios";
import DatePicker from "react-datepicker";
import {format} from 'date-fns';
import {AssignComp} from "./components/assign";

import {chatApi} from "../../features/itsm/chat/api";
import {selectTableFilters, TableFilters, tasksTableActions} from "../../redux/tasksTableSlice";

const TABLE_SCOPE = 'tasksTable';

function makeScope(presetId?: number) {
    const { sipLogin = 'anon' } = store.getState().credentials || {};
    return `ss:${TABLE_SCOPE}:u:${sipLogin}:pid:${presetId ?? 'none'}`;
}

function ssRead<T>(key: string, fallback: T): T {
    try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function ssWrite(key: string, val: any) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function ssRemove(key: string) {
    try { sessionStorage.removeItem(key); } catch {}
}

function lsRead<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function lsWrite(key: string, val: any) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

type Step = { type: string; code_filename?: string };

const COL_W_DEFAULT = 240;
const COL_W: Record<string, number> = {
    '#select': 44,
    '#actions': 76,
    '#messages': 150 ,
};
const getColW = (key: string) => COL_W[key] ?? COL_W_DEFAULT;

function makeGroupCardUrl(row: ApiRow, selectedPreset: OptionType | null, phonesData: any[]) {
    const u = new URL(window.location.href);
    u.searchParams.set("card", "1");
    u.searchParams.set("ids", (row.id_list || []).join(","));

    const pid = selectedPreset?.preset?.id;
    if (pid) u.searchParams.set("pid", String(pid));

    const byId = new Map<number, any>(phonesData.map(p => [p.id, p]));
    for (const id of row.id_list || []) {
        const p = byId.get(id);
        const g =
            (p?.contact_info?.guid && String(p.contact_info.guid)) ||
            (p?.guid && String(p.guid)) || null;
        if (g) { u.searchParams.set("guid", g); break; }
    }

    return u.toString();
}

const NONE_TOKEN = "__NONE__";
const NONE_LABEL = "Пустое значение";

function isNoneToken(v: unknown) {
    return v === NONE_TOKEN || String(v ?? "").trim() === NONE_LABEL;
}

// из UI значения -> в стейт
function toStateValue(v: unknown): string {
    const s = String(v ?? "").trim();
    if (s === "" || s === NONE_LABEL) return NONE_TOKEN;
    return s;
}

// из стейта -> в UI отображение
function toUiValue(v: unknown): string {
    return v === NONE_TOKEN ? NONE_LABEL : String(v ?? "");
}

// добавить "(Пусто)" в выпадающий список
function withNoneOption(opts: { id: string; name: string }[]) {
    if (opts.some(o => o.id === NONE_TOKEN)) return opts;
    return [{ id: NONE_TOKEN, name: NONE_LABEL }, ...opts];
}

function normalizeStringArray(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map(String).map((v) => v.trim()).filter(Boolean);
    return String(raw)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
}

function extractActionSteps(act?: { [k: string]: any }): Step[] {
    const steps: Step[] = [];
    if (!act) return steps;

    if (act.action_type) {
        steps.push({type: String(act.action_type), code_filename: act.code_filename});
    }

    const idxs = Array.from(
        new Set(
            Object.keys(act)
                .map(k => (/_\d+$/.test(k) ? Number(k.split('_').pop()) : null))
                .filter((n): n is number => n !== null)
        )
    ).sort((a, b) => a - b);

    for (const n of idxs) {
        const t = act[`action_type_${n}`];
        if (!t) continue;
        steps.push({
            type: String(t),
            code_filename: act[`code_filename_${n}`],
        });
    }

    return steps;
}

const UI = {
    font: 14,
    head: 15,
    menu: 14,
    icon: 18,
} as const;

type FilterMethod =
    | '='
    | '!='
    | 'LIKE'
    | 'NOT LIKE'
    | 'IN'
    | 'NOT IN'
    | 'DATES';

type OptionDescriptor = string | { users: string[] };
type SearchItemCfg = {
    key: string;
    name: string;
    methods: FilterMethod[];
    options?: OptionDescriptor[];
    default?: {
        method: FilterMethod;
        options: string | string[];
    };
};

export type ColumnCfgWithSearch = {
    name: string;
    default: string;
    render_template: string;
    search?: SearchItemCfg[];
};

type ServerDraftItem = {
    key: string;
    method: FilterMethod;
    values: string[];
};
type ServerDraftByCol = {
    selectedIdx: number | null;
    items: ServerDraftItem[];
};

type ServerAppliedByCol = {
    key: string;
    method: FilterMethod;
    values: string[];
} | null;

interface ColumnCell {
    name: string;
    value: any[];
}

export interface ApiRow {
    id_list: number[];
    group_by?: string[] | string;

    [columnKey: string]: any;
}
interface Action {
    action_name: string;
    action_type?: string;
    code_filename?: string;

    [key: string]: any;
}

export interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    structure: Record<string, { name: string; default: string; render_template: string }>;
    actions: Action[];
    group_by: string[];
    projects: string[];
}

export interface OptionType {
    value: number;
    label: string;
    preset: Preset;
}

export interface ActionOption {
    value: string;
    label: string;
    action: Action;
}

export interface ModuleType {
    id: number;
    project: string;
    filename: string;
    common_code: boolean;
    created_dt: string;

    [key: string]: any;
}

const CLEAR_ASSIGNEE_TOKEN = "__CLEAR_ASSIGNEE__";
const CLEAR_ASSIGNEE_LABEL = "Снять ответственного";

function isClearAssignee(v: unknown) {
    return String(v ?? "").trim() === CLEAR_ASSIGNEE_TOKEN;
}

type Props = {
    openedGroup: any[]
    setOpenedGroup: (openedGroup: any[]) => void
    phonesData: any
    setPhonesData: (phonesData: any) => void
    setGroupIDs: (groupIDs: any[]) => void
    selectedPreset: OptionType | null
    setSelectedPreset: (selectedPreset: OptionType | null) => void
    role: string
    currentPage: number
    setCurrentPage: (currentPage: number) => void
    startDate: Date | null
    setStartDate: (startDate: Date | null) => void
    endDate: Date | null
    setEndDate: (endDate: Date | null) => void
    selectedStatus: string | null
    setSelectedStatus: (selectedStatus: string | null) => void
    appliedLocalFilters: Record<string, string>;
    setAppliedLocalFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    appliedServerFilters: Record<string, ServerAppliedByCol>;
    setAppliedServerFilters: React.Dispatch<React.SetStateAction<Record<string, ServerAppliedByCol>>>;
    localFilterDraft: Record<string, string>;
    setLocalFilterDraft: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    serverFilterDraft: Record<string, ServerDraftByCol>;
    setServerFilterDraft: React.Dispatch<React.SetStateAction<Record<string, ServerDraftByCol>>>;
    unreadOnly: boolean;
    setUnreadOnly: React.Dispatch<React.SetStateAction<boolean>>;
}

function getMinIdForRow(row: ApiRow): number | null {
    const raw = Array.isArray(row?.id_list) ? row.id_list : [];
    const ids = raw
        .map((x: any) => Number(x))
        .filter((n) => Number.isFinite(n)) as number[];

    if (!ids.length) return null;

    let m = ids[0];
    for (let i = 1; i < ids.length; i++) if (ids[i] < m) m = ids[i];
    return Number.isFinite(m) ? m : null;
}

function getPresentByForRow(row: ApiRow, locks: Record<string, string>): string | null {
    for (const rawId of row.id_list || []) {
        const who = locks[String(rawId)];
        if (who) return who;
    }
    return null;
}

function getMinIdsForPage(rows: ApiRow[]): number[] {
    const set = new Set<number>();
    for (const r of rows) {
        const m = getMinIdForRow(r);
        if (m && m > 0) set.add(m);
    }
    return Array.from(set).sort((a, b) => a - b);
}

type GroupFactors = string[];

function normGroupBy(gb: any): GroupFactors {
    if (Array.isArray(gb)) return gb.map(v => String(v ?? "").trim()).filter(Boolean);
    if (typeof gb === "string") {
        const s = gb.trim();
        return s ? [s] : [];
    }
    return [];
}

function lockKeyVariants(factors: GroupFactors): string[] {
    const norm = factors.map(s => String(s ?? "").trim()).filter(Boolean);
    if (!norm.length) return [];

    const keys = [
        JSON.stringify(norm),      // самый надёжный
        norm.join("|"),
        norm.join("||"),
        norm.join(","),
        norm.join(";"),
    ];
    if (norm.length === 1) keys.unshift(norm[0]); // на случай если бэк ключует одиночкой строкой
    return keys;
}

function getLockIdForRow(row: ApiRow): number | null {

    return getMinIdForRow(row);
}

type LockMark = true | string;
type LocksMap = Record<string, LockMark>;

function getLockMarkForRow(row: ApiRow, locks: Record<string, LockMark>): LockMark | null {
    for (const rawId of row.id_list || []) {
        const v = locks[String(rawId)];
        if (v) return v;
    }
    return null;
}
const ROWS_PER_PAGE_KEY = 'tasksRowsPerPage';
const LS_SEARCH_TERM_KEY = 'tasksSearchTerm';
const LS_SELECTED_OPERATOR_KEY = 'tasksSelectedOperator';
const LS_UNREAD_ONLY_KEY = 'tasksUnreadOnly';
const LS_SORT_KEY = 'tasksSortConfig';
const LS_LOCAL_FILTERS_KEY = (presetId: number) => `tasksLocalFilters_${presetId}`;
const LS_SELECTED_STATUS_KEY = 'selectedStatus';

const DEFAULT_ROWS_PER_PAGE = 10;

function MethodLabel(m: FilterMethod) {
    switch (m) {
        case '=':
            return 'равно';
        case '!=':
            return 'не равно';
        case 'LIKE':
            return 'содержит';
        case 'NOT LIKE':
            return 'не содержит';
        case 'IN':
            return 'содержит любое из значений';
        case 'NOT IN':
            return 'не содержит ни одного из значений';
        case 'DATES':
            return 'диапазон дат';
        default:
            return m;
    }
}
type TabStateSnapshot = {
    rowsPerPage: number;
    currentPage: number;
    searchTerm: string;
    unreadOnly: boolean;
    sort: { key: string; direction: 'asc'|'desc' } | null;
    selectedOperator: string | null;
    selectedStatus: string | null;
    appliedLocalFilters: Record<string, string>;
    appliedServerFilters: Record<string, ServerAppliedByCol>;
    dateRange: { start: string | null; end: string | null };
};

const STORAGE_KEY_BASE = 'tasksTableState';

const getTzOffsetMinutes = () => -new Date().getTimezoneOffset();
const PresetSelectorTable: React.FC<Props> = ({
                                                  openedGroup,
                                                  setOpenedGroup,
                                                  setPhonesData,
                                                  phonesData,
                                                  setGroupIDs,
                                                  selectedPreset,
                                                  setSelectedPreset,
                                                  role,
                                                  currentPage,
                                                  setCurrentPage,
                                                  startDate,
                                                  setStartDate,
                                                  endDate,
                                                  setEndDate,
                                                  selectedStatus,
                                                  setSelectedStatus,
                                                  appliedLocalFilters,
                                                  setAppliedLocalFilters,
                                                  appliedServerFilters,
                                                  setAppliedServerFilters,
                                                  localFilterDraft,
                                                  setLocalFilterDraft,
                                                  serverFilterDraft,
                                                  setServerFilterDraft,
                                                  unreadOnly,
                                                  setUnreadOnly,
                                              }) => {

    const {monitorUsers} = useSelector(
        (state: RootState) => state.operator.monitorData
    );
    const scope = useMemo(() => makeScope(selectedPreset?.preset?.id), [selectedPreset?.preset?.id]);
    const lsKeyLast = useMemo(() => `${scope}:last`, [scope]);

    const isCardUrl = useMemo(() => {
        const sp = new URLSearchParams(window.location.search);
        return sp.get("card") === "1";
    }, []);


    const ssKey = useMemo(() => ({
        rowsPerPage: `${scope}:rowsPerPage`,
        searchTerm:  `${scope}:searchTerm`,
        unreadOnly:  `${scope}:unreadOnly`,
        sort:        `${scope}:sort`,
        selectedOp:  `${scope}:selectedOperator`,
        localFilters:`${scope}:localFilters`,
        serverFilters:`${scope}:serverFilters`,
        page:        `${scope}:page`,
    }), [scope]);

    const {
        sipLogin = '',
        worker = '',
        glagolParent = ''
    } = store.getState().credentials;
    const {sessionKey} = store.getState().operator

    const phonesCacheRef = useRef<Map<number, any>>(new Map());
    const inflightPhonesRef = useRef<Set<number>>(new Set());

    const [presets, setPresets] = useState<OptionType[]>([]);
    const [presetsLoaded, setPresetsLoaded] = useState(false);
    const [selectedActionOption, setSelectedActionOption] = useState<ActionOption | null>(null);
    const [tableData, setTableData] = useState<ApiRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [idProjectMap, setIdProjectMap] = useState<{ id: number; project_name: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc'|'desc' }|null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [selectedOperator, setSelectedOperator] = useState<string | null>(null);
    const [optionsSearch, setOptionsSearch] = useState<Record<string, string>>({});

    const [pageInput, setPageInput] = useState('1');
    const [openActionsRow, setOpenActionsRow] = useState<string | null>(null);
    const loadGroupedTimerRef = useRef<number | null>(null)

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenActionsRow(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const [tableLocks, setTableLocks] = useState<LocksMap>({});
    const locksPollRef = useRef<number | null>(null);
    const lastLocksSigRef = useRef<string>("");

    const [showLockedOnly, setShowLockedOnly] = useState(false);
    const [allLocks, setAllLocks] = useState<LocksMap>({});
    const [allLocksLoading, setAllLocksLoading] = useState(false);

    const normalizeLocksPayload = useCallback((payload: any): Record<string, LockMark> => {
        const out: Record<string, LockMark> = {};

        const put = (k: any, v: LockMark = true) => {
            const key = String(k ?? "").trim();
            if (!key) return;
            out[key] = typeof v === "string" ? v.trim() : true;
        };

        const putIds = (arr: any[], v: LockMark = true) => {
            for (const x of arr) {
                const n = Number(x);
                if (Number.isFinite(n)) put(n, v);
            }
        };

        if (!payload) return out;

        // вариант: { ids: [...] }
        const idsField = payload?.ids ?? payload?.data?.ids ?? payload?.result?.ids;
        if (Array.isArray(idsField)) {
            putIds(idsField, true);
            return out;
        }

        // вариант: просто массив (НОВЫЙ контракт)
        if (Array.isArray(payload)) {
            // массив чисел -> просто локи
            if (payload.every(x => Number.isFinite(Number(x)))) {
                putIds(payload, true);
                return out;
            }

            // массив объектов
            for (const item of payload) {
                if (item == null) continue;

                if (Number.isFinite(Number(item))) {
                    put(item, true);
                    continue;
                }

                if (typeof item === "object") {
                    // { id: 123, worker: "login" } или { ids:[..], worker:"login" }
                    const who = item.worker ?? item.sip_login ?? item.login ?? item.locked_by;
                    if (Array.isArray(item.ids)) { putIds(item.ids, who ? String(who) : true); continue; }
                    if (item.id != null) { put(item.id, who ? String(who) : true); continue; }

                    // fallback: { "15666": "login" } / { "15666": true }
                    for (const [k, v] of Object.entries(item)) {
                        if (typeof v === "string") put(k, v);
                        else if (v) put(k, true);
                    }
                }
            }
            return out;
        }

        // вариант: объект-мапа
        if (typeof payload === "object") {
            for (const [k, v] of Object.entries(payload)) {
                if (typeof v === "string") put(k, v);
                else if (v) put(k, true);
            }
        }

        return out;
    }, []);

    const fetchAllLocks = useCallback(async () => {
        if (!sessionKey || !worker) {
            setAllLocks({});
            return {};
        }

        setAllLocksLoading(true);

        return await new Promise<LocksMap>((resolve) => {
            let done = false;

            const finish = (map: LocksMap) => {
                if (done) return;
                done = true;
                setAllLocksLoading(false);
                setAllLocks(map);
                resolve(map);
            };

            const handler = (payload: any) => {
                socket.off("table_locks_all", handler);
                window.clearTimeout(tid);
                finish(normalizeLocksPayload(payload));
            };

            const tid = window.setTimeout(() => {
                socket.off("table_locks_all", handler);
                finish({});
            }, 6000);

            socket.on("table_locks_all", handler);

            socket.emit("table_locks_all", {
                session_key: sessionKey,
                worker,
            });
        });
    }, [sessionKey, worker, normalizeLocksPayload]);

    const pageBeforeSearchRef = useRef<number | null>(null);
    const wasSearchingRef = useRef(false);
    const requestSeqRef = useRef(0);
    const [rowsPerPage, setRowsPerPage] = useState<number>(() => {
        const n = Number(ssRead(ssKey.rowsPerPage, DEFAULT_ROWS_PER_PAGE));
        return Number.isFinite(n) && n > 0 ? n : DEFAULT_ROWS_PER_PAGE;
    });
    const [flatPhones, setFlatPhones] = useState<any[]>([])
    const [expressStates, setExpressStates] = useState<Record<string, ExpressState>>({});
    const [expressConfig, setExpressConfig] = useState<Record<string, any>>({});
    const operatorOptions = useMemo(() => {
        const entries = Object.entries(monitorUsers || {})
            .filter(([_, data]) => data.post_obrabotka === true);

        const currentOperatorEntry = entries.find(([login]) => login === sipLogin);
        const otherEntries = entries.filter(([login]) => login !== sipLogin);

        const currentOption = currentOperatorEntry
            ? {
                id: currentOperatorEntry[0],
                name: `${currentOperatorEntry[1].name} (${currentOperatorEntry[1].login})` || currentOperatorEntry[0]
            }
            : null;

        const otherOptions = otherEntries.map(([login, data]) => ({
            id: login,
            name: `${data.name} (${data.login})` || login
        }));

        return currentOption ? [currentOption, ...otherOptions] : otherOptions;
    }, [monitorUsers, sipLogin]);

    const [openExportMenu, setOpenExportMenu] = useState(false);
    const [exportSide, setExportSide] = useState<'left' | 'right'>('right');
    const exportMenuRef = useRef<HTMLDivElement | null>(null);

    const [modulesInFlight, setModulesInFlight] = useState(0);
    const modulesCompletedRef = useRef(0);
    const moduleStartTableRef = useRef(false)
    const afterModulesCallbackRef = useRef<null | (() => void)>(null);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalIds, setModalIds] = useState<number[]>([]);
    const [modalAction, setModalAction] = useState<Action | null>(null);

    const [statusOptions, setStatusOptions] = useState<string[]>([])
    const [modules, setModules] = useState<ModuleType[]>([]);

    const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);

    const [filterSide, setFilterSide] = useState<'left' | 'right'>('left');

    const [guidCounts, setGuidCounts] = useState<Record<string, { unread: number; total: number }>>({});
    const inflightGuidsRef = useRef<Set<string>>(new Set());

    const [loadError, setLoadError] = useState<string | null>(null);
    const [serverFiltersReady, setServerFiltersReady] = useState(false);

    const presetEpochRef = useRef(0);
    const blockFlatFetchRef = useRef(false);
    const lastFlatSigRef = useRef<string>('');

    const resetPhonesCache = useCallback(() => {
        phonesCacheRef.current.clear();
        inflightPhonesRef.current.clear();
        lastFlatSigRef.current = '';

        setFlatPhones([]);
        setPhonesData([]);
        setIdProjectMap([]);
    }, []);

    useLayoutEffect(() => {
        presetEpochRef.current += 1;
        requestSeqRef.current += 1;

        setServerFiltersReady(false);

        setTableData([]);
        setSelectedRows(new Set());
        setOpenActionsRow(null);

        setCurrentPage(1);
        setPageInput("1");

        resetPhonesCache();
    }, [selectedPreset?.preset?.id, resetPhonesCache, setCurrentPage]);

    const bytesToMB = (n: number) => (n / (1024 * 1024)).toFixed(1);

    function pickNiceErrorMessage(err: any): string {
        let raw = "";
        if (typeof err?.response?.data === "string") raw = err.response.data;
        else if (typeof err?.response?.data?.message === "string") raw = err.response.data.message;
        else if (typeof err?.response?.data?.detail === "string") raw = err.response.data.detail;
        else if (typeof err?.message === "string") raw = err.message;
        else raw = String(err ?? "");

        const text = (raw || "").toString();

        const oversize = text.match(/Sent message larger than max \((\d+)\s*vs\.\s*(\d+)\)/i);
        if (oversize) {
            const sent = Number(oversize[1]);
            const max  = Number(oversize[2]);
            return `Ответ слишком большой (${bytesToMB(sent)} МБ > лимита ${bytesToMB(max)} МБ). `
                + `Сузьте фильтры: диапазон дат, проекты, статусы или уменьшите выборку.`;
        }

        if (/StatusCode\.?RESOURCE_EXHAUSTED/i.test(text)) {
            return `Сервер отклонил запрос из-за объёма данных (RESOURCE_EXHAUSTED). `
                + `Сузьте фильтры: диапазон дат, проекты, статусы или уменьшите выборку.`;
        }

        if (/deadline exceeded|timeout/i.test(text)) {
            return `Сервер не ответил вовремя. Сузьте фильтры (диапазон дат/проект/статус) и повторите.`;
        }

        return `Не удалось загрузить данные. Сузьте фильтры (диапазон дат, проекты, статусы) и попробуйте снова.`;
    }


    const urlHydratedRef = useRef(false);

    const resetAllFiltersToDefaults = useCallback(() => {
        if (!selectedPreset) return;

        const presetId = selectedPreset.preset.id;
        const structure = (selectedPreset.preset.structure ?? {}) as Record<string, ColumnCfgWithSearch>;

        const defaults = buildAppliedFromDefaults(structure);

        setAppliedServerFilters(defaults);
        setAppliedLocalFilters({});
        setOpenFilterCol(null);
        ssWrite(ssKey.serverFilters, defaults);
        ssWrite(ssKey.localFilters, {});
        ssWrite(ssKey.page, 1);

        try {
            localStorage.setItem(serverFiltersKey(presetId), JSON.stringify(defaults));
            localStorage.setItem(serverFiltersDayKey(presetId), toYmd(new Date()));
            localStorage.setItem(LS_LOCAL_FILTERS_KEY(presetId), JSON.stringify({}));
        } catch {}

        // const extra = buildExtraFilterByFromMap(defaults);
        // loadGroupedPhones(extra);
    }, [selectedPreset, setAppliedServerFilters, setAppliedLocalFilters, ssKey]);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (!exportMenuRef.current) return;
            if (!exportMenuRef.current.contains(e.target as Node)) setOpenExportMenu(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenExportMenu(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const isColumnFiltered = useCallback(
        (colKey: string) =>
            Boolean((appliedLocalFilters[colKey] ?? '').trim()) ||
            Boolean(appliedServerFilters[colKey]),
        [appliedLocalFilters, appliedServerFilters]
    );


    const upsertFlatPhones = useCallback((items: any[]) => {
        if (!items || !items.length) return;
        const cache = phonesCacheRef.current;
        let changed = false;

        for (const it of items) {
            if (!cache.has(it.id)) changed = true;
            cache.set(it.id, it);
        }

        if (changed) {
            const arr = Array.from(cache.values());
            setFlatPhones(arr);
            setPhonesData(arr);
            setIdProjectMap(arr.map(p => ({ id: p.id, project_name: p.project })));
        }
    }, []);

    const buildBaseFilter = useCallback(() => {
        if (!selectedPreset) return {};
        const { preset } = selectedPreset;

        const projects = Array.isArray(preset.projects)
            ? preset.projects.map(String).filter(Boolean)
            : [];

        const base: any = {};
        if (projects.length) {
            base.project = ['IN', projects];
        }
        // серверные
        const extra = buildExtraFilterByFromMap(appliedServerFilters);
        Object.assign(base, extra);
        return base;
    }, [selectedPreset, appliedServerFilters]);

    useEffect(() => {
        if (!unreadOnly) return;

        const allGuids = new Set<string>();
        tableData.forEach(row => getGuidsForRow(row).forEach(g => g && allGuids.add(g)));

        const toFetch = Array.from(allGuids).filter(
            g => guidCounts[g] === undefined && !inflightGuidsRef.current.has(g)
        );

        void fetchCountsForGuids(toFetch.slice(0, 300));
    }, [unreadOnly, tableData, guidCounts]);

    useEffect(() => {
        ssWrite(ssKey.rowsPerPage, rowsPerPage);
        setCurrentPage(1);
    }, [rowsPerPage, setCurrentPage, ssKey.rowsPerPage]);
    useEffect(() => {
        const snap: TabStateSnapshot = {
            rowsPerPage,
            currentPage,
            searchTerm,
            unreadOnly,
            sort: sortConfig ?? null,
            selectedOperator: selectedOperator ?? null,
            selectedStatus: selectedStatus ?? null,
            appliedLocalFilters,
            appliedServerFilters,
            dateRange: {
                start: startDate ? toYmd(startDate) : null,
                end:   endDate   ? toYmd(endDate)   : null,
            },
        };
        lsWrite(lsKeyLast, snap);
    }, [
        rowsPerPage, currentPage, searchTerm, unreadOnly,
        sortConfig, selectedOperator, selectedStatus,
        appliedLocalFilters, appliedServerFilters,
        startDate?.getTime(), endDate?.getTime(),
        lsKeyLast
    ]);
    const hydratedFromLastRef = useRef(false);

    useLayoutEffect(() => {
        if (hydratedFromLastRef.current) return;
        const presetId = selectedPreset?.preset?.id;
        if (!presetId) return;

        // Есть ли уже что-то в sessionStorage у этой вкладки?
        const hasAnySS =
            !!sessionStorage.getItem(ssKey.serverFilters) ||
            !!sessionStorage.getItem(ssKey.localFilters)
        if (hasAnySS) {
            hydratedFromLastRef.current = true;
            return;
        }

        const last = lsRead<TabStateSnapshot | null>(lsKeyLast, null);
        if (last) {
            setAppliedServerFilters(last.appliedServerFilters || {});
            setAppliedLocalFilters(last.appliedLocalFilters || {});
            setSearchTerm(last.searchTerm ?? '');
            setUnreadOnly(Boolean(last.unreadOnly));
            setSortConfig(last.sort ?? null);
            setRowsPerPage(last.rowsPerPage ?? DEFAULT_ROWS_PER_PAGE);
            setSelectedOperator(last.selectedOperator ?? null);
            setCurrentPage(last.currentPage ?? 1);
            setSelectedStatus(last.selectedStatus ?? null);
            setStartDate(last.dateRange?.start ? parseYmd(last.dateRange.start) : null);
            setEndDate(last.dateRange?.end ? parseYmd(last.dateRange.end) : null);

            ssWrite(ssKey.serverFilters, last.appliedServerFilters || {});
            ssWrite(ssKey.localFilters,  last.appliedLocalFilters  || {});
            ssWrite(ssKey.searchTerm,    last.searchTerm ?? '');
            ssWrite(ssKey.unreadOnly,    Boolean(last.unreadOnly));
            ssWrite(ssKey.sort,          last.sort ?? null);
            ssWrite(ssKey.rowsPerPage,   last.rowsPerPage ?? DEFAULT_ROWS_PER_PAGE);
            ssWrite(ssKey.selectedOp,    last.selectedOperator ?? null);
            ssWrite(ssKey.page,          last.currentPage ?? 1);
        }

        hydratedFromLastRef.current = true;
    }, [selectedPreset?.preset?.id, ssKey, lsKeyLast]);

    useLayoutEffect(() => {
        if (!selectedPreset) {
            setColMinW({});
            return;
        }

        const next: Record<string, number> = {};

        const TH_PADDING_X = 16;

        Object.keys(selectedPreset.preset.structure).forEach((colKey) => {
            const el = headerRefs.current[colKey];
            if (!el) return;

            const w = Math.ceil(el.getBoundingClientRect().width) + TH_PADDING_X;

            next[colKey] = Math.min(getColW(colKey), w);
        });

        setColMinW(next);
    }, [
        selectedPreset?.preset?.id,
        sortConfig?.key,
        sortConfig?.direction,
        appliedLocalFilters,
        appliedServerFilters,
        unreadOnly,
    ]);

    const lockedRowsCount = useMemo(() => {
        if (!tableData?.length) return 0;
        let c = 0;
        for (const row of tableData) {
            if (getLockMarkForRow(row, allLocks)) c++;
        }
        return c;
    }, [tableData, allLocks]);

    useEffect(() => {
        const presetId = selectedPreset?.preset?.id;
        if (!presetId) return;

        const raw = localStorage.getItem(LS_LOCAL_FILTERS_KEY(presetId));
        if (!raw) {
            setAppliedLocalFilters({});
            return;
        }

        try {
            const parsed = JSON.parse(raw) as Record<string, string>;
            setAppliedLocalFilters(parsed && typeof parsed === 'object' ? parsed : {});
        } catch {
            setAppliedLocalFilters({});
        }
    }, [selectedPreset?.preset?.id]);

    const fetchFlatByIds = useCallback(
        async (ids: number[], withBaseFilter: boolean) => {
            if (!selectedPreset || !ids.length) return;

            const myEpoch = presetEpochRef.current;

            const need: number[] = [];
            const cache = phonesCacheRef.current;
            const inFlight = inflightPhonesRef.current;

            ids.forEach(id => {
                if (cache.has(id)) return;
                if (inFlight.has(id)) return;
                need.push(id);
            });

            if (!need.length) return;

            need.forEach(id => inFlight.add(id));

            try {
                const { preset } = selectedPreset;

                const filterFlat = withBaseFilter
                    ? { ...buildBaseFilter(), id: ['IN', need] }
                    : { id: ['IN', need] };

                const { data } = await axios.post<Record<string, any[]>>(
                    '/api/v1/grouped_contacts',
                    {
                        glagol_parent: glagolParent,
                        group_by: ['project'],
                        group_table: preset.group_table,
                        filter_by: filterFlat,
                        role,
                    }
                );

                if (myEpoch !== presetEpochRef.current) return;

                const flat = Object.values(data || {}).flat();
                upsertFlatPhones(flat);
            } catch (e) {
                console.error('fetchFlatByIds error', e);
            } finally {
                need.forEach(id => inFlight.delete(id));
            }
        },
        [selectedPreset?.preset?.group_table, role, buildBaseFilter, upsertFlatPhones]
    );

    useEffect(() => {
        const presetId = selectedPreset?.preset?.id;
        if (!presetId) return;
        const parsed = ssRead<Record<string, string> | null>(ssKey.localFilters, null);
        setAppliedLocalFilters(parsed && typeof parsed === 'object' ? parsed : {});
    }, [selectedPreset?.preset?.id, ssKey.localFilters]);

    useEffect(() => {
        const presetId = selectedPreset?.preset?.id;
        if (!presetId) return;
        ssWrite(ssKey.localFilters, appliedLocalFilters);
    }, [appliedLocalFilters, selectedPreset?.preset?.id, ssKey.localFilters]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedRows(new Set());
    }, [
        selectedPreset?.preset?.id,
        selectedStatus,
        selectedOperator,
        startDate?.getTime(),
        endDate?.getTime(),
        sortConfig?.key,
        sortConfig?.direction,
    ]);
    useEffect(() => {
        const v = ssRead<string | null>(ssKey.searchTerm, null);
        if (v !== null) setSearchTerm(v);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ssKey.searchTerm]);

    useEffect(() => {
        ssWrite(ssKey.searchTerm, searchTerm ?? '');
    }, [searchTerm, ssKey.searchTerm]);


    useEffect(() => {
        const v = ssRead<boolean | null>(ssKey.unreadOnly, null);
        if (v !== null) setUnreadOnly(Boolean(v));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ssKey.unreadOnly]);

    useEffect(() => {
        ssWrite(ssKey.unreadOnly, unreadOnly);
    }, [unreadOnly, ssKey.unreadOnly]);


    useEffect(() => {
        const parsed = ssRead<{ key: string; direction: 'asc'|'desc' } | null>(ssKey.sort, null);
        if (parsed && parsed.key && (parsed.direction === 'asc' || parsed.direction === 'desc')) setSortConfig(parsed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ssKey.sort]);

    useEffect(() => {
        if (sortConfig) ssWrite(ssKey.sort, sortConfig);
        else ssRemove(ssKey.sort);
    }, [sortConfig, ssKey.sort]);


    useEffect(() => {
        const saved = ssRead<string | null>(ssKey.selectedOp, null);
        if (!saved) return;
        if (operatorOptions.some(o => String(o.id) === saved)) setSelectedOperator(saved);
    }, [operatorOptions, setSelectedOperator, ssKey.selectedOp]);

    useEffect(() => {
        if (selectedOperator) ssWrite(ssKey.selectedOp, selectedOperator);
        else ssRemove(ssKey.selectedOp);
    }, [selectedOperator, ssKey.selectedOp]);

    useEffect(() => {
        const p = Number(ssRead<number | null>(ssKey.page, null));
        if (Number.isFinite(p) && p >= 1) setCurrentPage(p);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ssKey.page]);

    useEffect(() => {
        ssWrite(ssKey.page, currentPage);
    }, [currentPage, ssKey.page]);

    useEffect(() => {
        localStorage.setItem(LS_SEARCH_TERM_KEY, searchTerm ?? '');
    }, [searchTerm]);

    useEffect(() => {
        localStorage.setItem(LS_UNREAD_ONLY_KEY, unreadOnly ? '1' : '0');
    }, [unreadOnly]);

    useEffect(() => {
        if (sortConfig) localStorage.setItem(LS_SORT_KEY, JSON.stringify(sortConfig));
        else localStorage.removeItem(LS_SORT_KEY);
    }, [sortConfig?.key, sortConfig?.direction]);

    const getSortIcon = useCallback((key: string) => {
        if (!sortConfig || sortConfig.key !== key) return 'unfold_more';
        return sortConfig.direction === 'asc' ? 'north' : 'south';
    }, [sortConfig]);

    useEffect(() => {
        if (!presetsLoaded) return;
        if (!selectedPreset || !selectedPreset.preset?.id) return;

        const freshPreset = presets.find(p => p.preset.id === selectedPreset.preset.id);

        if (!freshPreset) {
            localStorage.removeItem('tasksSelectedPreset');
            return;
        }

        const isDifferent = JSON.stringify(freshPreset) !== JSON.stringify(selectedPreset);

        if (isDifferent) {
            setSelectedPreset(freshPreset);
            localStorage.setItem('tasksSelectedPreset', JSON.stringify(freshPreset));
        } else {
            localStorage.setItem('tasksSelectedPreset', JSON.stringify(selectedPreset));
        }
    }, [presets, presetsLoaded, selectedPreset]);

    useEffect(() => {
        const presetId = selectedPreset?.preset?.id;
        if (!presetId) { setServerFiltersReady(false); return; }

        const ssCur = ssRead<Record<string, ServerAppliedByCol> | null>(ssKey.serverFilters, null);
        if (ssCur) {
            setAppliedServerFilters(ssCur);
            setServerFiltersReady(true);
            return;
        }

        const lsKey  = serverFiltersKey(presetId);
        const dayKey = serverFiltersDayKey(presetId);
        const today  = toYmd(new Date());

        let initialApplied: Record<string, ServerAppliedByCol> | null = null;

        const savedDay = localStorage.getItem(dayKey);
        const savedRaw = localStorage.getItem(lsKey);
        if (savedRaw && savedDay === today) {
            try { initialApplied = JSON.parse(savedRaw); } catch {}
        }

        if (!initialApplied) {
            const structure = (selectedPreset?.preset?.structure ?? {}) as Record<string, ColumnCfgWithSearch>;
            initialApplied = buildAppliedFromDefaults(structure);
            localStorage.setItem(lsKey, JSON.stringify(initialApplied));
            localStorage.setItem(dayKey, today);
        }

        setAppliedServerFilters(initialApplied ?? {});
        ssWrite(ssKey.serverFilters, initialApplied ?? {});
        setServerFiltersReady(true);
    }, [selectedPreset?.preset?.id, ssKey.serverFilters]);

    useEffect(() => {
        if (!selectedPreset) return;
        if (!serverFiltersReady) return;

        // ✅ ВАЖНО: если URL уже в режиме карточки — таблица не должна стартовать тяжёлую загрузку
        if (isCardUrl) return;

        const bothNull = !startDate && !endDate;
        const bothSet  = !!startDate && !!endDate;
        if (!(bothNull || bothSet)) return;

        if (loadGroupedTimerRef.current) window.clearTimeout(loadGroupedTimerRef.current);

        loadGroupedTimerRef.current = window.setTimeout(() => {
            loadGroupedPhones();
        }, 0);

        return () => {
            if (loadGroupedTimerRef.current) {
                window.clearTimeout(loadGroupedTimerRef.current);
                loadGroupedTimerRef.current = null;
            }
        };
    }, [
        selectedPreset?.preset?.id,
        serverFiltersReady,
        startDate?.getTime(),
        endDate?.getTime(),
        selectedStatus,
        selectedOperator,
        appliedServerFilters,
        isCardUrl,
    ]);

    useEffect(() => {
        const structure = (selectedPreset?.preset?.structure ?? {}) as Record<string, ColumnCfgWithSearch>;

        const nextLocal: Record<string, string> = {};
        const nextServer: Record<string, ServerDraftByCol> = {};

        Object.entries(structure).forEach(([colKey, cfg]) => {
            nextLocal[colKey] = appliedLocalFilters[colKey] ?? '';

            if (Array.isArray(cfg.search) && cfg.search.length) {
                const applied = appliedServerFilters[colKey] || null;

                const items: ServerDraftItem[] = cfg.search.map(s => ({
                    key: s.key,
                    method: s.methods[0],
                    values: [],
                }));

                let selectedIdx: number | null = null;

                if (applied) {
                    const idx = cfg.search.findIndex(s => s.key === applied.key);
                    if (idx !== -1) {
                        selectedIdx = idx;
                        items[idx] = {
                            key: applied.key,
                            method: applied.method,
                            values: Array.isArray(applied.values) ? [...applied.values] : [],
                        };
                    }
                }

                nextServer[colKey] = { selectedIdx, items };
            }
        });

        setLocalFilterDraft(nextLocal);
        setServerFilterDraft(nextServer);
    }, [
        selectedPreset?.preset?.id,
        appliedLocalFilters,
        appliedServerFilters,
    ]);

    useEffect(() => {
        const isSearching = !!searchTerm?.trim();

        if (isSearching && !wasSearchingRef.current) {
            pageBeforeSearchRef.current = currentPage;
            setCurrentPage(1);
        }

        if (!isSearching && wasSearchingRef.current) {
            if (pageBeforeSearchRef.current && pageBeforeSearchRef.current > 0) {
                setCurrentPage(pageBeforeSearchRef.current);
            }
            pageBeforeSearchRef.current = null;
        }

        wasSearchingRef.current = isSearching;
    }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps


    const defaultStatusToState = useRef<boolean>(false)

    const operatorAccess = useSelector(selectOperatorAccess);
    const projectPool = useSelector(useMemo(() => makeSelectAccessibleProjectPool(sipLogin), [sipLogin]));
    const fullProjectNames = useMemo(
        () => Array.from(new Set(projectPool.map((p) => String(p?.project_name ?? "").trim()).filter(Boolean))),
        [projectPool]
    );
    const requestedProjectNames = useMemo(() => {
        const source =
            operatorAccess.allowedProjects.length
                ? operatorAccess.allowedProjects
                : operatorAccess.bootstrapProjects.length
                    ? operatorAccess.bootstrapProjects
                    : fullProjectNames;

        return Array.from(new Set(source.map(String).map((v) => v.trim()).filter(Boolean)));
    }, [fullProjectNames, operatorAccess.allowedProjects, operatorAccess.bootstrapProjects]);
    const allowedProjectNames = useMemo(() => {
        if (operatorAccess.presetIds !== null) {
            return Array.from(
                new Set(
                    presets.flatMap((presetOption) =>
                        normalizeStringArray(presetOption?.preset?.projects)
                    )
                )
            );
        }

        return requestedProjectNames;
    }, [operatorAccess.presetIds, presets, requestedProjectNames]);
    const selectedPresetProjectScope = useMemo(
        () => normalizeStringArray(selectedPreset?.preset?.projects),
        [selectedPreset]
    );
    const presetRequestProjects = useMemo(() => {
        const source = requestedProjectNames.length
            ? requestedProjectNames
            : selectedPresetProjectScope;

        return Array.from(new Set(source.map(String).map((v) => v.trim()).filter(Boolean)));
    }, [requestedProjectNames, selectedPresetProjectScope]);
    const presetRequestProjectsSig = useMemo(
        () => presetRequestProjects.join("\u001f"),
        [presetRequestProjects]
    );
    const stablePresetRequestProjects = useMemo(
        () => (presetRequestProjectsSig ? presetRequestProjectsSig.split("\u001f").filter(Boolean) : []),
        [presetRequestProjectsSig]
    );


    const buildExtraFilterByFromMap = (map: Record<string, ServerAppliedByCol>) => {
        const out: Record<string, any> = {};

        Object.entries(map).forEach(([_, item]) => {
            if (!item) return;
            const { key, method } = item;
            if (!key || !method) return;

            if (method === 'DATES') {
                const a = nonEmptyStr(item.values?.[0]);
                const b = nonEmptyStr(item.values?.[1]);
                if (!a && !b) return;

                if (isRealTimestampKey(key)) {
                    const s = parseYmd((a ?? b)!);
                    const e = parseYmd((b ?? a)!);
                    const startStr = formatWithTimezone(s <= e ? s : e, 'start');
                    const endStr   = formatWithTimezone(s <= e ? e : s, 'end');
                    out[key] = ['BETWEEN', [startStr, endStr]];
                } else {
                    const days = expandDateStrings(a ?? '', b ?? '');
                    if (days.length) out[key] = ['IN', days];
                }
                return;
            }

            if (method === 'IN' || method === 'NOT IN') {
                const list = sanitizeList(item.values);
                if (!list.length) return;

                const mapped = list.map(v => (v === NONE_TOKEN ? null : v));

                out[key] = [method, mapped] as any;
                return;
            }

            const raw = item.values?.[0];

            if (raw === NONE_TOKEN) {
                out[key] = [method, null] as any;
                return;
            }

            const v = nonEmptyStr(raw);
            if (v) out[key] = [method, v];
        });

        return out;
    };

    useEffect(() => {
        const list = tableData.map(group => group.id_list)
        setGroupIDs(list)
    }, [tableData])

    useEffect(() => {
        defaultStatusToState.current = false
    }, [selectedPreset])
    useEffect(() => {
        const handler = (payload: Record<string, ModuleType[]>) => {
            const allModules = Object.values(payload).flat();

            const uniqueMap = new Map<string, ModuleType>();
            allModules.forEach(mod => {
                if (!uniqueMap.has(mod.filename)) {
                    uniqueMap.set(mod.filename, mod);
                }
            });

            setModules(Array.from(uniqueMap.values()));
        };

        socket.on('get_modules', handler);

        if (allowedProjectNames.length) {
            socket.emit('get_modules', {
                projects: allowedProjectNames,
                session_key: sessionKey,
                worker,
            });
        }

        return () => {
            socket.off('get_modules', handler);
        };
    }, [allowedProjectNames, sessionKey, worker]);


    useEffect(() => {
        if (selectedPreset) {
            const projects = selectedPreset.preset.projects;

            Promise
                .allSettled(
                    projects.map(projectName =>
                        axios
                            .get<any>('/api/v1/express_configs', {
                                params: {
                                    glagol_parent: glagolParent,
                                    project_name: projectName
                                },
                                headers: {Accept: 'application/json'}
                            })
                            .then(response => ({
                                projectName,
                                config: response.data
                            }))
                    )
                )
                .then(results => {
                    const configMap: Record<string, any> = {};
                    results.forEach(result => {
                        if (result.status === 'fulfilled') {
                            configMap[result.value.projectName] = result.value.config;
                        } else {
                            console.warn('Failed to load config for project:', result.reason);
                        }
                    });
                    setExpressConfig(configMap);
                });
        }
    }, [role, selectedPreset]);


    useEffect(() => {
        if (!role || !operatorAccess.loaded) {
            setPresetsLoaded(false);
            return;
        }

        if (stablePresetRequestProjects.length === 0) {
            setPresets([]);
            setPresetsLoaded(true);
            setSelectedPreset(null);
            localStorage.removeItem('tasksSelectedPreset');
            return;
        }

        let cancelled = false;
        setPresetsLoaded(false);

        (async () => {
            const response = await axios.post<Preset[]>('/api/v1/get_preset_list', {
                glagol_parent: glagolParent,
                worker,
                projects: stablePresetRequestProjects,
                role
            });
            if (cancelled) return;
            const data: Preset[] = Array.isArray(response.data) ? response.data : [];
            const filteredData =
                operatorAccess.presetIds === null
                    ? data
                    : data.filter((preset) => (operatorAccess.presetIds ?? []).includes(Number(preset.id)));
            const presetOptions = filteredData.map(p => ({value: p.id, label: p.preset_name, preset: p}));
            setPresets(presetOptions);

            const savedRaw = localStorage.getItem('tasksSelectedPreset');
            if (savedRaw) {
                try {
                    const saved = JSON.parse(savedRaw) as OptionType;
                    const matched = presetOptions.find(p => p.preset.id === saved.preset.id);

                    if (matched) {
                        const currentSelectedId = selectedPreset?.preset?.id ?? null;
                        const currentStructure = JSON.stringify(selectedPreset?.preset?.structure ?? {});
                        const nextStructure = JSON.stringify(matched.preset.structure ?? {});

                        if (currentSelectedId !== matched.preset.id || currentStructure !== nextStructure) {
                            console.warn("Структура пресета обновилась — обновляем selectedPreset");
                            setSelectedPreset(matched);
                        }
                        localStorage.setItem('tasksSelectedPreset', JSON.stringify(matched));
                    } else {
                        setSelectedPreset(null);
                        localStorage.removeItem('tasksSelectedPreset');
                    }
                } catch (err) {
                    console.error("Ошибка разбора сохраненного пресета", err);
                    localStorage.removeItem('tasksSelectedPreset');
                }
            }
            setPresetsLoaded(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [glagolParent, operatorAccess.loaded, operatorAccess.presetIds, role, setSelectedPreset, stablePresetRequestProjects, worker]);

    const finishChain = () => {
        Swal.fire("Готово", "Действия выполнены", "success");
        loadSigRef.current = "";
        lastFlatSigRef.current = "";
        loadGroupedPhones();
    };

    function formatWithTimezone(date: Date, timePart: 'start' | 'end'): string {
        const offsetMinutes = date.getTimezoneOffset();
        const sign = offsetMinutes > 0 ? '-' : '+';
        const absOffset = Math.abs(offsetMinutes);
        const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
        const minutes = String(absOffset % 60).padStart(2, '0');
        const tz = `${sign}${hours}:${minutes}`;

        const base = format(date, 'yyyy-MM-dd');
        const time = timePart === 'start' ? 'T00:00:00' : 'T23:59:59';

        return `${base}${time}${tz}`;
    }

    function parseYmd(ymd: string): Date {
        const [y, m, d] = ymd.split('-').map(Number);
        return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
    }

    const serverFiltersKey = (presetId: number) => `tasksServerFilters_${presetId}`;
    const serverFiltersDayKey = (presetId: number) => `tasksServerFiltersDay_${presetId}`;

    function toYmd(d: Date): string {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    function resolveRelativeToken(token: string): string | null {
        const m = token.trim().toLowerCase().match(/^\{today(?:([+-]\d+))?\}$/);
        if (!m) return null;
        const delta = Number(m[1] ?? 0);
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        if (Number.isFinite(delta)) d.setDate(d.getDate() + delta);
        return toYmd(d);
    }

    function normalizeDefaultValues(
        method: FilterMethod,
        raw: string | string[],
        ctx?: any
    ): string[] {
        const materialize = (s: string) => resolveUserMacros(String(s ?? ''), ctx?.sipLogin ?? '');

        if (method === 'IN' || method === 'NOT IN') {
            const arr = Array.isArray(raw) ? raw : [String(raw ?? '').trim()].filter(Boolean);
            return arr.map(s => materialize(s));
        }
        if (method === 'DATES') {
            const arr = Array.isArray(raw) ? raw : [String(raw ?? '')];
            const [a, b] = [arr[0] ?? '', arr[1] ?? ''];
            const start = resolveRelativeToken(a) ?? a;
            const end   = resolveRelativeToken(b) ?? b;
            if (!start && !end) return [];
            return [start || end, end || start];
        }
        const one = Array.isArray(raw) ? (raw[0] ?? '') : String(raw ?? '');
        const rel = resolveRelativeToken(one);
        return [materialize(rel ?? one)];
    }

    function buildAppliedFromDefaults(structure: Record<string, ColumnCfgWithSearch>): Record<string, ServerAppliedByCol> {
        const out: Record<string, ServerAppliedByCol> = {};
        const { monitorUsers } = (store.getState() as RootState).operator.monitorData || { monitorUsers: {} };
        const { sipLogin = '' } = store.getState().credentials;

        Object.entries(structure || {}).forEach(([colKey, cfg]) => {
            const arr = (cfg.search ?? []) as (SearchItemCfg & { default?: any })[];
            if (!arr.length) { out[colKey] = null; return; }

            const withDefaultIdx = arr.findIndex(s => !!s.default);
            if (withDefaultIdx === -1) { out[colKey] = null; return; }

            const item = arr[withDefaultIdx];
            const method = item.default!.method as FilterMethod;
            let values = normalizeDefaultValues(method, item.default!.options, { sipLogin, monitorUsers });

            const depts = extractUsersDepartments(item.options);
            if (depts) {
                values = values.map(v => {
                    if (v && !/^\d+$/.test(v) && sipLogin) return sipLogin;
                    return v;
                });
            }

            out[colKey] = { key: item.key, method, values };
        });
        return out;
    }

    function addDays(date: Date, days: number): Date {
        const dt = new Date(date);
        dt.setDate(dt.getDate() + days);
        return dt;
    }

    function expandDateStrings(startYmd: string, endYmd: string): string[] {
        if (!startYmd && !endYmd) return [];
        const s = parseYmd(startYmd || endYmd);
        const e = parseYmd(endYmd || startYmd);
        const start = s <= e ? s : e;
        const end = s <= e ? e : s;

        const out: string[] = [];
        const seen = new Set<string>();

        for (let dt = start; dt <= end; dt = addDays(dt, 1)) {
            const yyyy = String(dt.getFullYear());
            const mm = String(dt.getMonth() + 1).padStart(2, '0');
            const dd = String(dt.getDate()).padStart(2, '0');

            const ymd = `${yyyy}-${mm}-${dd}`;

            for (const v of dateVariantsFromYmd(ymd)) {
                if (!v) continue;
                if (seen.has(v)) continue;
                seen.add(v);
                out.push(v);
            }
        }

        return out;
    }

    function dateVariantsFromYmd(ymd: string): string[] {
        const m = String(ymd ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return [String(ymd ?? '').trim()].filter(Boolean);

        const [, yyyy, mm, dd] = m;

        return [
            `${yyyy}-${mm}-${dd}`,
            `${dd}.${mm}.${yyyy}`,
            `${dd}/${mm}/${yyyy}`,
            `${yyyy}/${mm}/${dd}`,
        ];
    }

    function isRealTimestampKey(key: string): boolean {
        const k = (key || '').toLowerCase();
        return /\b(created_dt|next_call_dt|deadline|deadline_dt|deadline_date)\b/.test(k);
    }

    function sanitizeList(vals: unknown): string[] {
        const arr = Array.isArray(vals) ? vals : [];
        const normed = arr
            .map(v => toStateValue(v))
            .filter(s => s.length > 0);

        return Array.from(new Set(normed));
    }

    function nonEmptyStr(val: unknown): string | null {
        const s = String(val ?? '').trim();
        return s.length ? s : null;
    }

    function coerceAppliedFromDraft(item: ServerDraftItem): ServerAppliedByCol {
        const { key, method } = item;

        if (method === 'IN' || method === 'NOT IN') {
            const list = sanitizeList(item.values);
            return list.length ? { key, method, values: list } : null;
        }

        if (method === 'DATES') {
            const a = nonEmptyStr(item.values?.[0]);
            const b = nonEmptyStr(item.values?.[1]);
            return (a || b) ? { key, method, values: [a ?? '', b ?? ''] } : null;
        }

        if (!item.values || item.values.length === 0) return null;

        const raw = String(item.values?.[0] ?? '');
        const normalized = toStateValue(raw);

        return normalized ? { key, method, values: [normalized] } : null;
    }

    useEffect(() => {
        const saved = localStorage.getItem('selectedStatus');
        if (saved === null) {
            return;
        }

        if (statusOptions.length && !statusOptions.includes(saved)) {
            setSelectedStatus(null);
        } else {
            setSelectedStatus(saved);
        }
    }, [statusOptions]);

    const loadGroupedPhones = async (extraFilterBy?: Record<string, any>) => {
        if (!selectedPreset) {
            blockFlatFetchRef.current = false;
            setTableData([]);
            setSelectedActionOption(null);
            return;
        }

        const stableStringify = (obj: any) => {
            if (!obj || typeof obj !== "object") return JSON.stringify(obj);
            if (Array.isArray(obj)) return JSON.stringify(obj);
            const keys = Object.keys(obj).sort();
            const out: any = {};
            for (const k of keys) out[k] = obj[k];
            return JSON.stringify(out);
        };

        const { preset } = selectedPreset;

        const base = buildBaseFilter();
        const filterBy: any = extraFilterBy ? { ...base, ...extraFilterBy } : base;

        const sig = [
            String(preset.id),
            String(preset.group_table),
            String(glagolParent ?? ""),
            String(role ?? ""),
            String(getTzOffsetMinutes()),
            stableStringify(filterBy),
        ].join("|");

        if (sig === loadSigRef.current) {
            return;
        }
        loadSigRef.current = sig;

        loadAbortRef.current?.abort();
        const ac = new AbortController();
        loadAbortRef.current = ac;

        blockFlatFetchRef.current = true;

        const mySeq = ++requestSeqRef.current;
        setLoading(true);
        setLoadError(null);

        try {
            resetPhonesCache();

            const response1 = await axios.post<ApiRow[]>(
                "/api/v1/grouped_contacts",
                {
                    glagol_parent: glagolParent,
                    group_table: preset.group_table,
                    filter_by: filterBy,
                    preset_id: preset.id,
                    role,
                    tz_offset: getTzOffsetMinutes(),
                },
                { signal: ac.signal }
            );

            if (requestSeqRef.current !== mySeq) return;

            setTableData(response1.data);
            setSelectedActionOption(null);

            if (response1.data.length < 11) setCurrentPage(1);
            setSortConfig(null);
            setSelectedRows(new Set());
        } catch (err: any) {
            if (err?.name === "CanceledError" || err?.code === "ERR_CANCELED") return;

            if (requestSeqRef.current === mySeq) {
                const nice = pickNiceErrorMessage(err);

                setTableData([]);
                resetPhonesCache();
                setSelectedRows(new Set());
                setCurrentPage(1);
                setLoadError(nice);
                Swal.fire("Ошибка загрузки", nice, "error");

                console.error("Ошибка загрузки данных:", err);
            }
        } finally {
            if (loadAbortRef.current === ac) loadAbortRef.current = null;

            if (requestSeqRef.current === mySeq) {
                blockFlatFetchRef.current = false;
                setLoading(false);
            }
        }
    };


    const loadSigRef = useRef<string>("");
    const loadAbortRef = useRef<AbortController | null>(null);

    const makeLoadSig = (extra?: Record<string, any>) => {
        const presetId = selectedPreset?.preset?.id ?? "none";
        const s = startDate ? toYmd(startDate) : "";
        const e = endDate ? toYmd(endDate) : "";

        const srv = JSON.stringify(appliedServerFilters ?? {});
        const ex  = JSON.stringify(extra ?? {});
        return [presetId, serverFiltersReady ? "1" : "0", s, e, selectedStatus ?? "", selectedOperator ?? "", srv, ex].join("|");
    };


    function readUserDepartments(u: any): string[] {
        // пытаемся найти поле с отделом(ами)
        const raw =
            u?.department ??
            u?.departments ??
            u?.otdel ??
            u?.dept ??
            u?.team ??
            u?.group ??
            u?.division ??
            null;

        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(String);
        return String(raw).split(",").map(s => s.trim()).filter(Boolean);
    }

    const hydrateByIds = useCallback(
        async (ids: number[]) => {
            await fetchFlatByIds(ids, false);
        },
        [fetchFlatByIds]
    );

    useEffect(() => {
        // Уже инициализировались — выходим
        if (urlHydratedRef.current) return;

        const sp = new URLSearchParams(window.location.search);
        if (sp.get("card") !== "1") return;

        // Разобрали ids из URL
        const ids = (sp.get("ids") || "")
            .split(",")
            .map(s => parseInt(s, 10))
            .filter(n => Number.isFinite(n));
        if (!ids.length) return;

        const pid = sp.get("pid");
        if (pid && presets.length) {
            const matched = presets.find(p => String(p.preset.id) === pid);
            if (matched && (!selectedPreset || matched.preset.id !== selectedPreset.preset.id)) {
                setSelectedPreset(matched);
                return;
            }
        }

        if (!selectedPreset) return;

        setOpenedGroup(ids);
        void hydrateByIds(ids);

        urlHydratedRef.current = true;
    }, [presets, selectedPreset, hydrateByIds]);

    function readUserProjects(u: any): string[] {
        const raw = u?.projects ?? u?.projects_names ?? null;
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.map(String);
        return String(raw).split(",").map(s => s.trim()).filter(Boolean);
    }

    function userMatchesDepartments(u: any, wanted: string[] | null): boolean {
        if (!wanted || !wanted.length) return true;
        const deps = readUserDepartments(u).map(d => d.toLowerCase());
        return wanted.some(w => deps.includes(String(w).toLowerCase()));
    }

    function userMatchesProjects(u: any, presetProjects: string[]): boolean {
        const up = readUserProjects(u);
        if (!up.length) return true; // нет инфы — не режем
        const set = new Set(up.map(String));
        return presetProjects.some(p => set.has(String(p)));
    }

    function buildUserOptionsByDepartments(
        monitorUsers: Record<string, any> | undefined,
        departments: string[] | null,
        presetProjects: string[] = [],
    ): { label: string; value: string }[] {
        if (!monitorUsers) return [];
        const out: { label: string; value: string }[] = [];

        Object.entries(monitorUsers).forEach(([login, u]) => {
            // login может быть и в u.login, но надёжнее ключ
            if (!userMatchesDepartments(u, departments)) return;
            if (!userMatchesProjects(u, presetProjects)) return;

            const name = (u?.name && String(u.name).trim()) || String(login);
            out.push({ label: `${name} (${login})`, value: String(login) });
        });

        out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
        return out;
    }

    function resolveUserMacros(token: string, sipLogin: string): string {
        const low = token.toLowerCase().trim();
        if (low === "{user.login}" || low === "{user.name}") return String(sipLogin || "");
        return token;
    }
    const actionOptions: ActionOption[] = useMemo(() => {
        if (!selectedPreset) return [];
        return selectedPreset.preset.actions.map(act => ({
            value: act.action_name,
            label: act.action_name,
            action: act
        }));
    }, [selectedPreset]);
    const isReloadingRef = useRef(false);

    const triggerGroupedPhonesReload = () => {
        if (isReloadingRef.current) return;

        isReloadingRef.current = true;
        loadGroupedPhones();

        setTimeout(() => {
            isReloadingRef.current = false;
        }, 2000);
    };

    useEffect(() => {
        if (modalOpen || modulesInFlight === 0 || !moduleStartTableRef.current) return
        const handleComplete = () => {
            modulesCompletedRef.current += 1;
            if (modulesCompletedRef.current >= modulesInFlight) {
                Swal.fire("Готово", "Все модули завершены", "success");
                moduleStartTableRef.current = false;
                modulesCompletedRef.current = 0;
                setModulesInFlight(0);

                const cb = afterModulesCallbackRef.current;
                afterModulesCallbackRef.current = null;
                if (cb) {
                    cb();
                } else {
                    finishChain();
                }

            }
        };

        const onRunModuleSuccess = (data: any) => {
            handleComplete();
        };

        const onRunModuleError = (data: any) => {
            console.warn("❌ run_module_error:", data);
            handleComplete();
        };

        socket.on("run_module", onRunModuleSuccess);
        socket.on("error", onRunModuleError);

        return () => {
            socket.off("run_module", onRunModuleSuccess);
            socket.off("error", onRunModuleError);
        };
    }, [modulesInFlight]);

    const processRows = (rows: ApiRow[], opt: ActionOption, operator?: string) => {
        if (!opt?.action) return;

        const steps = extractActionSteps(opt.action);
        if (!steps.length) return;

        const allIds = rows.flatMap(r => r.id_list);
        const idToProject = idProjectMap.reduce<Record<number, string>>((acc, { id, project_name }) => {
            acc[id] = project_name; return acc;
        }, {});
        const groups = allIds.reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id] || "unknown";
            (acc[proj] ||= []).push(id);
            return acc;
        }, {});

        const runStep = (i: number) => {
            if (i >= steps.length) {
                finishChain();
                return;
            }
            const step = steps[i];

            switch (step.type) {
                case "assign": {
                    if (typeof operator === "undefined") {
                        Swal.fire("Ошибка", "Выберите ответственного или вариант сброса", "error");
                        return;
                    }

                    const reqs: Promise<any>[] = [];
                    const managerValue = isClearAssignee(operator) ? null : String(operator).trim();

                    Object.entries(groups).forEach(([project_name, ids]) => {
                        if (!selectedPreset?.preset.group_by) return;

                        const sample = flatPhones.find(p => p.id === ids[0]);
                        const filter_by: Record<string, any> = {};

                        selectedPreset.preset.group_by.forEach(k => {
                            if (sample && k in sample) filter_by[k] = sample[k];
                        });

                        reqs.push(
                            axios.put('/api/v1/phones/update', {
                                glagol_parent: glagolParent,
                                project_name,
                                filter_by,
                                update: {
                                    manager: managerValue,
                                },
                            }).catch(() => null)
                        );
                    });

                    Promise.allSettled(reqs).then(() => runStep(i + 1));
                    break;
                }

                case "delete": {
                    Object.entries(groups).forEach(([project_name, ids]) => {
                        socket.emit("delete_phone", {worker, session_key: sessionKey, project_name, ids});
                    });
                    runStep(i + 1);
                    break;
                }

                case "code": {
                    const target = String(step.code_filename || '').replace(/\.py$/, '');
                    const found = modules.find(m => m.filename.replace(/\.py$/, '') === target);
                    if (!found) {
                        Swal.fire('Ошибка', `Модуль "${step.code_filename}" не найден.`, 'error');
                        return;
                    }

                    type KwargDef = { source: string; default?: string };
                    const argDefs = Object.values(found.kwargs || {}) as KwargDef[];

                    let pending = 0;
                    Object.entries(groups).forEach(([project_name, ids]) => {
                        const byArgs = new Map<string, { ids: number[]; kwargs: Record<string, string> }>();

                        ids.forEach(id => {
                            const contact = phonesData.find((p: any) => p.id === id);
                            const ci = contact?.contact_info ?? {};
                            const kwargs: Record<string, string> = {};
                            argDefs.forEach(({source, default: def}) => {
                                if (!source) return;
                                const v = ci[source];
                                kwargs[source] = (v ?? def ?? '') as string;
                            });

                            const key = JSON.stringify(kwargs);
                            if (!byArgs.has(key)) byArgs.set(key, {ids: [], kwargs});
                            byArgs.get(key)!.ids.push(id);
                        });

                        byArgs.forEach(({kwargs}) => {
                            pending += 1;
                            socket.emit('run_module', {
                                uuid: "", b_uuid: "", worker, session_key: sessionKey,
                                projects: {[project_name]: kwargs},
                                filename: target,
                                common_code: found.common_code,
                            });
                        });
                    });

                    if (pending > 0) {
                        moduleStartTableRef.current = true;
                        setModulesInFlight(pending);
                        modulesCompletedRef.current = 0;
                        afterModulesCallbackRef.current = () => runStep(i + 1);
                    } else {
                        runStep(i + 1);
                    }
                    break;
                }

                // case "activate": {
                //     const reqs = (selectedPreset?.preset.projects || []).map(project =>
                //         axios.post('/api/v1/start_express', {
                //             glagol_parent: 'fs.at.akc24.ru',
                //             project_name: project
                //         }).catch(() => null)
                //     );
                //     Promise.allSettled(reqs).then(() => runStep(i + 1));
                //     break;
                // }

                default:
                    runStep(i + 1);
            }
        };

        runStep(0);
    };


    const handleBulkProcess = (
        rows: ApiRow[],
        actionOpt?: ActionOption,
        isRowClick: boolean = false
    ) => {
        const opt = actionOpt ?? selectedActionOption;

        if (!opt && !isRowClick) {
            return Swal.fire("Ошибка", "Выберите действие в шапке", "error");
        }

        if (rows.length === 0) {
            return Swal.fire("Нечего обрабатывать", "Отметьте хотя бы одну строку", "info");
        }

        if (isRowClick && rows.length === 1 && rows[0].id_list.length === 1) {
            return processRows(rows, opt!);
        }

        const steps = actionOpt ? extractActionSteps(actionOpt.action) : [];
        const needsModal = steps.some(s => s.type !== 'assign');
        if (rows.length === 1 && rows[0].id_list.length > 1 && needsModal) {
            setModalIds(rows[0].id_list);
            setModalAction(actionOpt!.action);
            setModalOpen(true);
            return;
        }


        processRows(rows, opt!);
    };


    const processedRows = useMemo(() => {
        if (!selectedPreset) return [];

        let result = tableData;

        const activeLocal = Object.entries(appliedLocalFilters)
            .map(([colKey, val]) => [colKey, (val ?? '').trim().toLowerCase()] as const)
            .filter(([, v]) => v.length > 0);

        if (activeLocal.length) {
            result = result.filter(row =>
                activeLocal.every(([colKey, needle]) => {
                    const cell = row[colKey] as ColumnCell | undefined;
                    if (!cell || !Array.isArray(cell.value)) return false;
                    const hay = cell.value.join(' ').toLowerCase();
                    return hay.includes(needle);
                })
            );
        }

        const term = (searchTerm ?? '').toLowerCase().trim();
        if (term) {
            result = result.filter(row =>
                Object.keys(selectedPreset.preset.structure).some(colKey => {
                    const cell = row[colKey] as ColumnCell | undefined;
                    if (!cell || !cell.value) return false;
                    return cell.value.join(' ').toLowerCase().includes(term);
                })
            );
        }

        if (unreadOnly) {
            result = result.filter(row => getRowMsgInfo(row).sumUnread > 0);
        }

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const aCell = a[sortConfig.key] as ColumnCell | undefined;
                const bCell = b[sortConfig.key] as ColumnCell | undefined;
                const aStr = aCell?.value?.join(' ') ?? '';
                const bStr = bCell?.value?.join(' ') ?? '';
                if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        if (showLockedOnly) {
            result = result.filter(row => !!getLockMarkForRow(row, allLocks));
        }

        return result;
    }, [
        tableData,
        phonesData,
        searchTerm,
        sortConfig,
        selectedPreset,
        appliedLocalFilters,
        unreadOnly,
        guidCounts,
        showLockedOnly,
        allLocks
    ]);

    const TOP_HSCROLL_H = 16;

    const topHScrollRef = useRef<HTMLDivElement>(null);
    const gridScrollRef = useRef<HTMLDivElement>(null);
    const tableRef      = useRef<HTMLTableElement>(null);
    const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});

    const [colMinW, setColMinW] = useState<Record<string, number>>({});
    const [contentWidth, setContentWidth] = useState(0);
    const [viewportW, setViewportW] = useState(0);
    const [needsHScroll, setNeedsHScroll] = useState(false);
    const [scrollLeft, setScrollLeft] = useState(0);

    const isDraggingRef = useRef(false);
    const dragStartXRef = useRef(0);
    const dragStartLeftRef = useRef(0);

    const stickyTop = needsHScroll ? TOP_HSCROLL_H : 0;

    useEffect(() => {
        const update = () => {
            const contentW  = tableRef.current?.scrollWidth || 0;
            const viewport  = gridScrollRef.current?.clientWidth || 0;
            setContentWidth(contentW);
            setViewportW(viewport);
            setNeedsHScroll(contentW > viewport + 1);
        };
        update();

        let ro1: ResizeObserver | null = null;
        let ro2: ResizeObserver | null = null;

        if ('ResizeObserver' in window) {
            if (tableRef.current)  { ro1 = new ResizeObserver(update); ro1.observe(tableRef.current); }
            if (gridScrollRef.current) { ro2 = new ResizeObserver(update); ro2.observe(gridScrollRef.current); }
        }
        window.addEventListener('resize', update);
        return () => {
            ro1?.disconnect?.(); ro2?.disconnect?.();
            window.removeEventListener('resize', update);
        };
    }, [selectedPreset?.preset?.id, processedRows.length]);

    const syncScroll = (from: 'top' | 'body') => {
        if (!gridScrollRef.current) return;
        if (from === 'body') {
            setScrollLeft(gridScrollRef.current.scrollLeft);
        } else {
            gridScrollRef.current.scrollLeft = scrollLeft;
        }
    };

    const totalPages = Math.max(1, Math.ceil(processedRows.length / rowsPerPage));
    const paginatedRows = useMemo(() => {
        return processedRows.slice(
            (currentPage - 1) * rowsPerPage,
            currentPage * rowsPerPage
        );
    }, [processedRows, currentPage, rowsPerPage]);

    const locksPageIds = useMemo(() => {
        const set = new Set<number>();
        for (const row of paginatedRows) {
            for (const rawId of row.id_list || []) {
                const n = Number(rawId);
                if (Number.isFinite(n) && n > 0) set.add(n);
            }
        }
        return Array.from(set).sort((a, b) => a - b);
    }, [paginatedRows]);

    const locksPageSig = useMemo(() => locksPageIds.join(","), [locksPageIds]);
    // useEffect(() => {
    //     if (!selectedPreset || !paginatedRows.length) return;
    //
    //     const idsOnPage = Array.from(
    //         new Set(paginatedRows.flatMap(r => r.id_list))
    //     );
    //
    //     void fetchFlatByIds(idsOnPage, true);
    // }, [paginatedRows, selectedPreset?.preset?.id, role, fetchFlatByIds]);
    //
    //
    // useEffect(() => {
    //     if (!selectedPreset || selectedRows.size === 0) return;
    //
    //     const wantedIds = Array.from(selectedRows)
    //         .flatMap(key => key.split(',').map(n => Number(n)))
    //         .filter(Boolean);
    //
    //     void fetchFlatByIds(wantedIds, true);
    // }, [selectedRows, selectedPreset?.preset?.id, role, fetchFlatByIds]);

    useEffect(() => {
        if (!selectedPreset) return;

        if (blockFlatFetchRef.current) return;

        const idsOnPage = paginatedRows.length
            ? Array.from(new Set(paginatedRows.flatMap(r => r.id_list)))
            : [];

        const idsFromSelected = selectedRows.size
            ? Array.from(new Set(
                Array.from(selectedRows)
                    .flatMap(k => k.split(',').map(n => Number(n)))
                    .filter(n => Number.isFinite(n) && n > 0)
            ))
            : [];

        const ids = Array.from(new Set([...idsOnPage, ...idsFromSelected]));
        if (!ids.length) return;

        const sig = ids.slice().sort((a, b) => a - b).join(',');
        if (sig === lastFlatSigRef.current) return;
        lastFlatSigRef.current = sig;

        void fetchFlatByIds(ids, true);
    }, [
        selectedPreset?.preset?.id,
        paginatedRows,
        selectedRows,
        role,
        fetchFlatByIds,
    ]);

    const totalRowsCount = processedRows.length;
    const showingFrom = totalRowsCount ? (currentPage - 1) * rowsPerPage + 1 : 0;
    const showingTo = totalRowsCount ? Math.min(currentPage * rowsPerPage, totalRowsCount) : 0;

    const toggleSort = (colKey: string) => {
        setSortConfig(prev => {
            if (!prev || prev.key !== colKey) return { key: colKey, direction: 'asc' };
            // если тот же столбец, инвертируем
            return { key: colKey, direction: prev.direction==='asc' ? 'desc' : 'asc' };
        });
    };

    const toggleSelectAll = () => {
        const allKeys = paginatedRows.map(r => r.id_list.join(','));
        const newSet = new Set(selectedRows);
        const allSelected = allKeys.every(k => newSet.has(k));
        if (allSelected) {
            allKeys.forEach(k => newSet.delete(k));
        } else {
            allKeys.forEach(k => newSet.add(k));
        }
        setSelectedRows(newSet);
    };

    const toggleRow = (rowKey: string) => {
        const newSet = new Set(selectedRows);
        if (newSet.has(rowKey)) newSet.delete(rowKey);
        else newSet.add(rowKey);
        setSelectedRows(newSet);
    };

    const findNameProject = (projectName: string) => {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

    const fetchStatuses = async () => {
        const result: Record<string, ExpressState> = {};

        const configEntries = Object.entries(expressConfig);
        if (configEntries.length === 0) return;

        const ids = configEntries.map(([_, cfg]) => cfg.express_config.id);

        try {
            const response = await axios.get('/api/v1/express_agents_statuses', {
                params: { ids, glagolParent },
                paramsSerializer: (params) => {
                    const parts: string[] = [];

                    if (Array.isArray(params.ids)) {
                        parts.push(
                            ...params.ids.map((id: number) => `ids=${encodeURIComponent(id)}`)
                        );
                    }

                    if (params.glagolParent) {
                        parts.push(`glagol_parent=${encodeURIComponent(params.glagolParent)}`);
                    }

                    return parts.join('&');
                },
            });

            const {
                operators = {},
                statuses = {}
            }: {
                operators: Record<string, string[]>,
                statuses: Record<string, { active: boolean, active_calls: number }>
            } = response.data;

            for (const [project, cfg] of configEntries) {
                const express_id = cfg.express_config.id;
                const idStr = String(express_id);

                const status = statuses[idStr];
                const agents = operators[idStr];

                if (!status) continue;

                result[project] = {
                    project,
                    express_id,
                    active: status.active,
                    calls: status.active_calls,
                    agents: agents || []
                };
            }

            setExpressStates(result);
        } catch (err) {
            console.error("Ошибка при получении express_agents_statuses:", err);
        }
    };


    const handleStartExpress = async (project: string) => {
        await axios.post('/api/v1/start_express', {
            glagol_parent: glagolParent,
            project_name: project
        });
        await fetchStatuses();
    };

    const handleStopExpress = async (project: string, express_id: number) => {
        await axios.post('/api/v1/stop_express', {
            glagol_parent: glagolParent,
            project_name: project
        });
        await fetchStatuses();
    };

    const hasSipLogin = !!sipLogin?.trim();
    const loginForUnread = hasSipLogin ? sipLogin : "client";

    function getGuidFromPhone(p: any): string | null {
        return (
            (p?.contact_info?.guid && String(p.contact_info.guid)) ||
            (p?.guid && String(p.guid)) ||
            (p?.b_uuid && String(p.b_uuid)) ||
            (p?.uuid && String(p.uuid)) ||
            null
        );
    }

    function getGuidsForRow(row: ApiRow): string[] {
        const ids = row.id_list || [];
        const guids = new Set<string>();
        ids.forEach((id) => {
            const item = (phonesData || []).find((x: any) => x.id === id);
            const g = item ? getGuidFromPhone(item) : null;
            if (g) guids.add(String(g));
        });
        return Array.from(guids);
    }

    function extractCounts(resp: any, hasSip: boolean, login: string) {
        let unread = 0;
        if (hasSip) {
            unread = Number(resp?.unwatched?.[login] ?? 0);

        } else {
            const clientTop = Number(resp?.client ?? 0);
            const clientInUnwatched = Number(resp?.unwatched?.client ?? 0);
            unread = clientTop || clientInUnwatched || 0;
        }

        const total =
            Number(
                resp?.total_messages ??
                resp?.total ??
                resp?.all ??
                resp?.messages ??
                resp?.all_messages ??
                resp?.count
            ) || 0;

        return {unread, total};
    }

    const repeatParams = (p: { guid?: string[]; logins?: string[] }) => {
        const parts: string[] = [];
        if (Array.isArray(p.guid))   parts.push(...p.guid.map(g => `guid=${encodeURIComponent(g)}`));
        if (Array.isArray(p.logins)) parts.push(...p.logins.map(l => `logins=${encodeURIComponent(l)}`));
        return parts.join("&");
    };

    async function fetchCountsForGuids(guids: string[]) {
        const list = Array.from(new Set(guids.filter(Boolean)));
        if (!list.length) return;

        const need = list.filter(
            g => guidCounts[g] === undefined && !inflightGuidsRef.current.has(g)
        );
        if (!need.length) return;

        need.forEach(g => inflightGuidsRef.current.add(g));

        try {
            const params: any = { guid: need };
            if (hasSipLogin) params.logins = [loginForUnread];

            const { data } = await chatApi.get(`/api/v1/chat/messages/count`, {
                params,
                paramsSerializer: repeatParams,
            });

            const merge: Record<string, { unread: number; total: number }> = {};
            const put = (g: string, payload: any) => {
                const { unread, total } = extractCounts(payload, hasSipLogin, loginForUnread);
                merge[g] = { unread, total };
            };

            if (Array.isArray(data)) {
                for (const item of data) {
                    const g = String(item?.guid ?? item?.GUID ?? item?.id ?? "");
                    if (g) put(g, item);
                }
            } else if (data && typeof data === "object") {
                for (const [k, payload] of Object.entries<any>(data)) {
                    if (k === "status") continue; // <-- важно
                    put(k, payload);
                }
            }

            need.forEach(g => {
                if (!merge[g]) merge[g] = { unread: 0, total: 0 };
            });

            setGuidCounts(prev => ({ ...prev, ...merge }));
        } catch (e) {
            const zeros = Object.fromEntries(need.map(g => [g, { unread: 0, total: 0 }]));
            setGuidCounts(prev => ({ ...prev, ...zeros }));
        } finally {
            need.forEach(g => inflightGuidsRef.current.delete(g));
        }
    }

    function getRowMsgInfo(row: ApiRow) {
        const guids = getGuidsForRow(row);
        let sumUnread = 0;
        let sumTotal = 0;
        guids.forEach((g) => {
            const c = guidCounts[g];
            if (c) {
                sumUnread += c.unread || 0;
                sumTotal += c.total || 0;
            }
        });
        return {guids, sumUnread, sumTotal};
    }

    useEffect(() => {
        const pageGuids = new Set<string>();
        paginatedRows.forEach(row => getGuidsForRow(row).forEach(g => g && pageGuids.add(g)));

        const missing = Array.from(pageGuids).filter(
            g => guidCounts[g] === undefined && !inflightGuidsRef.current.has(g)
        );

        void fetchCountsForGuids(missing);
    }, [paginatedRows, phonesData, hasSipLogin, loginForUnread, guidCounts]);

    useEffect(() => {
        if (!Object.keys(expressConfig).length) return;

        fetchStatuses();

        const intervalId = setInterval(() => {
            fetchStatuses();
        }, 5000);

        return () => clearInterval(intervalId);
    }, [expressConfig, role]);

    const renderExpressCards = () => {
        const entries = Object.entries(expressStates)
            .filter(([_, state]) => role === "manager" || state.active);

        return (
            <div
                style={{
                    marginLeft: 30,
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 20
                }}
            >
                {entries.map(([project, state]) => (
                    <div
                        key={project}
                        className="card"
                        style={{
                            minWidth: '220px',
                            padding: 16,
                            borderRadius: 8,
                            flex: '0 1 auto'
                        }}
                    >
                        {(role === "manager" ? [
                            {label: "Проект:", value: findNameProject(project)},
                            {label: "Express активен:", value: state.active ? "Да" : "Нет"},
                            {label: "Операторов в ожидании:", value: state.agents.length},
                            {label: "Активных вызовов:", value: state.calls},
                        ] : [
                            {label: "Проект:", value: findNameProject(project)},
                            {label: "Express активен:", value: state.active ? "Да" : "Нет"},
                        ]).map((item, idx) => (
                            <div key={idx}>
                                <strong>{item.label}</strong>{" "}
                                <span
                                    style={
                                        item.label === "Express активен:"
                                            ? {
                                                color: item.value === "Да" ? "#0BB918" : "#f33333",
                                                fontWeight: 500
                                            }
                                            : {}
                                    }
                                >
                                {item.value}
                            </span>
                            </div>
                        ))}

                        {role === "manager" && (
                            <div className="mt-2 d-flex gap-2">
                                {state.active ? (
                                    <button
                                        className="btn btn-outline-danger"
                                        onClick={() => handleStopExpress(project, state.express_id)}
                                    >
                                        Остановить
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-outline-success"
                                        onClick={() => handleStartExpress(project)}
                                    >
                                        Запустить
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    const applyColumnFilters = (colKey: string) => {
        const nextLocal = {
            ...appliedLocalFilters,
            [colKey]: (localFilterDraft[colKey] ?? '').trim(),
        };
        setAppliedLocalFilters(nextLocal);

        const sd = serverFilterDraft[colKey];
        let nextServerForCol: ServerAppliedByCol = null;

        if (sd && sd.selectedIdx !== null) {
            const draft = sd.items[sd.selectedIdx];
            nextServerForCol = coerceAppliedFromDraft(draft);
        }

        const nextServer = { ...appliedServerFilters, [colKey]: nextServerForCol };
        setAppliedServerFilters(nextServer);

        const presetId = selectedPreset?.preset?.id;
        if (presetId) {
            ssWrite(ssKey.serverFilters, nextServer);
        }

        setOpenFilterCol(null);

        // const extra = buildExtraFilterByFromMap(nextServer);
        // loadGroupedPhones(extra);
    };

    const isUsersDescriptor = (o: OptionDescriptor): o is { users: string[] } =>
        typeof o === "object" && o !== null && "users" in o && Array.isArray(o.users);

    const toPlainOptions = (opts?: OptionDescriptor[]): string[] =>
        (opts ?? []).filter((o): o is string => typeof o === "string");

    function extractUsersDepartments(options?: OptionDescriptor[]): string[] | null {
        const found = (options ?? []).find(isUsersDescriptor);
        return found ? found.users.map(String).filter(Boolean) : null;
    }

    const resetColumnFilters = (colKey: string) => {
        const nextLocal = {...appliedLocalFilters, [colKey]: ''};
        setAppliedLocalFilters(nextLocal);
        setLocalFilterDraft(prev => ({...prev, [colKey]: ''}));

        setServerFilterDraft(prev => {
            const cur = prev[colKey];
            if (!cur) return prev;
            return {
                ...prev,
                [colKey]: {...cur, selectedIdx: null, items: cur.items.map(i => ({...i, values: []}))}
            };
        });
        const nextServer = {...appliedServerFilters, [colKey]: null};
        setAppliedServerFilters(nextServer);
        const presetId = selectedPreset?.preset?.id;
        if (presetId) {
            ssWrite(ssKey.serverFilters, nextServer);
        }

        setOpenFilterCol(null);

        // const extra = buildExtraFilterByFromMap(nextServer);
        // loadGroupedPhones(extra);
    };

    useEffect(() => {
        const tp = Math.max(1, Math.ceil(processedRows.length / rowsPerPage));
        if (currentPage > tp) setCurrentPage(tp);
    }, [processedRows.length, rowsPerPage, currentPage, setCurrentPage]);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    const goToPage = (n: number) => {
        const page = Math.max(1, Math.min(totalPages, n || 1));
        setCurrentPage(page);
    };

    const commitPageInput = () => {
        const n = parseInt(pageInput, 10);
        if (Number.isFinite(n)) goToPage(n);
    };

    const handleDateChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        setStartDate(start);
        setEndDate(end);
    }

    type ExportScope = 'all' | 'page' | 'selected';

    const onDrag = (e: MouseEvent) => {
        if (!isDraggingRef.current || !topHScrollRef.current || !gridScrollRef.current) return;
        const trackW  = Math.max(0, topHScrollRef.current.clientWidth - 16);
        const thumbW  = Math.max(24, Math.round((viewportW / contentWidth) * trackW));
        const maxLeft = Math.max(0, trackW - thumbW);
        const dx = e.clientX - dragStartXRef.current;
        const newLeft = Math.max(0, Math.min(dragStartLeftRef.current + dx, maxLeft));

        const maxScroll = Math.max(1, contentWidth - viewportW);
        const newScrollLeft = (newLeft / maxLeft) * maxScroll || 0;

        gridScrollRef.current.scrollLeft = newScrollLeft;
        setScrollLeft(newScrollLeft);
    };

    const onDragEnd = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onDragEnd);
    };

    useEffect(() => () => onDragEnd(), []);

    const clearTableLocksOnce = () => {
        setTableLocks(prev => (Object.keys(prev).length ? {} : prev));
    };
    useEffect(() => {
        if (!selectedPreset) return;

        if (isCardUrl || showLockedOnly || !sessionKey || !worker || !locksPageIds.length) {
            clearTableLocksOnce();
            return;
        }

        const onLocks = (payload: any) => {
            setTableLocks(normalizeLocksPayload(payload));
        };

        socket.on("table_locks", onLocks);

        const emit = () => {
            if (locksPageSig === lastLocksSigRef.current) return;
            lastLocksSigRef.current = locksPageSig;

            socket.emit("table_locks", {
                session_key: sessionKey,
                worker,
                ids: locksPageIds,
            });
        };

        emit();

        if (locksPollRef.current) window.clearInterval(locksPollRef.current);
        locksPollRef.current = window.setInterval(() => {
            socket.emit("table_locks", {
                session_key: sessionKey,
                worker,
                ids: locksPageIds,
            });
        }, 5000);

        return () => {
            socket.off("table_locks", onLocks);
            if (locksPollRef.current) {
                window.clearInterval(locksPollRef.current);
                locksPollRef.current = null;
            }
        };
    }, [
        selectedPreset?.preset?.id,
        isCardUrl,
        showLockedOnly,
        sessionKey,
        worker,
        locksPageSig,
        locksPageIds,
        normalizeLocksPayload,
    ]);

    const exportToExcel = (scope: ExportScope = 'all') => {
        if (!selectedPreset) return;

        const rowsSrc =
            scope === 'page'
                ? paginatedRows
                : scope === 'selected'
                    ? processedRows.filter(r => selectedRows.has(r.id_list.join(',')))
                    : processedRows;

        const cols = Object.entries(selectedPreset.preset.structure as Record<string, ColumnCfgWithSearch>)
            .sort(([a], [b]) => Number(a) - Number(b));

        const headers = cols.map(([_, cfg]) => cfg.name).concat('Сообщения');

        const aoa: (string | number)[][] = [headers];

        rowsSrc.forEach(row => {
            const rowArr = cols.map(([colKey, cfg]) => {
                const cell = row[colKey] as ColumnCell | undefined;
                const val =
                    !cell || !Array.isArray(cell.value)
                        ? cfg.default
                        : (cell.value.length ? cell.value.join('; ') : cfg.default);
                return val ?? '';
            });

            const {sumUnread, sumTotal} = getRowMsgInfo(row);
            rowArr.push(`${sumUnread}/${sumTotal}`);

            aoa.push(rowArr);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);

        ws['!cols'] = headers.map(h => ({wch: Math.max(12, String(h).length + 2)}));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Задачи');

        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');

        const fname = `tasks_${selectedPreset.preset.preset_name}_${y}-${m}-${d}_${hh}-${mm}.xlsx`;
        XLSX.writeFile(wb, fname);
    };

    const hasRows = paginatedRows.length > 0;
    const getTzOffsetMinutes = () => -new Date().getTimezoneOffset();
    const statusLabels: Record<string, string> = {
        to_call: "Необработано",
        add: "Доп. контакт",
        schedule: "Отложенный",
        finished: "Завершен"
    };

    const chip: React.CSSProperties = {
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

    const nextTask = useCallback(() => {
        const flowIds = Array.from(
            new Set(
                (operatorAccess.flowIds ?? [])
                    .map((id) => Number(id))
                    .filter((id) => Number.isFinite(id))
            )
        );

        if (!flowIds.length) {
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
            flow_ids: flowIds,
            start_type: "auto",
            tz_offset: getTzOffsetMinutes(),
        });
    }, [operatorAccess.flowIds, worker, sipLogin, sessionKey]);

    return (
        <div>
            {renderExpressCards()}
            <div className="card p-4 ml-4">
                <div
                    style={{
                        display: 'grid',
                        gap: 16,
                        marginBottom: 8,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        alignItems: 'end',
                    }}
                >
                    {/* Пресеты */}

                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 16,
                            marginBottom: 8,
                            alignItems: 'flex-end',
                        }}
                    >
                        {/* Пресет */}
                        <div style={{flex: '0 0 250px'}}>
                            <SearchableSelect
                                value={selectedPreset ? selectedPreset.preset.id : ''}
                                isSearchable
                                onChange={val => {
                                    if (selectedPreset && String(selectedPreset.preset.id) === val) return;
                                    setServerFiltersReady(false);
                                    setAppliedServerFilters({});
                                    setAppliedLocalFilters({});

                                    const p = presets.find(x => String(x.preset.id) === val);
                                    if (p) {
                                        setTableData([]);
                                        setSelectedPreset(p);
                                    }
                                }}
                                options={presets.map(p => ({ id: p.value, name: p.label }))}
                                placeholder="Выберите пресет..."
                            />
                        </div>

                        {/* Поиск */}
                        <div style={{flex: '0 0 250px'}}>
                            <input
                                type="text"
                                placeholder="Поиск..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="form-control"
                            />
                        </div>
                        <button
                            onClick={resetAllFiltersToDefaults}
                            className="btn btn-outline-light text text-dark mx-1 ml-2"
                            title="Применить значения по умолчанию из search (например, {today})"
                        >
                            <span className="ml-1">Фильтры: по умолчанию</span>
                        </button>
                        <button
                            type="button"
                            className="btn btn-outline-info"
                            disabled={!selectedPreset || allLocksLoading}
                            onClick={async () => {
                                if (showLockedOnly) {
                                    setShowLockedOnly(false);
                                    return;
                                }

                                await fetchAllLocks();
                                setShowLockedOnly(true);
                                setCurrentPage(1);
                            }}
                            title="Показать только залоченные карточки"
                        >
                            <span className="material-icons" style={{ fontSize: 18, verticalAlign: 'middle' }}>
                                lock
                            </span>
                            <span className="ml-1">
                                {showLockedOnly ? "Показать все" : `Закреплённые`}
                            </span>
                        </button>

                        <div ref={exportMenuRef} style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                                type="button"
                                className="btn btn-outline-success"
                                onClick={() => setOpenExportMenu(v => !v)}
                                aria-haspopup="true"
                                aria-expanded={openExportMenu}
                                title="Экспортировать данные"
                            >
                                Экспорт
                                <span className="material-icons" style={{ fontSize: 18, marginLeft: 6, verticalAlign: 'middle' }}>
                                  expand_more
                                </span>
                            </button>

                            {openExportMenu && (
                                <div
                                    className="card"
                                    role="menu"
                                    style={{
                                        position: 'absolute',
                                        zIndex: 70,
                                        top: 'calc(100% + 6px)',
                                        minWidth: 240,
                                        padding: 8,
                                        boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
                                        ...(exportSide === 'left' ? { right: 0 } : { left: 0 }),
                                    }}
                                >
                                    <button
                                        className="btn btn-link w-100 text-left"
                                        role="menuitem"
                                        disabled={processedRows.length === 0}
                                        onClick={() => { exportToExcel('all'); setOpenExportMenu(false); }}
                                        title={processedRows.length ? '' : 'Нет данных для экспорта'}
                                        style={{ fontWeight: 600, fontSize: 16 }}
                                    >
                                        Экспорт Excel (всё)
                                    </button>

                                    <button
                                        className="btn btn-link w-100 text-left"
                                        role="menuitem"
                                        disabled={paginatedRows.length === 0}
                                        onClick={() => { exportToExcel('page'); setOpenExportMenu(false); }}
                                        title={paginatedRows.length ? '' : 'На текущей странице нет строк'}
                                        style={{ fontWeight: 600, fontSize: 16 }}
                                    >
                                        Экспорт (страница)
                                    </button>

                                    <button
                                        className="btn btn-link w-100 text-left"
                                        role="menuitem"
                                        disabled={selectedRows.size === 0}
                                        onClick={() => { exportToExcel('selected'); setOpenExportMenu(false); }}
                                        title={selectedRows.size ? '' : 'Не выбрано ни одной строки'}
                                        style={{ fontWeight: 600, fontSize: 16 }}
                                    >
                                        Экспорт (выбранные)
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Действие */}
                        <div style={{flex: '0 0 250px'}}>
                            <SearchableSelect
                                value={selectedActionOption ? selectedActionOption.value : ''}
                                onChange={(val: string) => {
                                    const found = actionOptions.find(opt => opt.value === val) ?? null;
                                    setSelectedActionOption(found);
                                }}
                                isSearchable={false}
                                options={actionOptions.map(a => ({ id: a.value, name: a.label }))}
                                placeholder="Выберите действие..."
                            />
                        </div>

                        {/* AssignComp или кнопка */}
                        {selectedActionOption?.action.action_type === "assign" ? (
                            <div style={{flex: '0 0 auto', minWidth: 400, maxWidth: '100%', overflow: 'hidden'}}>
                                <AssignComp opt={selectedActionOption} rows={selectedRows} processRows={processRows} />
                            </div>
                        ) : (
                            <div style={{flex: '0 0 auto'}}>
                                <button
                                    onClick={() => {
                                        const keys = Array.from(selectedRows);
                                        const rows = processedRows.filter(r => keys.includes(r.id_list.join(',')));
                                        handleBulkProcess(rows);
                                    }}
                                    className="btn btn-outline-light text text-dark mx-1 ml-2"
                                >
                                    Обработать
                                </button>
                            </div>
                        )}
                        {/*<div style={{flex: '0 0 250px'}}>*/}
                        {/*    <button*/}
                        {/*        onClick={() => {*/}
                        {/*            socket.emit('outbound_call_get', {*/}
                        {/*                assign: true,*/}
                        {/*                batch: 1,*/}
                        {/*                // break: true,*/}
                        {/*                worker,*/}
                        {/*                interface: "glagol",*/}
                        {/*                sip_login: sipLogin,*/}
                        {/*                session_key: sessionKey,*/}
                        {/*                projects_pool: projectNames,*/}
                        {/*                start_type: "auto",*/}
                        {/*                tz_offset: getTzOffsetMinutes(),*/}
                        {/*            });*/}

                        {/*        }}*/}
                        {/*        className="btn btn-outline-success"*/}
                        {/*    >*/}
                        {/*        Начать задачу*/}
                        {/*    </button>*/}
                        {/*</div>*/}

                        <button
                            style={{
                                ...chip,
                                background: '#fff',
                                color: '#2563eb',
                                border: '1px solid #2563eb',
                                height: 'calc(1.5em + .75rem + 2px)'
                            }}
                            onClick={nextTask}
                            title="Получить следующую задачу"
                        >
                            <span
                                className="material-icons"
                                style={{ fontSize: 20, verticalAlign: 'middle', marginRight: 4 }}
                            >
                                skip_next
                            </span>
                            <span>Следующая задача</span>
                        </button>

                    </div>

                </div>

                {loading && <div>Загрузка данных...</div>}

                {selectedPreset && !loading && (
                    <div>
                        <div
                            className="d-flex justify-content-between align-items-center mb-2"
                            aria-live="polite"
                            style={{gap: 12}}
                        >
                            <div>
                                Сформировано строк: <strong>{totalRowsCount}</strong>
                                {totalRowsCount > 0 && (
                                    <span className="text-muted" style={{marginLeft: 8}}>
                                        (показано {showingFrom}–{showingTo})
                                    </span>
                                )}
                            </div>
                            <div className="text-muted">
                                Выбрано: <strong>{selectedRows.size}</strong>
                            </div>
                        </div>
                        <div
                            style={{
                                height: '70vh',
                                position: 'relative',
                                display: 'flex',
                                flexDirection: 'column',
                            }}
                        >
                            <div
                                ref={topHScrollRef}
                                style={{
                                    position: 'sticky',
                                    top: 0,
                                    zIndex: 16,
                                    background: '#fff',
                                    height: needsHScroll ? TOP_HSCROLL_H : 0,
                                    display: needsHScroll ? 'block' : 'none',
                                    borderBottom: '1px solid rgba(0,0,0,0.08)',
                                    userSelect: 'none',
                                }}
                                onWheel={(e) => {
                                    if (!gridScrollRef.current) return;
                                    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
                                    gridScrollRef.current.scrollLeft += d;
                                    setScrollLeft(gridScrollRef.current.scrollLeft);
                                    e.preventDefault();
                                }}
                            >
                                {/* Трек */}
                                <div
                                    onMouseDown={(e) => {
                                        if (!topHScrollRef.current) return;
                                        const track = topHScrollRef.current.getBoundingClientRect();
                                        const P = 8;
                                        const trackW = Math.max(0, track.width - P*2);
                                        const maxScroll = Math.max(1, contentWidth - viewportW);

                                        const clickX = e.clientX - track.left - P;
                                        const thumbW = Math.max(24, Math.round((viewportW / contentWidth) * trackW));
                                        const maxLeft = Math.max(0, trackW - thumbW);
                                        const newLeft = Math.max(0, Math.min(clickX - thumbW / 2, maxLeft));
                                        const newScrollLeft = (newLeft / maxLeft) * maxScroll || 0;
                                        gridScrollRef.current!.scrollLeft = newScrollLeft;
                                        setScrollLeft(newScrollLeft);
                                    }}
                                    style={{
                                        position: 'relative',
                                        height: 8,
                                        margin: '4px 8px',
                                        borderRadius: 4,
                                        background: 'rgba(0,0,0,0.06)',
                                        cursor: 'default',
                                    }}
                                >
                                    {/* Ползунок */}
                                    {(() => {
                                        const trackW  = Math.max(0, (topHScrollRef.current?.clientWidth || 0) - 16);
                                        const thumbW  = Math.max(24, Math.round((viewportW / contentWidth) * trackW));
                                        const maxLeft = Math.max(0, trackW - thumbW);
                                        const maxScroll = Math.max(1, contentWidth - viewportW);
                                        const left = Math.round((scrollLeft / maxScroll) * maxLeft);

                                        return (
                                            <div
                                                onMouseDown={(e) => {
                                                    e.stopPropagation();
                                                    isDraggingRef.current = true;
                                                    dragStartXRef.current = e.clientX;
                                                    dragStartLeftRef.current = left;
                                                    document.addEventListener('mousemove', onDrag);
                                                    document.addEventListener('mouseup', onDragEnd);
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    height: 8,
                                                    left,
                                                    width: thumbW,
                                                    borderRadius: 4,
                                                    background: 'rgba(0,0,0,0.35)',
                                                    cursor: 'grab',
                                                }}
                                            />
                                        );
                                    })()}
                                </div>
                            </div>

                            <div
                                ref={gridScrollRef}
                                onScroll={() => {
                                    setScrollLeft(gridScrollRef.current!.scrollLeft);
                                }}
                                style={{
                                    flex: '1 1 0%',
                                    minHeight: 0,

                                    overflowX: 'auto',
                                    overflowY: hasRows ? 'auto' : 'visible',
                                    paddingBottom: 8,
                                }}
                            >

                            {/*<div className="overflow-y-auto" style={{height: "60vh"}}>*/}
                                <table
                                    ref={tableRef}
                                    className="table-auto border-collapse"
                                    style={{ width: 'max-content', minWidth: '100%', tableLayout: 'auto' }}
                                >
                                <thead>
                                <tr>
                                    <th
                                        className="border p-2 text-center"
                                        style={{
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 15,
                                            background: '#fff',
                                            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)',
                                            width: getColW('#select'),
                                            maxWidth: getColW('#select'),
                                        }}
                                    >
                                    <input
                                            type="checkbox"
                                            className={styles.customCheckbox}
                                            checked={
                                                paginatedRows.length > 0 &&
                                                paginatedRows.every(r => selectedRows.has(r.id_list.join(',')))
                                            }
                                            style={{cursor: "pointer"}}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    <th
                                        className="border p-2 text-center"
                                        style={{
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 15,
                                            background: '#fff',
                                            width: 1,
                                            whiteSpace: 'nowrap',
                                            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)'

                                        }}
                                        title="Быстрые действия"
                                    >
                                        Действия
                                    </th>
                                    <th
                                        className="border p-2"
                                        title="Непрочитанные / Всего"
                                        style={{
                                            position: 'sticky',
                                            top: 0,
                                            zIndex: 15,
                                            background: '#fff',
                                            width: getColW('#messages'),
                                            maxWidth: getColW('#messages'),
                                            whiteSpace: 'nowrap',
                                            boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)'
                                        }}
                                    >
                                        <span>Сообщения</span>
                                        {unreadOnly && (
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: 3,
                                                    background: '#1976d2',
                                                    marginLeft: 6,
                                                    verticalAlign: 'middle',
                                                }}
                                            />
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setUnreadOnly(v => !v)}
                                            className="btn btn-sm btn-link"
                                            aria-pressed={unreadOnly}
                                            title={unreadOnly ? 'Показать все строки' : 'Только строки с непрочитанными'}
                                            style={{
                                                marginLeft: 6,
                                                padding: 0,
                                                verticalAlign: 'middle',
                                                color: unreadOnly ? '#1976d2' : undefined,
                                            }}
                                        >
                                            <span className="material-icons" style={{fontSize: 18}}>filter_list</span>
                                        </button>
                                    </th>
                                    {Object.entries(selectedPreset.preset.structure as Record<string, ColumnCfgWithSearch>)
                                        .sort(([a], [b]) => Number(a) - Number(b))
                                        .map(([colKey, cfg]) => {
                                            const hasSearch = Array.isArray(cfg.search) && cfg.search.length > 0;
                                            const isOpen = openFilterCol === colKey;

                                            return (
                                                <th
                                                    key={colKey}
                                                    className="border p-2 select-none"
                                                    style={{
                                                        position: 'sticky',
                                                        top: 0,
                                                        zIndex: 15,
                                                        background: '#fff',
                                                        // minWidth: getColW(colKey),
                                                        minWidth: "10px",

                                                        maxWidth: getColW(colKey),
                                                        whiteSpace: 'nowrap',
                                                        boxShadow: 'inset 0 -1px 0 rgba(0,0,0,0.08)'
                                                    }}
                                                    aria-sort={
                                                        sortConfig?.key === colKey
                                                            ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending')
                                                            : 'none'
                                                    }
                                                >
                                                    <span
                                                        onClick={() => toggleSort(colKey)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 6
                                                        }}
                                                        title={
                                                            sortConfig?.key === colKey
                                                                ? (sortConfig.direction === 'asc' ? 'Сортировка: по возрастанию' : 'Сортировка: по убыванию')
                                                                : 'Сортировать'
                                                        }
                                                    >
                                                        {cfg.name}

                                                        {/* Иконка сортировки */}
                                                        <span
                                                            className="material-icons"
                                                            style={{
                                                                fontSize: 18,
                                                                lineHeight: 1,
                                                                opacity: sortConfig?.key === colKey ? 1 : 0.35,
                                                                verticalAlign: 'middle'
                                                            }}
                                                        >
                                                          {getSortIcon(colKey)}
                                                        </span>

                                                        {/* Точка-индикатор активных фильтров по колонке */}
                                                        {isColumnFiltered(colKey) && (
                                                            <span
                                                                style={{
                                                                    display: 'inline-block',
                                                                    width: 6,
                                                                    height: 6,
                                                                    borderRadius: 3,
                                                                    background: '#1976d2',
                                                                    verticalAlign: 'middle'
                                                                }}
                                                            />
                                                        )}
                                                    </span>

                                                    {hasSearch && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                const isOpen = openFilterCol === colKey;
                                                                if (isOpen) { setOpenFilterCol(null); return; }

                                                                const th = (e.currentTarget.closest('th') as HTMLElement) || e.currentTarget;
                                                                const rect = th.getBoundingClientRect();
                                                                const vw = window.innerWidth;

                                                                const POPUP_W = 360;
                                                                const GAP = 12;

                                                                let side: 'left' | 'right' = 'left';
                                                                if (rect.left < POPUP_W + GAP) side = 'right';
                                                                else if (vw - rect.right < POPUP_W + GAP) side = 'left';

                                                                setFilterSide(side);
                                                                setOpenFilterCol(colKey);
                                                            }}
                                                            className="btn btn-sm btn-link"
                                                            style={{
                                                                marginLeft: 6,
                                                                padding: 0,
                                                                verticalAlign: 'middle',
                                                                color: isColumnFiltered(colKey) ? '#1976d2' : undefined,
                                                            }}
                                                            title="Фильтр по столбцу"
                                                        >
                                                            <span className="material-icons"
                                                                  style={{fontSize: 18}}>filter_list</span>
                                                        </button>
                                                    )}

                                                    {/* Попап фильтра */}
                                                    {hasSearch && isOpen && (
                                                        <div
                                                            className="card"
                                                            style={{
                                                                position: 'absolute',
                                                                top: 'calc(100% + 6px)',
                                                                zIndex: 50,
                                                                width: 360,
                                                                maxWidth: 'min(360px, calc(100vw - 24px))',
                                                                padding: 12,
                                                                boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
                                                                ...(filterSide === 'left' ? { right: 0 } : { left: 0 }),
                                                            }}
                                                        >
                                                            {/* Фильтрация в найденном */}
                                                            <div style={{ marginBottom: 12 }}>
                                                                <div style={{ fontWeight: 600, marginBottom: 6 }}>Фильтрация в найденном</div>
                                                                <input
                                                                    className="form-control"
                                                                    placeholder="Поиск внутри найденного"
                                                                    value={localFilterDraft[colKey] ?? ''}
                                                                    onChange={(e) =>
                                                                        setLocalFilterDraft((prev) => ({
                                                                            ...prev,
                                                                            [colKey]: e.target.value,
                                                                        }))
                                                                    }
                                                                />
                                                            </div>

                                                            {/* Фильтрация по условию */}
                                                            <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                                    <div style={{ fontWeight: 600 }}>Фильтрация по условию</div>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-link p-0"
                                                                        onClick={() => resetColumnFilters(colKey)}
                                                                    >
                                                                        Сбросить
                                                                    </button>
                                                                </div>

                                                                {(cfg.search ?? []).map((s, idx) => {
                                                                    const sd = serverFilterDraft[colKey];
                                                                    const selected = sd?.selectedIdx === idx;
                                                                    const draftItem = sd?.items[idx];

                                                                    return (
                                                                        <div
                                                                            key={idx}
                                                                            style={{
                                                                                border: '1px solid rgba(0,0,0,0.08)',
                                                                                borderRadius: 8,
                                                                                padding: 8,
                                                                                marginTop: 8,
                                                                            }}
                                                                        >
                                                                            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                                                <input
                                                                                    type="radio"
                                                                                    name={`srvf-${colKey}`}
                                                                                    checked={!!selected}
                                                                                    onChange={() =>
                                                                                        setServerFilterDraft((prev) => ({
                                                                                            ...prev,
                                                                                            [colKey]: {
                                                                                                ...(prev[colKey] ?? {
                                                                                                    selectedIdx: null,
                                                                                                    items: (cfg.search ?? []).map((ss) => ({
                                                                                                        key: ss.key,
                                                                                                        method: ss.methods[0],
                                                                                                        values: [] as string[],
                                                                                                    })),
                                                                                                }),
                                                                                                selectedIdx: idx,
                                                                                            },
                                                                                        }))
                                                                                    }
                                                                                />
                                                                                <span style={{ fontWeight: 500 }}>{s.name}</span>
                                                                            </label>

                                                                            {/* Критерий */}
                                                                            <div className="mt-2">
                                                                                <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>Критерий</div>
                                                                                <select
                                                                                    className="form-control"
                                                                                    disabled={!selected}
                                                                                    value={draftItem?.method ?? s.methods[0]}
                                                                                    onChange={(e) =>
                                                                                        setServerFilterDraft((prev) => {
                                                                                            const cur = prev[colKey];
                                                                                            if (!cur) return prev;
                                                                                            const items = cur.items.slice();
                                                                                            items[idx] = {
                                                                                                ...(items[idx] ?? { key: s.key, method: s.methods[0], values: [] }),
                                                                                                key: s.key,
                                                                                                method: e.target.value as FilterMethod,
                                                                                            };
                                                                                            return { ...prev, [colKey]: { ...cur, items } };
                                                                                        })
                                                                                    }
                                                                                >
                                                                                    {s.methods.map((m) => (
                                                                                        <option key={m} value={m}>
                                                                                            {MethodLabel(m)}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            </div>

                                                                            {/* Значения */}
                                                                            <div className="mt-2">
                                                                                {(() => {
                                                                                    const method = (draftItem?.method ?? s.methods[0]) as FilterMethod;
                                                                                    const selectedVals = draftItem?.values ?? [];
                                                                                    const isMulti = method === 'IN' || method === 'NOT IN';

                                                                                    // 1) Диапазон дат
                                                                                    if (method === 'DATES') {
                                                                                        const startYmd = selectedVals[0] || '';
                                                                                        const endYmd = selectedVals[1] || '';
                                                                                        const startDate = startYmd ? parseYmd(startYmd) : null;
                                                                                        const endDate = endYmd ? parseYmd(endYmd) : null;

                                                                                        return (
                                                                                            <DatePicker
                                                                                                selected={startDate}
                                                                                                onChange={(range: [Date | null, Date | null]) => {
                                                                                                    const [startD, endD] = range || [];
                                                                                                    const toY = (d: Date | null) =>
                                                                                                        d
                                                                                                            ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
                                                                                                                d.getDate()
                                                                                                            ).padStart(2, '0')}`
                                                                                                            : '';
                                                                                                    const v0 = toY(startD);
                                                                                                    const v1 = toY(endD);
                                                                                                    setServerFilterDraft((prev) => {
                                                                                                        const cur = prev[colKey];
                                                                                                        if (!cur) return prev;
                                                                                                        const items = cur.items.slice();
                                                                                                        items[idx] = {
                                                                                                            ...(items[idx] ?? { key: s.key, method: 'DATES' as FilterMethod, values: [] }),
                                                                                                            key: s.key,
                                                                                                            method: 'DATES' as FilterMethod,
                                                                                                            values: [v0, v1],
                                                                                                        };
                                                                                                        return { ...prev, [colKey]: { ...cur, items } };
                                                                                                    });
                                                                                                }}
                                                                                                startDate={startDate}
                                                                                                endDate={endDate}
                                                                                                selectsRange
                                                                                                placeholderText="Диапазон дат"
                                                                                                className="form-control w-100"
                                                                                                wrapperClassName="w-100"
                                                                                                onChangeRaw={(e) => e?.preventDefault()}
                                                                                                onKeyDown={(e) => {
                                                                                                    if (e.key === 'Backspace' || e.key === 'Delete') e.preventDefault();
                                                                                                }}
                                                                                                dateFormat="dd.MM.yyyy"
                                                                                            />
                                                                                        );
                                                                                    }

                                                                                    const wantedDepts = extractUsersDepartments(s.options);
                                                                                    if (wantedDepts) {
                                                                                        const userOptions = buildUserOptionsByDepartments(
                                                                                            monitorUsers,
                                                                                            wantedDepts,
                                                                                            selectedPreset?.preset?.projects ?? []
                                                                                        );

                                                                                        const msOptions = withNoneOption(
                                                                                            userOptions.map((o) => ({ id: o.value, name: o.label }))
                                                                                        );
                                                                                        const msValue = (isMulti ? selectedVals : [selectedVals[0] ?? '']).filter(Boolean);

                                                                                        return (
                                                                                            <div style={{ pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}>
                                                                                                <MultiSelect
                                                                                                    value={msValue}
                                                                                                    options={msOptions}
                                                                                                    placeholder="Выберите пользователя..."
                                                                                                    isSearchable
                                                                                                    onChange={(vals) =>
                                                                                                        setServerFilterDraft((prev) => {
                                                                                                            const cur = prev[colKey];
                                                                                                            if (!cur) return prev;
                                                                                                            const items = cur.items.slice();
                                                                                                            items[idx] = {
                                                                                                                ...(items[idx] ?? { key: s.key, method, values: [] }),
                                                                                                                key: s.key,
                                                                                                                method,
                                                                                                                values: isMulti ? vals : (vals.length ? [vals[0]] : []),
                                                                                                            };
                                                                                                            return { ...prev, [colKey]: { ...cur, items } };
                                                                                                        })
                                                                                                    }
                                                                                                />
                                                                                            </div>
                                                                                        );
                                                                                    }

                                                                                    // 3) Обычные строковые options → мультиселект
                                                                                    const plainOptions = toPlainOptions(s.options);
                                                                                    if (plainOptions.length) {
                                                                                        const msOptions = withNoneOption(
                                                                                            plainOptions.map((v) => ({ id: v, name: v }))
                                                                                        );
                                                                                        const msValue = (isMulti ? selectedVals : [selectedVals[0] ?? '']).filter(Boolean);

                                                                                        return (
                                                                                            <div style={{ pointerEvents: selected ? 'auto' : 'none', opacity: selected ? 1 : 0.6 }}>
                                                                                                <MultiSelect
                                                                                                    value={msValue}
                                                                                                    options={msOptions}
                                                                                                    placeholder="Выберите значение..."
                                                                                                    isSearchable
                                                                                                    onChange={(vals) =>
                                                                                                        setServerFilterDraft((prev) => {
                                                                                                            const cur = prev[colKey];
                                                                                                            if (!cur) return prev;
                                                                                                            const items = cur.items.slice();
                                                                                                            items[idx] = {
                                                                                                                ...(items[idx] ?? { key: s.key, method, values: [] }),
                                                                                                                key: s.key,
                                                                                                                method,
                                                                                                                values: isMulti ? vals : (vals.length ? [vals[0]] : [])
                                                                                                                ,
                                                                                                            };
                                                                                                            return { ...prev, [colKey]: { ...cur, items } };
                                                                                                        })
                                                                                                    }
                                                                                                />
                                                                                            </div>
                                                                                        );
                                                                                    }

                                                                                    if (isMulti) {
                                                                                        const csv = (selectedVals || []).map(toUiValue).join(', ');
                                                                                        return (
                                                                                            <input
                                                                                                className="form-control"
                                                                                                disabled={!selected}
                                                                                                placeholder="Значения через запятую"
                                                                                                value={csv}
                                                                                                onChange={(e) => {
                                                                                                    const values = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                                                                                    setServerFilterDraft((prev) => {
                                                                                                        const cur = prev[colKey];
                                                                                                        if (!cur) return prev;
                                                                                                        const items = cur.items.slice();
                                                                                                        items[idx] = {
                                                                                                            ...(items[idx] ?? { key: s.key, method, values: [] }),
                                                                                                            key: s.key,
                                                                                                            method,
                                                                                                            values,
                                                                                                        };
                                                                                                        return { ...prev, [colKey]: { ...cur, items } };
                                                                                                    });
                                                                                                }}
                                                                                            />
                                                                                        );
                                                                                    }

                                                                                    const val = toUiValue(selectedVals[0] ?? '');
                                                                                    return (
                                                                                        <input
                                                                                            className="form-control"
                                                                                            disabled={!selected}
                                                                                            placeholder="Значение"
                                                                                            value={val}
                                                                                            onChange={(e) =>
                                                                                                setServerFilterDraft((prev) => {
                                                                                                    const cur = prev[colKey];
                                                                                                    if (!cur) return prev;
                                                                                                    const items = cur.items.slice();
                                                                                                    items[idx] = {
                                                                                                        ...(items[idx] ?? { key: s.key, method, values: [] }),
                                                                                                        key: s.key,
                                                                                                        method,
                                                                                                        values: [e.target.value],
                                                                                                    };
                                                                                                    return { ...prev, [colKey]: { ...cur, items } };
                                                                                                })
                                                                                            }
                                                                                        />
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}

                                                                <div className="mt-3 d-flex gap-2 justify-content-end">
                                                                    <button className="btn btn-outline-secondary" onClick={() => setOpenFilterCol(null)}>
                                                                        Отмена
                                                                    </button>
                                                                    <button className="btn btn-primary" onClick={() => applyColumnFilters(colKey)}>
                                                                        Применить
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </th>
                                            );
                                        })}

                                </tr>
                                </thead>
                                <tbody>
                                {paginatedRows.map(row => {
                                    const key = row.id_list.join(',');
                                    const locksMap = showLockedOnly ? allLocks : tableLocks;
                                    const lockMark = getLockMarkForRow(row, locksMap);
                                    const isLocked = !!lockMark;
                                    const lockedBy = typeof lockMark === "string" ? lockMark : null;
                                    const lockedByMe = lockedBy && String(lockedBy) === String(sipLogin);
                                    return (
                                        <tr
                                            key={key}
                                            style={{
                                                background: isLocked
                                                    ? (lockedByMe ? "rgba(16,185,129,0.08)" : "rgba(245,158,11,0.10)")
                                                    : undefined,
                                            }}
                                            title={isLocked ? (lockedBy ? `Закреплено: ${lockedBy}` : "Закреплено") : undefined}
                                        >
                                            {/* Чекбокс */}
                                            <td className="border p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    className={styles.customCheckbox}
                                                    checked={selectedRows.has(key)}
                                                    onChange={() => toggleRow(key)}
                                                    style={{ cursor: "pointer" }}
                                                />
                                            </td>

                                            {/* ДЕЙСТВИЯ */}
                                            <td
                                                className="border p-2 align-top"
                                                style={{
                                                    position: 'relative',
                                                    width: 1,
                                                    whiteSpace: 'nowrap',
                                                    opacity: 1,
                                                }}
                                            >
                                                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                                    {/*{isLocked && (*/}
                                                    {/*    <span*/}
                                                    {/*        className="material-icons"*/}
                                                    {/*        style={{*/}
                                                    {/*            fontSize: 18,*/}
                                                    {/*            lineHeight: 1,*/}
                                                    {/*            color: lockedByMe ? "#10b981" : "#2563eb",*/}
                                                    {/*        }}*/}
                                                    {/*        title={lockedByMe ? "Вы сейчас в карточке" : `Сейчас в карточке: ${lockedBy}`}*/}
                                                    {/*    >*/}
                                                    {/*      person*/}
                                                    {/*    </span>*/}
                                                    {/*)}*/}

                                                    {/* Открыть */}
                                                    <button
                                                        className="btn btn-sm btn-outline-light text-dark"
                                                        title={"Открыть"}
                                                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                            const url = makeGroupCardUrl(row, selectedPreset, phonesData);

                                                            if (e.ctrlKey || e.metaKey) {
                                                                window.open(url, '_blank', 'noopener,noreferrer');
                                                                return;
                                                            }

                                                            setOpenedGroup(row.id_list);
                                                            window.history.pushState({}, "", url);
                                                        }}
                                                        onMouseUp={(e: React.MouseEvent<HTMLButtonElement>) => {
                                                            if (e.button === 1) {
                                                                const url = makeGroupCardUrl(row, selectedPreset, phonesData);
                                                                window.open(url, '_blank', 'noopener,noreferrer');
                                                            }
                                                        }}
                                                    >
                                                        <span className="material-icons" style={{ fontSize: 16, lineHeight: 1 }}>
                                                          open_in_new
                                                        </span>
                                                    </button>

                                                    {/* Меню действий */}
                                                    <button
                                                        className="btn btn-sm btn-outline-light text-dark"
                                                        title={"Действия"}
                                                        onClick={() => setOpenActionsRow(openActionsRow === key ? null : key)}
                                                        aria-expanded={openActionsRow === key}
                                                    >
                                                        <span className="material-icons" style={{ fontSize: 18, lineHeight: 1 }}>
                                                          more_horiz
                                                        </span>
                                                    </button>
                                                </div>

                                                {/* Дропдаун со списком действий */}
                                                {openActionsRow === key && (
                                                    <div
                                                        className="card"
                                                        style={{
                                                            position: 'absolute',
                                                            zIndex: 60,
                                                            top: 'calc(100% + 6px)',
                                                            left: 0,
                                                            minWidth: 220,
                                                            maxWidth: 340,
                                                            padding: 8,
                                                            boxShadow: '0 10px 24px rgba(0,0,0,0.15)'
                                                        }}
                                                    >
                                                        <div style={{fontWeight: 600, fontSize: 16, marginBottom: 6}}>Действия</div>

                                                        {/* Кнопки-элементы меню для всех НЕ-assign действий */}
                                                        {actionOptions
                                                            .filter(opt => opt.action?.action_type !== "assign")
                                                            .map(opt => (
                                                                <button
                                                                    key={opt.label}
                                                                    className="btn btn-sm btn-link w-100 text-left"
                                                                    onClick={() => {
                                                                        handleBulkProcess([row], opt, true);
                                                                        setOpenActionsRow(null);
                                                                    }}
                                                                    style={{whiteSpace: 'normal', fontWeight: 600, fontSize: 16}}
                                                                >
                                                                    {opt.label}
                                                                </button>
                                                            ))}

                                                        {/* Блок «Назначить» — убираем громоздкие инлайновые кнопки из таблицы */}
                                                        {actionOptions.some(opt => opt.action?.action_type === "assign") && (
                                                            <div style={{borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: 8, paddingTop: 8}}>
                                                                <div style={{fontSize: 16, opacity: 0.7, marginBottom: 6}}>Назначить</div>
                                                                {actionOptions
                                                                    .filter(opt => opt.action?.action_type === "assign")
                                                                    .map(opt => (
                                                                        <div key={'assign-' + opt.value} style={{minWidth: 220}}>
                                                                            <AssignComp
                                                                                opt={opt}
                                                                                row={row}
                                                                                processRows={(rows, o, operator) => {
                                                                                    processRows(rows, o, operator);
                                                                                    setOpenActionsRow(null);
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="border p-2 align-top">
                                                {(() => {
                                                    const guids = getGuidsForRow(row);
                                                    const firstGuid = guids[0];

                                                    const {sumUnread, sumTotal} = getRowMsgInfo(row);
                                                    const showDash = !firstGuid && sumUnread === 0 && sumTotal === 0;
                                                    if (showDash) return <span className="text-muted">—</span>;

                                                    const c = firstGuid ? (guidCounts[firstGuid] || {
                                                        unread: 0,
                                                        total: 0
                                                    }) : {unread: 0, total: 0};

                                                    return (
                                                        <div className={styles.msgsCell}>

                                                            <div
                                                                className={styles.msgsCount}
                                                                title={`Непрочитанные: ${sumUnread} / Всего:  ${sumTotal}`}
                                                                aria-label={`Непрочитанные ${sumUnread} из ${sumTotal}`}
                                                            >
                                                                <span className={styles.numUnread}>{sumUnread}</span>
                                                                <span className={styles.sep}>/</span>
                                                                <span className={styles.numTotal}>{sumTotal}</span>
                                                            </div>

                                                        </div>
                                                    );
                                                })()}
                                            </td>
                                            {/* Данные по колонкам */}
                                            {Object.keys(selectedPreset.preset.structure)
                                                .sort((a, b) => Number(a) - Number(b))
                                                .map(colKey => {
                                                    // Попытка безопасно достать ячейку
                                                    const maybeCell = row[colKey] as ColumnCell | undefined;
                                                    const def = selectedPreset.preset.structure[colKey].default;

                                                    // Если ячейка или её value отсутствует — рендерим default
                                                    if (!maybeCell || !Array.isArray(maybeCell.value)) {
                                                        return (
                                                            <td key={colKey} className="border p-2 align-top" style={{width: 30}}>
                                                                {def}
                                                            </td>
                                                        );
                                                    }

                                                    // Иначе — отобразим все элементы массива или default, если он пуст
                                                    return (
                                                        <td key={colKey} className="border p-2 align-top" style={{width: 30}}>
                                                            {maybeCell.value.length > 0
                                                                ? maybeCell.value.map((item, idx) => (
                                                                    <div key={idx}>{item}</div>
                                                                ))
                                                                : def
                                                            }
                                                        </td>
                                                    );
                                                })}

                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                            </div>
                        </div>
                        {/* Пагинация */}
                        <div
                            className="mt-4"
                            style={{
                                position: "sticky",
                                bottom: 0,
                                zIndex: 10,
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
                            {/* Селект «строк на странице» слева */}
                            <div style={{display: "flex", alignItems: "center", gap: 8}}>
                                <span style={{fontSize: 13, color: "#444", whiteSpace: 'nowrap'}}>
                                  Показывать по
                                </span>
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
                                    {[10, 25, 50].map(n => (
                                        <option key={n} value={n}>{n}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Навигация по страницам — твоя, без изменений по логике */}
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
                                    cursor: totalPages === 1 ? "not-allowed" : "pointer",
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

                                const goToPage = (n: number) => {
                                    const clamped = Math.max(1, Math.min(totalPages, n || 1));
                                    setCurrentPage(clamped);
                                };

                                const commitPageInput = () => {
                                    const n = parseInt(pageInput, 10);
                                    if (Number.isFinite(n)) goToPage(n);
                                    else setPageInput(String(currentPage));
                                };

                                return (
                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        marginLeft: "auto",
                                        marginRight: "auto"
                                    }}>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage(currentPage <= 1 ? totalPages : currentPage - 1)}
                                            disabled={totalPages === 1}
                                            style={pillBtn}
                                            title={currentPage === 1 ? `Перейти на ${totalPages}` : `Стр. ${currentPage - 1}`}
                                        >
                                            <span className="material-icons">keyboard_arrow_left</span>
                                        </button>

                                        <input
                                            type="number"
                                            min={1}
                                            max={totalPages}
                                            value={pageInput}
                                            onChange={(e) => setPageInput(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") commitPageInput(); }}
                                            onBlur={commitPageInput}
                                            style={inputSx}
                                            aria-label="Номер страницы"
                                        />
                                        <span style={{fontSize: 14, color: "#444"}}>из {totalPages}</span>

                                        <button
                                            type="button"
                                            onClick={() => setCurrentPage(currentPage >= totalPages ? 1 : currentPage + 1)}
                                            disabled={totalPages === 1}
                                            style={pillBtn}
                                            title={currentPage === totalPages ? "Перейти на 1" : `Стр. ${currentPage + 1}`}
                                        >
                                            <span className="material-icons">keyboard_arrow_right</span>
                                        </button>
                                    </div>
                                );
                            })()}
                        </div>

                    </div>
                )}

                {!selectedPreset && !loading && <div>Пожалуйста, выберите пресет.</div>}
                {selectedPreset && !loading && processedRows.length === 0 && (
                    <div>Нет данных для выбранного пресета.</div>
                )}
                <GroupActionModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    preset={selectedPreset?.preset ?? null}
                    action={modalAction!}
                    ids={modalIds}
                    idProjectMap={idProjectMap}
                    glagolParent={glagolParent}
                    role={role}
                    modules={modules}
                    onAfterAction={loadGroupedPhones}
                />
            </div>
            <button
                type="button"
                onClick={nextTask}
                title="Следующая задача"
                style={{
                    position: 'fixed',
                    right: 12,
                    bottom: 12,
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 999,
                    cursor: 'pointer',
                }}
            >
                <span className="material-icons" style={{ fontSize: 28, lineHeight: 1 }}>
                    skip_next
                </span>
            </button>
        </div>
    );
};

export default PresetSelectorTable;
