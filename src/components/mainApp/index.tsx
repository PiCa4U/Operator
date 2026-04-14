import React, {useState, useMemo, useEffect, useRef} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import HeaderPanel, {Project} from '../headerPanel';
import CallControlPanel, {ActiveCall, CallData, normalizeUrl} from '../callControlPanel';
import CallsDashboard from '../callsDashboard';
import ScriptPanel from '../scriptPanel';
import { socket } from "../../socket";
import { getCookies, makeId } from "../../utils";
import {
    makeSelectAccessibleProjectPool,
    selectAccessibleProjectNames,
    selectOperatorAccess,
    setActiveCalls,
    setFsStatus,
    setInterCalls,
    setUserStatuses
} from '../../redux/operatorSlice';
import {RootState, store} from '../../redux/store';
import TasksDashboard, {ApiRow, ColumnCfgWithSearch, OptionType, Preset} from "../taskDashboard";
import stylesButton from '../callControlPanel/index.module.css';
import axios from "axios";
import {ManagerPanel} from "../managerPanel";
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

const MemoCallControlPanel = React.memo(CallControlPanel);

const ITSM_SPLIT_KEY = "itsm:chat_call_split:v1";
type IncomingProgressStage = "accepted" | "connecting" | "loading_card";
type CallTabVisualState = "idle" | "incoming" | "active";

function incomingSessionId(session: any): string {
    return String(session?.id ?? session?.request?.callId ?? "");
}

function isPageHidden(): boolean {
    if (typeof document === "undefined") return false;
    if (document.visibilityState !== "visible") return true;
    if (typeof document.hasFocus === "function") return !document.hasFocus();
    return false;
}

function buildCallTabFaviconHref(state: CallTabVisualState, blinkOn = true): string {
    const isBlinkVisible = state !== "incoming" || blinkOn;
    const fill =
        state === "active"
            ? "#22c55e"
            : state === "incoming"
                ? isBlinkVisible
                    ? "#ef4444"
                    : "#ffffff"
                : "#ffffff";
    const stroke =
        state === "active"
            ? "#15803d"
            : state === "incoming"
                ? isBlinkVisible
                    ? "#b91c1c"
                    : "#94a3b8"
                : "#94a3b8";

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="20" fill="${fill}" stroke="${stroke}" stroke-width="8" />
        </svg>
    `.trim();

    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function is4Digits(val: any) {
    return /^\d{4}$/.test(String(val ?? "").trim());
}

function is3Digits(val: any) {
    return /^\d{3}$/.test(String(val ?? "").trim());
}

function hasLetters(val: any) {
    return /[a-z]/i.test(String(val ?? "").trim());
}

function isInterWebRtcLeg(c: any) {
    const dest = String(c?.dest ?? "").trim();
    return !!dest && hasLetters(dest);
}

function isSofiaExternalLeg(c: any) {
    const s = `${c?.name ?? ""} ${c?.b_name ?? ""}`.toLowerCase();
    return s.includes("sofia/external/");
}

function extFromPresence(val: any): string | null {
    const m = String(val ?? "").trim().match(/^(\d{4})@/);
    return m?.[1] ?? null;
}

function extFromSofiaInternalName(val: any): string | null {
    const m = String(val ?? "").trim().match(/sofia\/internal\/(\d{4})@/i);
    return m?.[1] ?? null;
}

function pickInternalExt(...vals: any[]): string | null {
    for (const v of vals) {
        const s = String(v ?? "").trim();
        if (!s) continue;

        if (is4Digits(s)) return s;

        const fromPresence = extFromPresence(s);
        if (fromPresence) return fromPresence;

        const fromName = extFromSofiaInternalName(s);
        if (fromName) return fromName;
    }

    return null;
}

function resolveInterEndpoints(c: any) {
    const from = pickInternalExt(
        c?.cid_num,
        c?.cid_name,
        c?.name,
        c?.presence_id
    );

    const toCandidates = [
        c?.dest,
        c?.sent_callee_num,
        c?.callee_num,

        c?.b_dest,
        c?.b_sent_callee_num,
        c?.b_callee_num,
        c?.b_presence_id,
        c?.b_name,

        c?.presence_id,
    ]
        .map(v => pickInternalExt(v))
        .filter(Boolean) as string[];

    const to = toCandidates.find(ext => ext !== from) ?? null;

    return { from, to };
}

/**
 * Служебный leg нового внутреннего вызова.
 * Его не надо показывать как внешний звонок.
 */
function isInternalHelperLeg(c: any) {
    if (isSofiaExternalLeg(c)) return false;

    const app = String(c?.application ?? "").trim().toLowerCase();
    const dest = String(c?.dest ?? "").trim();
    const from = pickInternalExt(
        c?.cid_num,
        c?.cid_name,
        c?.name,
        c?.presence_id
    );

    return !!from && app === "callcenter" && dest === "999";
}

function hasAnyBSide(c: any) {
    return [
        c?.b_uuid,
        c?.b_call_uuid,
        c?.b_presence_id,
        c?.b_name,
        c?.b_created,
        c?.b_created_epoch,
        c?.b_cid_num,
        c?.b_cid_name,
        c?.b_dest,
        c?.b_application,
        c?.b_callstate,
        c?.b_state,
    ].some(v => String(v ?? "").trim() !== "");
}

function hasResolvedOperatorOnB(c: any) {
    return !!pickInternalExt(
        c?.b_dest,
        c?.b_presence_id,
        c?.b_name,
        c?.b_cid_num,
        c?.b_cid_name,
        c?.b_sent_callee_num
    );
}

function isMyLocalExtensionLeg(c: any, myLogin: string) {
    if (!myLogin) return false;

    const my = String(myLogin).trim().toLowerCase();

    const cidNum = String(c?.cid_num ?? "").trim().toLowerCase();
    const cidName = String(c?.cid_name ?? "").trim().toLowerCase();
    const presenceId = String(c?.presence_id ?? "").trim().toLowerCase();
    const name = String(c?.name ?? "").trim().toLowerCase();

    if (cidNum === my) return true;
    if (cidName === my) return true;
    if (presenceId.startsWith(`${my}@`)) return true;
    if (name.includes(`sofia/internal/${my}@`)) return true;

    return false;
}

/**
 * Мусорный leg после attended transfer через добавочный.
 *
 * Не режем:
 * - живую консультацию, пока consultSession ещё существует
 * - обычные внешние вызовы
 * - обычные внутренние 4-значные вызовы
 *
 * Режем:
 * - локальный uuid_bridge leg на 3-значный добавочный,
 *   который остался после перевода
 */
function isGhostTransferredExtensionLeg(
    c: any,
    myLogin: string,
    hasLiveConsult: boolean
) {
    if (isSofiaExternalLeg(c)) return false;

    const app = String(c?.application ?? "").trim().toLowerCase();
    const dest = String(c?.dest ?? "").trim();
    const state = String(c?.state ?? "").trim().toUpperCase();
    const callstate = String(c?.callstate ?? "").trim().toUpperCase();

    if (app !== "uuid_bridge") return false;
    if (!is3Digits(dest)) return false;
    if (!isMyLocalExtensionLeg(c, myLogin)) return false;

    // именно тот подвисший тип, который ты показывал
    if (state !== "CS_SOFT_EXECUTE") return false;
    if (callstate !== "ACTIVE") return false;

    // пока консультация реально жива в softphone — это не мусор
    if (hasLiveConsult) return false;

    // вариант 1: b-сторона уже пустая
    if (!hasAnyBSide(c)) return true;

    // вариант 2: b-сторона ещё есть, но уже виден реальный оператор
    // (например b_presence_id = 1000@...)
    if (hasResolvedOperatorOnB(c)) return true;

    return false;
}

function isInterOperatorLeg(c: any) {
    if (isSofiaExternalLeg(c)) return false;

    const { from, to } = resolveInterEndpoints(c);
    return !!from && !!to && from !== to;
}

function splitFsCalls(all: any[]) {
    const inter = all.filter(isInterOperatorLeg);

    const rest = all.filter(
        c =>
            !isInterOperatorLeg(c) &&
            !isInternalHelperLeg(c) &&
            !isInterWebRtcLeg(c)
    );

    return { interCalls: inter, activeCalls: rest };
}

function clamp(n: number, min: number, max: number) {
    return Math.min(max, Math.max(min, n));
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

        message_type: (r.message_type ?? "message") as any,
    };
}


function makeCardUrl(openedPhones: any[], matchedPreset: OptionType | null) {
    const u = new URL(window.location.href);
    u.searchParams.set("card", "1");


    const ids = (openedPhones ?? [])
        .map((p: any) => p?.id)
        .filter((id: any) => Number.isFinite(id));
    if (ids.length) u.searchParams.set("ids", ids.join(","));


    const gb = matchedPreset?.preset?.group_by ?? [];
    const gt = matchedPreset?.preset?.group_table ?? "";
    if (Array.isArray(gb) && gb.length) u.searchParams.set("gb", gb.join(","));
    if (gt) u.searchParams.set("gt", gt);


    const firstGuid = (openedPhones ?? []).find((p: any) => p?.guid)?.guid;
    if (firstGuid) u.searchParams.set("guid", String(firstGuid));


    u.searchParams.set("tusk", "1");

    return u.toString();
}


async function fetchGroupPhonesByIdsUsingPreset(
    ids: number[],
    group_table: string,
    group_by: string[]
) {
    const { glagolParent } = store.getState().credentials;

    const params: any = {
        glagol_parent: glagolParent,
        page: 1,
        limit: Math.max(ids.length, 50),
        group_table,
        group_by: group_by.join(","),


        ids: ids.join(","),
    };

    const { data } = await axios.get("/api/v1/grouped_contacts", { params });

    const rows = Array.isArray(data?.data) ? data.data : [];

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

function normalizeLogins(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);

    if (typeof val === "string") {
        const t = val.trim();
        if (!t) return [];
        return t.includes(",") ? t.split(",").map(s => s.trim()).filter(Boolean) : [t];
    }

    // иногда может прилетать объект-словарь { "1000": true, "client": true }
    if (typeof val === "object") {
        return Object.keys(val).filter(k => Boolean((val as any)[k]));
    }

    return [String(val)].map(s => s.trim()).filter(Boolean);
}

function extractReadStatusFromRaw(r: any): ReadStatus | null {
    if (!r || typeof r !== "object") return null;

    // самый вероятный вариант — вложенный объект статуса
    const obj =
        r.watch_status ??
        r.read_status ??
        r.readStatus ??
        r.watch ??
        r.read ??
        null;

    if (obj && typeof obj === "object") {
        const watched = normalizeLogins(
            (obj as any).watched ?? (obj as any).watchers ?? (obj as any).read_by ?? (obj as any).readers ?? (obj as any).seen_by
        );
        const responsible = Boolean((obj as any).responsible_watch ?? (obj as any).responsibleWatch ?? (obj as any).responsible);
        if (watched.length || responsible) return { watched, responsible_watch: responsible };
    }

    const watched = normalizeLogins(r.watched ?? r.watchers ?? r.read_by ?? r.readers ?? r.seen_by ?? r.seenBy);
    const responsible = Boolean(r.responsible_watch ?? r.responsibleWatch ?? false);
    if (watched.length || responsible) return { watched, responsible_watch: responsible };

    return null;
}

function mergeReadMap(prev: ReadMap, ids: number[], readerLogin?: string | null): ReadMap {
    const who = String(readerLogin ?? "").trim();
    if (!who) return prev;

    let changed = false;
    const next: ReadMap = { ...prev };

    for (const id of ids) {
        const key = String(id);
        const cur = next[key] ?? { watched: [], responsible_watch: false };
        if (!cur.watched.includes(who)) {
            next[key] = { ...cur, watched: [...cur.watched, who] };
            changed = true;
        }
    }

    return changed ? next : prev;
}

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
function normalizeStringArray(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(String).map(s => s.trim()).filter(Boolean);
    if (typeof val === "string") return val.split(",").map(s => s.trim()).filter(Boolean);
    return [String(val)].map(s => s.trim()).filter(Boolean);
}

function sortGroupFactorKeys(keys: string[]) {
    const num = (k: string) => {
        const m = k.match(/group_factor_(\d+)/);
        return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
    };
    return [...keys].sort((a, b) => num(a) - num(b));
}

function pickGroupLockFactors(selectedPreset: OptionType | null, row: any): string[] {
    // ✅ сначала пробуем достать реальные group_factor_* которые есть в row / contact_info
    const ci = row?.contact_info && typeof row.contact_info === "object" ? row.contact_info : {};
    const merged = { ...row, ...ci };

    const fromRow = Object.keys(merged).filter(k => k.startsWith("group_factor_"));
    if (fromRow.length) return sortGroupFactorKeys(fromRow);

    // fallback (если вдруг row не содержит group_factor_*): берём из пресета, но только group_factor_*
    const fromPreset = normalizeStringArray(selectedPreset?.preset?.group_by)
        .filter((k) => String(k).startsWith("group_factor_"));

    return sortGroupFactorKeys(fromPreset);
}

function pickFactorValue(row: any, factor: string): string | null {
    const ci = row?.contact_info && typeof row.contact_info === "object" ? row.contact_info : {};

    // ✅ приоритет contact_info, потом root
    const raw =
        factor.includes(".")
            ? getByPath(ci, factor) ?? getByPath(row, factor)
            : ci?.[factor] ?? row?.[factor];

    const arr = normalizeToArray(raw).map(v => String(v).trim()).filter(Boolean);
    return arr.length ? arr[0] : null;
}

function normalizeLockFactorsFromPreset(preset: any): string[] {
    // что именно хранит бек — не уверен, поэтому поддержим варианты
    const raw =
        preset?.lock_factors ??
        preset?.group_lock_factors ??
        preset?.factors ??
        preset?.group_factors ??
        preset?.group_by; // fallback (если у вас group_by = ["group_factor_1", ...])

    const arr = normalizeStringArray(raw);

    // приводим к виду group_factor_N
    const out = arr
        .map((x) => String(x).trim())
        .filter(Boolean)
        .map((x) => {
            if (/^group_factor_\d+$/i.test(x)) return x;
            if (/^\d+$/.test(x)) return `group_factor_${x}`; // если вдруг приходит ["1","2"]
            return x; // на всякий (но тогда pickFactorValue может не найти)
        });

    // критично: если вышли не group_factor_* — лучше не лочить вообще
    const onlyGf = out.filter((x) => /^group_factor_\d+$/i.test(x));
    return onlyGf;
}

function resolvePresetForProject(projectName: string, presets: OptionType[], selectedPreset: OptionType | null) {
    const p = String(projectName || "").trim();
    if (!p) return null;

    if (selectedPreset?.preset?.projects?.includes(p)) return selectedPreset;
    const found = (presets || []).find(x => x?.preset?.projects?.includes(p));
    return found ?? null;
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

function digitsOnlyPhone(val: any): string {
    return String(val ?? "").replace(/\D+/g, "");
}

function buildPhoneSearchValues(val: any): string[] {
    const raw = String(val ?? "").trim();
    const digits = digitsOnlyPhone(raw);
    return Array.from(new Set([raw, digits].filter(Boolean)));
}

function rowMatchesPhone(row: any, phoneValues: string[]): boolean {
    const known = new Set(
        phoneValues.flatMap((value) => {
            const raw = String(value ?? "").trim();
            const digits = digitsOnlyPhone(raw);
            return [raw, digits].filter(Boolean);
        })
    );

    return [
        row?.phone,
        row?.contact_info?.phone,
        row?.phone_number,
        row?.msisdn,
        row?.cid_num,
        row?.b_line_num,
        row?.a_line_num,
    ].some((value) => {
        const raw = String(value ?? "").trim();
        if (!raw) return false;
        const digits = digitsOnlyPhone(raw);
        return known.has(raw) || (!!digits && known.has(digits));
    });
}
function fsStatusSig(msg: any): string {
    return [
        msg?.status ?? "",
        msg?.state ?? "",
        msg?.sip_login ?? "",
    ].join("|");
}

function normalizeSofiaStatus(s: any): string {
    const str = String(s ?? "");
    // Убираем счётчик секунд и дату (они “тикают”)
    return str
        .replace(/\s+EXPSECS\(\d+\)/g, "")
        .replace(/\s+EXP\([^)]+\)/g, "")
        .trim();
}

function stripVolatileFromUser(u: any) {
    if (!u || typeof u !== "object") return u;

    return {
        ...u,
        sofia_status: normalizeSofiaStatus(u.sofia_status),
    };
}

function sanitizeOtherUsers(msg: any) {
    if (!msg || typeof msg !== "object") return msg;
    const out: any = {};
    for (const k of Object.keys(msg)) {
        out[k] = stripVolatileFromUser(msg[k]);
    }
    return out;
}

function fsCallsSig(calls: any[]): string {
    return (calls || [])
        .map((c) => [
            c?.uuid ?? c?.b_uuid ?? "",
            c?.application ?? "",
            c?.b_callstate ?? "",
            c?.direction ?? "",
            c?.cid_num ?? "",
            c?.b_line_num ?? "",
        ].join("~"))
        .sort()
        .join(";");
}

function otherUsersSig(msg: any): string {
    if (!msg || typeof msg !== "object") return "";
    return Object.keys(msg)
        .sort()
        .map((k) => `${k}:${msg?.[k]?.status ?? msg?.[k]?.state ?? ""}`)
        .join("|");
}

export type MainAppProps = {
    isOwner: boolean;
};

const MemoLocalChat = React.memo(LocalChat) as typeof LocalChat;

const MainApp: React.FC<MainAppProps> = ({ isOwner }) => {
    const sip = useSip() as any;

    const {
        enabled,
        incoming,
        clearIncoming,
        remoteAudioRef,
        localAudioRef,
        answerCall,
        hangUp,
    } = sip;

    const sipStatus = sip?.status ?? null;
    const consultSession = sip?.consultSession ?? null;
    const consultStatus = sip?.consultStatus ?? null;

    const dispatch = useDispatch();

    const [selectedCall, setSelectedCall] = useState<CallData | null>(null);
    const [showScriptPanel, setShowScriptPanel] = useState<boolean>(false);
    const [activeCall, setActiveCall] = useState<boolean>(false);
    const [autoAnswerEnabled, setAutoAnswerEnabled] = useState(() => {
        return localStorage.getItem("autoAnswerEnabled") === "true";
    });
    const [incomingProgressStage, setIncomingProgressStage] = useState<IncomingProgressStage | null>(null);
    const [incomingProgressFrom, setIncomingProgressFrom] = useState<string>("");
    const [incomingProgressToneMode, setIncomingProgressToneMode] = useState<"none" | "once">("none");
    const [activeProjectName, setActiveProjectName] = useState<string>("")
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [postActive, setPostActive] = useState<boolean>(false);
    const [postTransitionPending, setPostTransitionPending] = useState<boolean>(false);
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
    const [queueProjectMap, setQueueProjectMap] = useState<Record<string, string>>({});

    const [phoneID, setPhoneID] = useState<number|null>(null)

    const [appliedLocalFilters, setAppliedLocalFilters] = useState<Record<string, string>>({});
    const [appliedServerFilters, setAppliedServerFilters] = useState<Record<string, ServerAppliedByCol>>({});
    const [localFilterDraft, setLocalFilterDraft] = useState<Record<string, string>>({});
    const [serverFilterDraft, setServerFilterDraft] = useState<Record<string, ServerDraftByCol>>({});
    const [unreadOnly, setUnreadOnly] = useState(false);

    const { start: defaultStart, end: defaultEnd } = getInitialDateRange();
    const [startDate, setStartDate] = useState<Date | null>(defaultStart);
    const [endDate, setEndDate]     = useState<Date | null>(defaultEnd);
    const [selectedStatus, setSelectedStatus] = useState<string | null>(() => {
        const saved = localStorage.getItem('selectedStatus');
        return saved !== null ? saved : null;
    });

    const lastFsStatusSigRef = useRef<string | null>(null);
    const lastFsCallsSigRef  = useRef<string | null>(null);
    const lastOtherUsersSigRef = useRef<string | null>(null);
    const inboundSearchSeqRef = useRef(0);

    const splitWrapRef = useRef<HTMLDivElement | null>(null);
    const splitDraggingRef = useRef(false);

    const lastGroupLockOnSigRef = useRef<string>("");
    const lockCtxRef = useRef<{
        assignedKey: string;
        projectName: string;
        factors: string[];
        sent: boolean;
        sig: string;
    }>({
        assignedKey: "",
        projectName: "",
        factors: [],
        sent: false,
        sig: "",
    });
    const expressProjectRef = useRef<string>("");
    const lockSourceRowRef = useRef<any>(null);
    const autoAnsweredIncomingRef = useRef<any>(null);
    const incomingBrowserNotificationRef = useRef<Notification | null>(null);
    const incomingBrowserNotificationKeyRef = useRef<string>("");
    const managedFaviconLinkRef = useRef<HTMLLinkElement | null>(null);
    const initialFaviconHrefRef = useRef<string | null>(null);
    const initialFaviconTypeRef = useRef<string | null>(null);
    const initialFaviconRelRef = useRef<string | null>(null);
    const createdFaviconLinkRef = useRef(false);

    const lastOutStartTokenRef = useRef<string>("");

    const [chatCallRatio, setChatCallRatio] = useState<number>(() => {
        const raw = Number(localStorage.getItem(ITSM_SPLIT_KEY));
        return Number.isFinite(raw) ? clamp(raw, 0.25, 0.75) : 0.5;
    });
    const { sessionKey } = store.getState().operator

    const {
        sipLogin   = '',
        worker     = '',
        glagolParent = ''
    } = store.getState().credentials;

    const rawActiveCalls = useSelector((state: RootState) => state.operator.activeCalls);
    const activeCalls: any[] = useMemo(() => {
        return Array.isArray(rawActiveCalls) ? rawActiveCalls : Object.values(rawActiveCalls || {});
    }, [rawActiveCalls]);
    const activeCallsRef = useRef<any[]>(activeCalls);
    useEffect(() => {
        activeCallsRef.current = activeCalls;
    }, [activeCalls]);

    const rawInterCalls = useSelector((state: RootState) => (state.operator as any).interCalls);
    const interCalls: any[] = useMemo(() => {
        return Array.isArray(rawInterCalls) ? rawInterCalls : Object.values(rawInterCalls || {});
    }, [rawInterCalls]);

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

    const interCall = useMemo(() => pickPrimaryInterCall(interCalls), [interCalls]);

    const hasLiveConsult =
        !!consultSession && String(consultStatus ?? "") !== "Terminated";

    const effectivePostActive = postActive || postTransitionPending;
    const setUnifiedPostActive = React.useCallback((next: boolean) => {
        setPostActive(next);
        if (!next) {
            setPostTransitionPending(false);
        }
    }, []);
    const beginUnifiedPostTransition = React.useCallback(() => {
        setPostTransitionPending(true);
    }, []);
    const confirmUnifiedPostActive = React.useCallback(() => {
        setPostActive(true);
        setPostTransitionPending(false);
    }, []);
    const hasExternalActive = activeCalls.length > 0 || activeCall || effectivePostActive;
    const showInterOverlay = !!interCall && !hasExternalActive;
    const showInterInCardHeader = !!interCall && hasExternalActive;



    const hangupInterCall = React.useCallback((uuid: string) => {
        if (!uuid) return;
        if (!sessionKey || !worker || !sipLogin) return;
        socket.emit('sofia_operations', {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            uuid: uuid,
            action: 'uuid_break',
            idle_set: false
        });
    }, [sessionKey, worker, sipLogin]);


    function interStateLabel(c: any) {
        const st = String(c?.callstate ?? "").toUpperCase();
        if (st === "ACTIVE") return "разговор";
        if (st === "EARLY")  return "звонит";
        return st || "статус неизвестен";
    }

    function interPeerText(c: any, myLogin: string, dict: Record<string, string>) {
        const { from, to } = resolveInterEndpoints(c);

        const left = from ?? String(c?.cid_num ?? "").trim();
        const right =
            to ??
            extFromPresence(c?.b_presence_id) ??
            extFromPresence(c?.presence_id) ??
            String(c?.dest ?? "").trim();

        const pretty = (ext: string) => {
            try {
                return formatOperator(ext, dict) || ext;
            } catch {
                return ext;
            }
        };

        if (right === myLogin) {
            return `Внутренний вызов от ${pretty(left)} → вам (${myLogin})`;
        }

        if (left === myLogin) {
            return `Внутренний вызов на ${pretty(right)} (от вас ${myLogin})`;
        }

        return `Внутренний вызов: ${pretty(left)} → ${pretty(right)}`;
    }

    const InterCallOverlay: React.FC<{ call: any; onHangup: (uuid: string) => void }> = ({ call, onHangup }) => {
        return (
            <div
                style={{
                    position: "fixed",
                    top: 12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: 99999,
                    width: "min(920px, calc(100% - 24px))",
                    boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
                    borderRadius: 12,
                    background: "#fff",
                    border: "1px solid rgba(0,0,0,0.1)",
                    padding: "10px 12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, lineHeight: 1.2 }}>
                        {interPeerText(call, sipLogin, operatorDictStableRef.current)}
                    </div>
                    <div style={{ opacity: 0.75, fontSize: 13, marginTop: 2 }}>
                        Статус: {interStateLabel(call)} · uuid: {String(call?.uuid ?? "").slice(0, 8)}…
                    </div>
                </div>

                <button
                    className="btn btn-outline-danger"
                    onClick={() => onHangup(String(call?.uuid ?? ""))}
                >
                    Сбросить
                </button>
            </div>
        );
    };


    useEffect(() => {
        try {
            localStorage.setItem(ITSM_SPLIT_KEY, String(chatCallRatio));
        } catch {}
    }, [chatCallRatio]);

    useEffect(() => {
        const onMove = (e: PointerEvent) => {
            if (!splitDraggingRef.current) return;
            const el = splitWrapRef.current;
            if (!el) return;

            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;

            setChatCallRatio(clamp(ratio, 0.25, 0.75));
        };

        const onUp = () => {
            if (!splitDraggingRef.current) return;
            splitDraggingRef.current = false;

            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);

        return () => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
        };
    }, []);

    const [openedGroup, setOpenedGroup] = useState<any[]>([]);
    const [phonesData, setPhonesData] = useState<any[]>([])
    const [openedPhones, setOpenedPhones] = useState<any[]>([])
    const [GroupIDs, setGroupIDs] = useState<any[]>([])
    const { data: operatorDict = {} } = useOperatorsDirectory();
    const operatorDictStableRef = useRef(operatorDict);
    useEffect(() => {
        // обновляем только если реально поменялись ключи (быстро и достаточно)
        const prevKeys = Object.keys(operatorDictStableRef.current).length;
        const nextKeys = Object.keys(operatorDict).length;
        if (nextKeys !== prevKeys) operatorDictStableRef.current = operatorDict;
    }, [operatorDict]);

    const [managerPanel, setManagerPanel] = useState<boolean>(false)

    const momoProjectRepo = useRef<boolean>(false)
    const startModulesRanRef = useRef<boolean>(false);

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
    const [projectInboundSearchMap, setProjectInboundSearchMap] = useState<Record<string, boolean>>({});
    const [inboundSearchPending, setInboundSearchPending] = useState(false);
    const [readMap, setReadMap] = useState<ReadMap>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any[]>([]);
    const sentReadRef = useRef<Set<number>>(new Set());
    const queueByTypeRef = useRef<Record<string, Set<number>>>({});
    const timerRef = useRef<number | null>(null);

    const normalizeReadKey = (t?: string | null) => {
        const s = String(t ?? "message").trim().toLowerCase();
        if (s === "msg" || s === "chat") return "message";
        return s || "message";
    };

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


    const collapsed = useChatCollapsed(firstGuid);

    const toggleCollapsedRef = useRef<() => void>(() => {});
    useEffect(() => {
        toggleCollapsedRef.current = collapsed.toggle;
    }, [collapsed.toggle]);

    const onToggleCollapsed = React.useCallback(() => {
        toggleCollapsedRef.current();
    }, []);

    useEffect(() => {
        let alive = true;

        axios
            .get("/api/v1/projects", { params: { glagol_parent: glagolParent } })
            .then(({ data }) => {
                if (!alive) return;
                const arr = Array.isArray(data?.projects) ? data.projects : [];
                const dict: Record<string, string> = {};
                const nextInboundSearchMap: Record<string, boolean> = {};
                for (const p of arr) {
                    const key = String(p?.project_name || "").trim();
                    if (!key) continue;
                    const val = String(p?.glagol_name || p?.project_name || key);
                    dict[key] = val;
                    nextInboundSearchMap[key] = Boolean(p?.in_search ?? p?.search);
                }
                setProjectsDict(dict);
                setProjectInboundSearchMap(nextInboundSearchMap);
            })
            .catch((e) => {
                console.warn("Не удалось загрузить список проектов", e);
                setProjectsDict({});
                setProjectInboundSearchMap({});
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
    const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(() => {
        const saved = localStorage.getItem('tasksSelectedPreset');
        return saved ? JSON.parse(saved) as OptionType : null;
    });

    const role = useSelector((state: RootState) =>
        state.operator.monitorData.monitorUsers?.[sipLogin]?.type
    ) || "operator";

    // useEffect(() => {
    //     setAppliedLocalFilters({});
    //     setAppliedServerFilters({});
    // }, [selectedPreset]);

    useEffect(() => {
        if (!activeGuid) return;

        // ✅ при смене чата сбрасываем “что уже отправляли как read”
        sentReadRef.current = new Set();
        queueByTypeRef.current = {};
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }

        let alive = true;
        setChatError(null);

        (async () => {
            try {
                const rawRows = await fetchChatHistory(activeGuid, sessionKey);
                if (!alive) return;

                const myLogin = viewer.login ?? "client";
                const nextReadMap: ReadMap = {};
                const mapped = rawRows.map((r: any) => {
                    const ui = mapRow(r);

                    const st = extractReadStatusFromRaw(r);
                    if (st) nextReadMap[String(ui.id)] = st;

                    // ✅ isRead = “прочитал ли Я” (а не кто-то другой)
                    if (st?.watched?.length) {
                        ui.isRead = st.watched.includes(myLogin);
                    } else {
                        ui.isRead = false;
                    }

                    return ui;
                });

                setHistory(mapped);
                setReadMap(nextReadMap);
                setLive([]);
                setOptimistic([]);
            } catch {
                if (!alive) return;
                setChatError("Не удалось загрузить историю чата");
                setHistory([]);
                setReadMap({});
                setLive([]);
                setOptimistic([]);
            }
        })();

        return () => { alive = false; };
    }, [activeGuid, sessionKey, viewer.login]);


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
            return mine;
        }

        // клиент
        const clientTop = Number(resp?.client ?? 0);
        const clientInUnwatched = Number(resp?.unwatched?.client ?? 0);
        return clientTop || clientInUnwatched || 0;
    }

    const emitGroupLockOn = React.useCallback((row: any) => {
        if (!expressCall) return;
        if (!sessionKey || !worker || !sipLogin) return;

        const ctx = lockCtxRef.current;
        if (!ctx.assignedKey) return;    // ждём assignedKey
        if (ctx.sent) return;            // ✅ уже отправили лок — больше не шлём

        if (!row) return;

        const factorsRaw = lockCtxRef.current.factors;
        if (!factorsRaw.length) return; // нет факторов из пресета — не лочим

        const pairs = factorsRaw
            .map((f) => [f, pickFactorValue(row, f)] as const)
            .filter(([, v]) => Boolean(v));

        if (pairs.length !== factorsRaw.length) {
            return;
        }

        const factors = pairs.map(([f]) => f);
        const group_by = pairs.map(([, v]) => String(v));
        const sig = `${factors.join("|")}::${group_by.join("|")}`;

        if (sig === ctx.sig) return;

        ctx.sig = sig;
        ctx.sent = true;

        socket.emit("group_lock_on", {
            session_key: sessionKey,
            worker,
            sip_login: sipLogin,
            group_by,
            factors,
        });
    }, [expressCall, sessionKey, worker, sipLogin, selectedPreset]);

    useEffect(() => {
        if (!expressCall) return;

        const ctx = lockCtxRef.current;
        if (!ctx.assignedKey || ctx.sent) return;

        if (!openedPhones || openedPhones.length === 0) return;

        const row = lockSourceRowRef.current ?? (openedPhones ?? []).find(Boolean);
        if (!row) return;

        emitGroupLockOn(row);
    }, [expressCall, openedPhones, emitGroupLockOn]);
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

    const { connected, error: socketErr, send, markManyReadByType } = useChatSocket({
        guid: activeGuid,
        login: sipLogin,
        glagol_parent: glagolParent,

        onIncoming: (msg: UiMessage) => {
            setLive((prev: UiMessage[]) => [...prev, msg]);
            // if (activeGuid) void refreshUnreadCounts([activeGuid], true, sipLogin);
        },

        onAck: ({ tempId, message_id }) => {
            setOptimistic((prev: UiMessage[]) =>
                prev.map(m => (m.tempId === tempId ? { ...m, id: String(message_id), status: "sent" } : m))
            );
        },

        onRead: ({ ids, login: who }: { ids: number[]; login?: string | null }) => {
            if (!ids?.length) return;

            setReadMap(prev => mergeReadMap(prev, ids, who));

            const my = viewer.login ?? "client";
            if (!who || String(who) === my) {
                setHistory(prev => markReadMany(prev, ids));
                setLive(prev => markReadMany(prev, ids));
                setOptimistic(prev => markReadMany(prev, ids));
            }
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

    useEffect(() => {
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("card") !== "1") return;

        const idsCsv = sp.get("ids");
        const gbCsv  = sp.get("gb");
        const gt     = sp.get("gt");
        const guid   = sp.get("guid");
        const tusk   = sp.get("tusk") === "1";

        setShowTasksDashboard(true);

        (async () => {
            if (idsCsv && gbCsv && gt) {
                const ids = idsCsv.split(",").map(n => +n).filter(Boolean);
                const group_by = gbCsv.split(",").filter(Boolean);
                try {
                    const rows = await fetchGroupPhonesByIdsUsingPreset(ids, gt, group_by);
                    setOpenedPhones(rows);

                    const g = rows.find((r: any) => r.guid)?.guid || guid;
                    if (g) setActiveGuid(String(g));
                } catch (e) {
                    console.warn("fetchGroupPhonesByIdsUsingPreset failed", e);
                }
                return;
            }

            if (guid) {
                try {
                    const { data } = await chatApi.get(`/api/v1/contacts/${encodeURIComponent(guid)}`);
                    const contacts = Array.isArray(data?.data) ? data.data : [];
                    const rows = contacts.map((c: any, i: number) => ({
                        ...c,
                        id: c.id ?? -(i + 1),
                        phone: c?.phone ?? c?.contact_info?.phone ?? "",
                        project: c?.project ?? c?.contact_info?.project ?? "",
                        contact_info: c?.contact_info ?? {},
                        guid: String(c?.guid ?? c?.contact_info?.guid ?? guid),
                        storage: Array.isArray(c?.storage) ? c.storage : [],
                    }));
                    setOpenedPhones(rows);
                    setActiveGuid(String(guid));
                } catch (e) {
                    console.warn("fetch by guid failed", e);
                }
                return;
            }

        })();
    }, []);

    useEffect(() => {
        if (!isOwner || !enabled) {
            dispatch(setActiveCalls([]));
            dispatch(setInterCalls([]));
            setUnifiedPostActive(false);
        }
    }, [isOwner, enabled, dispatch, setUnifiedPostActive]);

    useEffect(() => {
        if (!connected || !messages.length) return;

        const isIncomingForMe = (m: UiMessage) => {
            if (sipLogin) return (m.authorLogin ?? null) !== sipLogin;
            return m.authorRole !== "client";
        };

        const byType: Record<string, number[]> = {};
        const flat: number[] = [];

        for (const m of messages) {
            const numId = Number(m.id);
            if (!Number.isFinite(numId)) continue;
            if (!isIncomingForMe(m)) continue;
            if (m.isRead) continue;
            if (sentReadRef.current.has(numId)) continue;

            const key = normalizeReadKey(m.message_type ?? "message");
            (byType[key] ||= []).push(numId);
            flat.push(numId);
        }

        if (!flat.length) return;

        // локально отмечаем read по ids (как у тебя было)
        setHistory(prev => markReadMany(prev, flat));
        setLive(prev => markReadMany(prev, flat));
        setOptimistic(prev => markReadMany(prev, flat));

        enqueueReadsByType(byType);
    }, [connected, messages, sipLogin]);

    const flushReads = () => {
        const byType: Record<string, number[]> = {};
        const flat: number[] = [];

        for (const [t, set] of Object.entries(queueByTypeRef.current)) {
            if (!set.size) continue;
            const arr = Array.from(set);
            set.clear();
            byType[t] = arr;
            flat.push(...arr);
        }

        const distinctFlat = Array.from(new Set(flat));
        if (!distinctFlat.length) return;

        markManyReadByType(byType);
        distinctFlat.forEach((id) => sentReadRef.current.add(id));
    };

    const enqueueReadsByType = (byType: Record<string, number[]>) => {
        for (const [t0, ids] of Object.entries(byType)) {
            const t = normalizeReadKey(t0);
            if (!Array.isArray(ids) || !ids.length) continue;

            const set = (queueByTypeRef.current[t] ||= new Set<number>());
            for (const id of ids) {
                if (!sentReadRef.current.has(id)) set.add(id);
            }
        }

        if (timerRef.current) return;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            flushReads();
        }, 200);
    };

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

    const handleSend = React.useCallback(
        async (text: string, files: File[] = [], messageType: string = "msg") => {
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
                authorName: sipLogin || "Клиент",
                authorRole: sipLogin ? "operator" : "client",
                attachments: atts,
                status: "pending",
                isRead: false,
                message_type: messageType,
            };

            setOptimistic((prev) => [...prev, msg]);

            try {
                await send(tempId, trimmed, files, messageType);
            } catch (e: any) {
                console.error(e);
            }
        },
        [activeGuid, sipLogin, send]
    );

    useEffect(() => {
        setSelectedStatus(null)
    },[selectedPreset])
    function getInitialDateRange(): { start: Date; end: Date } {
        const raw = localStorage.getItem('dateRange');
        if (raw) {
            try {
                const { start, end, saved } = JSON.parse(raw) as {
                    start: string;
                    end?: string;
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

    useEffect(() => {
        localStorage.setItem('showTasksDashboard', JSON.stringify(showTasksDashboard));
    }, [showTasksDashboard]);

    useEffect(() => {
        localStorage.setItem('tasksCurrentPage', currentPresetPage.toString());
    }, [currentPresetPage]);


    useEffect(() => {
        if (!selectedCall || !openedPhones.length) {
            setScriptProject("")
        }
    },[openedPhones.length, selectedCall])


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

    const [fullWidthCard, setFullWidthCard] = useState<boolean>(() => {
        try {
            return JSON.parse(localStorage.getItem('fullWidthCard') ?? 'false');
        } catch {
            return false;
        }
    });


    function cleanProjectName(name?: string | null): string {
        const _name = name ?? '';
        return _name
            .replace(/(\s*\(.*?\)|@default)\s*$/g, '')
            .trim();
    }
    useEffect(() => {
        if (activeCalls.length || effectivePostActive) return
        if (selectedCall) {
        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {

        }
        if (selectedCall && Object.values(selectedCall.projects)[0].call_result === null) {
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
    },[activeCalls.length, effectivePostActive, selectedCall, sessionKey, worker])

    useEffect(()=> {
        if (showTasksDashboard && !momoProjectRepo.current) {
            setSelectedCall(null)
        }
    },[showTasksDashboard])

    const operatorAccess = useSelector(selectOperatorAccess);
    const accessibleProjectNames = useSelector(selectAccessibleProjectNames);
    const selectAccessibleProjectPool = useMemo(() => makeSelectAccessibleProjectPool(sipLogin), [sipLogin]);
    const accessibleProjectPool = useSelector(selectAccessibleProjectPool) || [];
    const accessibleProjectPoolNames = useMemo(() => {
        return accessibleProjectPool.map(project => project.project_name);
    }, [accessibleProjectPool]);
    const presetProjectScope = useMemo(() => {
        return operatorAccess.loaded ? accessibleProjectNames : accessibleProjectPoolNames;
    }, [accessibleProjectNames, accessibleProjectPoolNames, operatorAccess.loaded]);

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
    },[showTasksDashboard, effectivePostActive, activeCalls.length, selectedCall])

    const groupProjects = useMemo(() =>
            Array.from(new Set(openedPhones.map(p => p.project))),
        [openedPhones]
    );
    const projectPool = accessibleProjectPool;

    useEffect(() => {
        if (!role || !presetProjectScope.length || presets.length > 0) return;

        let alive = true;
        axios.post<Preset[]>("/api/v1/get_preset_list", {
            glagol_parent: glagolParent,
            worker,
            projects: presetProjectScope,
            role,
        }).then((resp) => {
            if (!alive) return;
            const data: Preset[] = Array.isArray(resp.data) ? resp.data : [];
            const filteredData =
                operatorAccess.presetIds === null
                    ? data
                    : data.filter((preset) => (operatorAccess.presetIds ?? []).includes(Number(preset.id)));
            setPresets(filteredData.map((p) => ({ value: p.id, label: p.preset_name, preset: p })));
        }).catch((err) => {
            console.error("Ошибка при предзагрузке пресетов в mainApp:", err);
        });

        return () => {
            alive = false;
        };
    }, [glagolParent, operatorAccess.presetIds, presetProjectScope, presets.length, role, worker]);

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

    }, [openedGroup, phonesData, outboundID, GroupIDs, outboundCall, showTasksDashboard]);



    // const sessionKey = getCookies('session_key') || '';
    useEffect(() => {
        try {
            localStorage.setItem('fullWidthCard', JSON.stringify(fullWidthCard));
        } catch {}
    }, [fullWidthCard]);

    useEffect(()=> {
        if (!activeCall && !effectivePostActive && (modules.length || Object.keys(monoModules).length) && !openedPhones.length && !selectedCall) {
            setModules([])
            setMonoModules({})
        }
    },[activeCall, effectivePostActive, modules.length, monoModules, openedPhones.length, selectedCall])

    useEffect(() => {
        if (!activeCall && !effectivePostActive) {
            inboundSearchSeqRef.current += 1;
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
    }, [activeCall, effectivePostActive]);

    useEffect(() => {
        if(openedPhones.length === 0) {
            momoProjectRepo.current = false
        }
    },[openedPhones])

    useEffect(() => {
        if (postActive && postTransitionPending) {
            setPostTransitionPending(false);
        }
    }, [postActive, postTransitionPending]);

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
        const first = activeCalls && activeCalls.length ? activeCalls[0] : {};

        if (activeCalls.length > 0 && !activeCall && (first?.application || first?.b_callstate === "ACTIVE")) {
            if (first.direction === "outbound") {
                socket.emit("get_data", {
                    worker,
                    session_key: sessionKey,
                    sip_login: sipLogin,
                })
            }
            setActiveCall(true);
        } else if (!activeCalls.length && activeCall) {
            setActiveCall(false);
        }
    }, [activeCall, activeCalls]);

    function normalizeGetDataRows(payload: any) {
        const arr =
            Array.isArray(payload) ? payload :
                Array.isArray(payload?.data) ? payload.data :
                    Array.isArray(payload?.result) ? payload.result :
                        [];

        return arr
            .filter(Boolean)
            .map((r: any, i: number) => {
                const id = Number(r?.id ?? r?.phone_id ?? r?.contact_id ?? (i + 1));
                const phone = String(r?.phone ?? r?.contact_info?.phone ?? r?.b_line_num ?? r?.a_line_num ?? "");
                const project = String(r?.project ?? r?.project_name ?? r?.contact_info?.project ?? r?.projectName ?? "");
                const guid = r?.guid ?? r?.contact_info?.guid ?? null;

                return {
                    ...r,
                    id,
                    phone,
                    project,
                    contact_info: r?.contact_info ?? {},
                    guid,
                    storage: Array.isArray(r?.storage) ? r.storage : [],
                };
            });
    }

    function sigByIds(rows: any[]) {
        const ids = (rows ?? [])
            .map((x: any) => Number(x?.id))
            .filter((n: number) => Number.isFinite(n))
            .sort((a, b) => a - b);
        return ids.join(",");
    }

    const lastGetDataSigRef = useRef<string>("");

    useEffect(() => {
        if (!sessionKey || !worker || !sipLogin) return;

        const onGetData = (payload: any) => {
            const rows = normalizeGetDataRows(payload);
            if (!rows.length) return;
            startModulesRanRef.current = false;
            const sig = sigByIds(rows);
            lastGetDataSigRef.current = sig;

            setShowTasksDashboard(true);

            setPhonesData(rows);

            const ids = rows
                .map((r: any) => Number(r?.id))
                .filter((n: number) => Number.isFinite(n));

            setOpenedGroup(ids);
            setGroupIDs(ids.length ? [ids] : []);

            setOpenedPhones(rows);

            const g = rows.find((r: any) => r?.guid)?.guid ?? rows.find((r: any) => r?.contact_info?.guid)?.contact_info?.guid;
            if (g) setActiveGuid(String(g));
            if (managerPanel) {
                setManagerPanel(false)
            }
            setOutActivePhoneData(rows[0] ?? null);
        };

        socket.on("get_data", onGetData);
        return () => {
            socket.off("get_data", onGetData);
        };
    }, [sessionKey, worker, sipLogin]);

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

    useEffect(() => {
        if (!glagolParent) {
            setQueueProjectMap({});
            return;
        }

        let cancelled = false;

        axios
            .get("/api/v1/queues", {
                params: {
                    glagol_parent: glagolParent,
                },
            })
            .then((resp) => {
                if (cancelled) return;

                const items = Array.isArray(resp.data) ? resp.data : resp.data?.result ?? [];
                const nextMap: Record<string, string> = {};

                items.forEach((item: any) => {
                    const queueName = String(item?.queue || "").trim();
                    const projectName = String(item?.project || "").trim();

                    if (!queueName || !projectName) return;
                    nextMap[queueName] = projectName;
                });

                setQueueProjectMap(nextMap);
            })
            .catch((error) => {
                if (!cancelled) {
                    console.error("Не удалось загрузить соответствие очередей проектам", error);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [glagolParent]);

    useEffect(() => {
        const isInboundSearchEnabled = (projectName: string) => {
            const key = String(projectName ?? "").trim();
            if (!key) return false;

            if (Object.prototype.hasOwnProperty.call(projectInboundSearchMap, key)) {
                return Boolean(projectInboundSearchMap[key]);
            }

            const fallbackProject = accessibleProjectPool.find(
                (project: any) => String(project?.project_name ?? "").trim() === key
            );

            return Boolean(fallbackProject?.in_search ?? fallbackProject?.search);
        };

        const mapPresetOptions = (items: Preset[]) => {
            const filteredData =
                operatorAccess.presetIds === null
                    ? items
                    : items.filter((preset) => (operatorAccess.presetIds ?? []).includes(Number(preset.id)));

            return filteredData.map((preset) => ({
                value: preset.id,
                label: preset.preset_name,
                preset,
            }));
        };

        const tryOpenInboundCardByPhone = async (projectName: string, phone: string) => {
            const cleanProjectName = String(projectName ?? "").trim();
            const phoneValues = buildPhoneSearchValues(phone);

            if (!cleanProjectName || !phoneValues.length) {
                setInboundSearchPending(false);
                return;
            }
            if (!isInboundSearchEnabled(cleanProjectName)) {
                setInboundSearchPending(false);
                return;
            }

            const seq = ++inboundSearchSeqRef.current;

            try {
                let matchedPreset = resolvePresetForProject(cleanProjectName, presets, selectedPreset);

                if (!matchedPreset) {
                    const requestProjects = Array.from(
                        new Set([...presetProjectScope, cleanProjectName].filter(Boolean))
                    );

                    const resp = await axios.post<Preset[]>("/api/v1/get_preset_list", {
                        glagol_parent: glagolParent,
                        worker,
                        projects: requestProjects.length ? requestProjects : [cleanProjectName],
                        role,
                    });

                    if (seq !== inboundSearchSeqRef.current) return;

                    const nextOptions = mapPresetOptions(Array.isArray(resp.data) ? resp.data : []);

                    if (nextOptions.length > 0) {
                        setPresets((prev) => {
                            const merged = new Map<number, OptionType>();
                            [...prev, ...nextOptions].forEach((option) => {
                                merged.set(Number(option.value), option);
                            });
                            return Array.from(merged.values());
                        });
                    }

                    matchedPreset = resolvePresetForProject(cleanProjectName, nextOptions, selectedPreset);
                }

                if (seq !== inboundSearchSeqRef.current) return;
                if (!matchedPreset) {
                    setInboundSearchPending(false);
                    return;
                }

                const response = await axios.post<any>("/api/v1/grouped_contacts", {
                    glagol_parent: glagolParent,
                    group_by: matchedPreset.preset.group_by,
                    filter_by: {
                        project: ["IN", matchedPreset.preset.projects],
                        phone: ["IN", phoneValues],
                    },
                    group_table: matchedPreset.preset.group_table,
                    role,
                });

                if (seq !== inboundSearchSeqRef.current) return;

                const allGroups = extractPhoneGroups(response.data);
                const flatPhones = allGroups.flat();

                if (!flatPhones.length) {
                    setInboundSearchPending(false);
                    return;
                }

                const matchedGroups = allGroups.filter((group) =>
                    group.some((item) => rowMatchesPhone(item, phoneValues))
                );
                const groupsToOpen = matchedGroups.length > 0 ? matchedGroups : allGroups;
                const opened = groupsToOpen.flat();

                if (!opened.length) {
                    setInboundSearchPending(false);
                    return;
                }

                startModulesRanRef.current = false;
                setSelectedPreset(matchedPreset);
                setShowTasksDashboard(true);
                setPhonesData(flatPhones);

                const normalizedAllGroupIDs = allGroups.map((group) =>
                    group
                        .map((item) => Number(item?.id))
                        .filter((id) => Number.isFinite(id))
                );
                const matchedGroupIDs = Array.from(
                    new Set(
                        opened
                            .map((item) => Number(item?.id))
                            .filter((id) => Number.isFinite(id))
                    )
                );

                setGroupIDs(normalizedAllGroupIDs);
                setOpenedGroup(matchedGroupIDs);
                setOpenedPhones(opened);

                const anchor =
                    opened.find((item) =>
                        String(item?.project ?? "").trim() === cleanProjectName &&
                        rowMatchesPhone(item, phoneValues)
                    ) ||
                    opened.find((item) => rowMatchesPhone(item, phoneValues)) ||
                    opened[0];

                const nextPhoneId = Number(anchor?.id);
                if (Number.isFinite(nextPhoneId)) {
                    setPhoneID(nextPhoneId);
                }
                setInboundSearchPending(false);
            } catch (err) {
                setInboundSearchPending(false);
                console.error("Ошибка при inbound search по номеру:", err);
            }
        };

        const handleFsDiaDes = (msg: any) => {
            const queueName = String(msg?.project_name ?? msg?.queue ?? "").trim();
            const resolvedProjectName = queueProjectMap[queueName] || queueName;
            const incomingPhone = String(activeCalls[0]?.cid_num ?? "").trim();
            const shouldDelayStartModules = Boolean(
                resolvedProjectName &&
                incomingPhone &&
                isInboundSearchEnabled(resolvedProjectName)
            );

            expressProjectRef.current = resolvedProjectName;
            setActiveProjectName(resolvedProjectName);
            setInboundSearchPending(shouldDelayStartModules);

            if (incomingPhone) {
                socket.emit('check_express', {
                    phone: incomingPhone,
                    project_name: resolvedProjectName,
                    session_key: sessionKey,
                    worker,
                });
            }

            socket.emit('get_fs_reasons', {
                project_name: resolvedProjectName,
                session_key: sessionKey,
                worker,
            });
        };

        const handleCheckExpress = (check: any) => {
            if (check?.express) {
                if (!check?.assigned_key) {
                    setInboundSearchPending(false);
                    return;
                }
                setInboundSearchPending(false);
                normalizeUrl()
                setOpenedPhones?.([]);
                setOpenedGroup?.([]);
                setPhonesData?.([]);
                startModulesRanRef.current = false;

                setShowTasksDashboard(true)
                setAssignedKey(check.assigned_key);
                setExpressCall(check.express)
                setOutActiveProjectName(activeProjectName)
                setOutActivePhone(activeCalls[0].cid_num)
                socket.emit('get_phone_line', {
                    worker,
                    session_key: sessionKey,
                    project_name: activeProjectName,
                    phones: [activeCalls[0].cid_num],
                    express: check.express
                });
                const projectName = expressProjectRef.current || String(activeProjectName ?? "").trim();
                const matchedPreset = resolvePresetForProject(projectName, presets, selectedPreset);

                const factors = matchedPreset ? normalizeLockFactorsFromPreset(matchedPreset.preset) : [];

                lockCtxRef.current = {
                    assignedKey: String(check.assigned_key),
                    projectName,
                    factors,
                    sent: false,
                    sig: "",
                };

                lockSourceRowRef.current = null;
                lastOutStartTokenRef.current = "";
                return;
            }

            const projectName = expressProjectRef.current || String(activeProjectName ?? "").trim();
            const incomingPhone = String(activeCalls[0]?.cid_num ?? "").trim();

            if (projectName && incomingPhone && isInboundSearchEnabled(projectName)) {
                void tryOpenInboundCardByPhone(projectName, incomingPhone);
                return;
            }

            setInboundSearchPending(false);
        };

        const handleGetPhoneLine = (msg: any) => {
            const pl = msg?.phone_line?.[0];

            // ✅ дедуп по special_key / id (чтобы accept/lock не повторялись при повторных get_out_start)
            const token = String(pl?.special_key ?? pl?.id ?? "");
            if (token && token === lastOutStartTokenRef.current) return;
            if (token) lastOutStartTokenRef.current = token;

            if (pl?.special_key) {
                setSpecialKey(pl.special_key);
                if (assignedKey && pl.special_key) {
                    // socket.emit("outbound_call_update", {
                    //     worker,
                    //     session_key: sessionKey,
                    //     ...(assignedKey ? { assigned_key: assignedKey } : {}),
                    //     log_status: "ringing",
                    //     phone_status: "ringing",
                    //     special_key: pl.special_key,
                    // });
                }
            }

            if (expressCall) {
                // ✅ сохраняем “источник правды” для лока
                lockSourceRowRef.current = pl;

                socket.emit("accept_express_call", {
                    worker,
                    session_key: sessionKey,
                    assigned_key: assignedKey,
                    sip_login: sipLogin,
                    project_name: msg.project_name,
                });

                // ❌ НЕ вызываем emitGroupLockOn здесь
                // emitGroupLockOn(pl);
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
    }, [
        accessibleProjectPool,
        activeCalls,
        activeProjectName,
        assignedKey,
        emitGroupLockOn,
        expressCall,
        glagolParent,
        operatorAccess.presetIds,
        outboundCall,
        presetProjectScope,
        presets,
        projectInboundSearchMap,
        queueProjectMap,
        role,
        selectedPreset,
        sessionKey,
        worker,
    ]);

    function extractPhoneGroups(obj: any): any[][] {
        const groups: any[][] = [];
        function recurse(node: any) {
            if (Array.isArray(node)) {
                if (node.length && typeof node[0] === 'object' && 'phone' in node[0]) {
                    groups.push(node);
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
                        glagol_parent: glagolParent,
                        worker,
                        projects: presetProjectScope,
                        role,
                    });
                    const data: Preset[] = Array.isArray(resp.data) ? resp.data : [];
                    const filteredData =
                        operatorAccess.presetIds === null
                            ? data
                            : data.filter((preset) => (operatorAccess.presetIds ?? []).includes(Number(preset.id)));
                    myPresetsLocal = filteredData.map(p => ({ value: p.id, label: p.preset_name, preset: p }));
                    setPresets(myPresetsLocal);
                }

                const matchedPreset = myPresetsLocal.find(p =>
                    p.preset.projects.includes(projNamesSaved[0])
                );
                if (!matchedPreset) {
                    return;
                } else {
                    setSelectedPreset(matchedPreset);
                }

                const currentPhoneData =
                    // @ts-ignore — если у тебя уже есть такой стейт/проп, подставь реальный
                    (typeof getCurrentPhoneData === "function" ? getCurrentPhoneData(phoneID) : undefined) ||
                    // @ts-ignore — если хранишь массив phonesData
                    (Array.isArray(phonesData) ? phonesData.find((p: any) => p?.id === phoneID) : undefined) ||
                    {
                        phone: selectedCall?.b_line_num,
                        b_line_num: selectedCall?.b_line_num,
                        a_line_num: selectedCall?.a_line_num,
                        project: projNamesSaved?.[0],
                    };

                const groupFilter = buildGroupByFilter(matchedPreset.preset.group_by, currentPhoneData || {});
                const filter_by: Record<string, any> = {
                    project: ["IN", matchedPreset.preset.projects],
                    ...groupFilter,
                };

                const response2 = await axios.post<any>("/api/v1/grouped_contacts", {
                    glagol_parent: glagolParent,
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
                    setShowTasksDashboard(false);
                }
            } catch (err) {
                console.error("Ошибка при проверке пресетов:", err);
            }
        };

        fetchPresetsAndCheckPhone();
    }, [glagolParent, operatorAccess.presetIds, phoneID, presetProjectScope, presets, role, selectedCall, worker]);

    useEffect(() => {
        const handleFsStatus = (msg: any) => {
            dispatch(setFsStatus(msg));

            if (!isOwner || !enabled) return;

            if (msg.status === "Available (On Demand)" && msg.state === "Idle") {
                confirmUnifiedPostActive();
            } else if (
                msg.status === "Available (On Demand)" &&
                msg.state !== "Idle" &&
                !postTransitionPending
            ) {
                setUnifiedPostActive(false);
            }
        };

        const handleFsCalls = (msg: any) => {
            if (!isOwner || !enabled) return;

            const callsArray: any[] = Object.values(msg || {});
            const noConferenceArray = callsArray.filter(
                (item) => item?.application !== "conference"
            );

            const filteredArray = noConferenceArray.filter((c) => {
                return !isGhostTransferredExtensionLeg(c, sipLogin, hasLiveConsult);
            });

            const { interCalls, activeCalls } = splitFsCalls(filteredArray);
            const sig = fsCallsSig(activeCalls) + "||" + fsCallsSig(interCalls);
            if (sig === lastFsCallsSigRef.current) return;
            lastFsCallsSigRef.current = sig;
            const hadActiveCalls = activeCallsRef.current.length > 0;
            const hasNextActiveCalls = activeCalls.length > 0;

            if (!hasNextActiveCalls && hadActiveCalls) {
                beginUnifiedPostTransition();
                setIsLoading(true);
                socket.emit("fs_post_started", {
                    session_key: sessionKey,
                    sip_login: sipLogin,
                    worker,
                    reason: "postobrabotka",
                });
            } else if (hasNextActiveCalls) {
                setPostTransitionPending(false);
            }

            dispatch(setInterCalls(interCalls));
            dispatch(setActiveCalls(activeCalls));
        };

        const handleOtherUsers = (msg: any) => {
            if (!isOwner || !enabled) return;

            const clean = sanitizeOtherUsers(msg);

            const sig = otherUsersSig(clean);
            if (sig === lastOtherUsersSigRef.current) return;
            lastOtherUsersSigRef.current = sig;

            dispatch(setUserStatuses(clean));
        };

        if (!isOwner || !enabled) {
            socket.off("fs_status", handleFsStatus);
            socket.off("fs_calls", handleFsCalls);
            return;
        }

        socket.on("fs_status", handleFsStatus);
        socket.on("fs_calls", handleFsCalls);

        return () => {
            socket.off("fs_status", handleFsStatus);
            socket.off("fs_calls", handleFsCalls);
        };
    }, [beginUnifiedPostTransition, confirmUnifiedPostActive, dispatch, enabled, hasLiveConsult, isOwner, postTransitionPending, sessionKey, setUnifiedPostActive, sipLogin, worker]);
    useEffect(() => {
        if (!(activeCalls[0] && Object.keys(activeCalls[0]).length > 0)) return
        const first = activeCalls[0]
        if (first.direction === "inbound") {
            setShowTasksDashboard(false)
        }
        if (first.uuid !== "" && first.cid_num !== "" && !get_callcenter && !outboundCall){
            setGet_callcenter(true)
            setScriptDir("inbound")
            const requestParams = {
                session_key: sessionKey,
                worker,
                phone: activeCalls[0].cid_num,
                uuid: activeCalls[0].direction === "inbound" ? activeCalls[0].uuid : activeCalls[0].b_uuid
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

    const closeIncomingBrowserNotification = React.useCallback((resetKey = false) => {
        const current = incomingBrowserNotificationRef.current;
        if (current) {
            current.onclose = null;
            current.onclick = null;
            current.close();
            incomingBrowserNotificationRef.current = null;
        }
        if (resetKey) {
            incomingBrowserNotificationKeyRef.current = "";
        }
    }, []);

    useEffect(() => {
        const hideNotificationOnFocus = () => {
            if (isPageHidden()) return;
            closeIncomingBrowserNotification(false);
        };

        window.addEventListener("focus", hideNotificationOnFocus);
        document.addEventListener("visibilitychange", hideNotificationOnFocus);

        return () => {
            window.removeEventListener("focus", hideNotificationOnFocus);
            document.removeEventListener("visibilitychange", hideNotificationOnFocus);
        };
    }, [closeIncomingBrowserNotification]);

    useEffect(() => {
        const shouldClose =
            !isOwner ||
            !enabled ||
            outboundCall ||
            activeCall ||
            effectivePostActive ||
            !incoming ||
            incoming.state === SessionState.Terminated;

        if (shouldClose) {
            closeIncomingBrowserNotification(true);
            return;
        }

        if (typeof Notification === "undefined") return;
        if (Notification.permission !== "granted") return;
        if (!isPageHidden()) return;

        const incomingPhone = String(incoming?.remoteIdentity?.uri?.user ?? "").trim();
        const notificationKey = incomingSessionId(incoming) || incomingPhone;
        if (!notificationKey) return;
        if (incomingBrowserNotificationKeyRef.current === notificationKey) return;

        closeIncomingBrowserNotification(false);

        const title = autoAnswerEnabled ? "Автоподнятие вызова" : "Входящий вызов";
        const body = incomingPhone
            ? `Номер ${incomingPhone}. Нажмите, чтобы открыть звонковую вкладку.`
            : "Нажмите, чтобы открыть звонковую вкладку.";

        const notification = new Notification(title, {
            body,
            tag: `incoming-call:${notificationKey}`,
            requireInteraction: true,
        });

        notification.onclick = () => {
            try { window.focus(); } catch {}
            try { window.parent?.focus?.(); } catch {}
            window.setTimeout(() => {
                closeIncomingBrowserNotification(false);
            }, 50);
        };

        notification.onclose = () => {
            if (incomingBrowserNotificationRef.current === notification) {
                incomingBrowserNotificationRef.current = null;
            }
        };

        incomingBrowserNotificationRef.current = notification;
        incomingBrowserNotificationKeyRef.current = notificationKey;
    }, [
        activeCall,
        autoAnswerEnabled,
        closeIncomingBrowserNotification,
        enabled,
        incoming,
        isOwner,
        outboundCall,
        effectivePostActive,
    ]);

    useEffect(() => {
        return () => {
            closeIncomingBrowserNotification(true);
        };
    }, [closeIncomingBrowserNotification]);

    const hasActiveInterCall = useMemo(
        () => String(interCall?.callstate ?? "").toUpperCase() === "ACTIVE",
        [interCall]
    );
    const hasIncomingInterCall = useMemo(
        () => String(interCall?.callstate ?? "").toUpperCase() === "EARLY",
        [interCall]
    );
    const callTabVisualState = useMemo<CallTabVisualState>(() => {
        const hasLiveCall = activeCall || activeCalls.length > 0 || hasActiveInterCall;
        const hasIncomingCall =
            !outboundCall &&
            (((incoming && incoming.state !== SessionState.Terminated) ? true : false) || hasIncomingInterCall);

        if (hasIncomingCall && !hasLiveCall) return "incoming";
        if (hasLiveCall) return "active";
        return "idle";
    }, [activeCall, activeCalls.length, hasActiveInterCall, hasIncomingInterCall, incoming, outboundCall]);

    const ensureManagedFaviconLink = React.useCallback(() => {
        if (typeof document === "undefined") return null;
        if (managedFaviconLinkRef.current && document.head.contains(managedFaviconLinkRef.current)) {
            return managedFaviconLinkRef.current;
        }

        const existing = document.querySelector(
            "link[rel='icon'], link[rel='shortcut icon'], link[rel*='icon']"
        ) as HTMLLinkElement | null;

        if (existing) {
            managedFaviconLinkRef.current = existing;
            if (initialFaviconHrefRef.current === null) {
                initialFaviconHrefRef.current = existing.getAttribute("href");
                initialFaviconTypeRef.current = existing.getAttribute("type");
                initialFaviconRelRef.current = existing.getAttribute("rel");
            }
            return existing;
        }

        const created = document.createElement("link");
        created.setAttribute("rel", "icon");
        created.setAttribute("type", "image/svg+xml");
        document.head.appendChild(created);
        managedFaviconLinkRef.current = created;
        createdFaviconLinkRef.current = true;
        return created;
    }, []);

    const applyCallTabFavicon = React.useCallback((state: CallTabVisualState, blinkOn = true) => {
        const link = ensureManagedFaviconLink();
        if (!link) return;

        link.setAttribute("rel", initialFaviconRelRef.current || "icon");
        link.setAttribute("type", "image/svg+xml");
        link.setAttribute("href", buildCallTabFaviconHref(state, blinkOn));
    }, [ensureManagedFaviconLink]);

    const restoreCallTabFavicon = React.useCallback(() => {
        if (typeof document === "undefined") return;
        const link = managedFaviconLinkRef.current;
        if (!link) return;

        if (createdFaviconLinkRef.current && !initialFaviconHrefRef.current) {
            link.remove();
            managedFaviconLinkRef.current = null;
            createdFaviconLinkRef.current = false;
            return;
        }

        if (initialFaviconRelRef.current) link.setAttribute("rel", initialFaviconRelRef.current);
        else link.setAttribute("rel", "icon");

        if (initialFaviconTypeRef.current) link.setAttribute("type", initialFaviconTypeRef.current);
        else link.removeAttribute("type");

        if (initialFaviconHrefRef.current) link.setAttribute("href", initialFaviconHrefRef.current);
        else link.removeAttribute("href");
    }, []);

    useEffect(() => {
        if (!isOwner) {
            restoreCallTabFavicon();
            return;
        }

        if (callTabVisualState !== "incoming") {
            applyCallTabFavicon(callTabVisualState, true);
            return;
        }

        let blinkOn = true;
        applyCallTabFavicon("incoming", blinkOn);

        const timer = window.setInterval(() => {
            blinkOn = !blinkOn;
            applyCallTabFavicon("incoming", blinkOn);
        }, 700);

        return () => {
            window.clearInterval(timer);
        };
    }, [applyCallTabFavicon, callTabVisualState, isOwner, restoreCallTabFavicon]);

    useEffect(() => {
        return () => {
            restoreCallTabFavicon();
        };
    }, [restoreCallTabFavicon]);

    useEffect(() => {
        if (!incomingProgressStage) return;

        if (activeCall || effectivePostActive) {
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
            return;
        }

        if (sipStatus === SessionState.Terminated) {
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
            return;
        }

        if (sipStatus === SessionState.Established) {
            if (showInterOverlay) {
                setIncomingProgressStage(null);
                setIncomingProgressFrom("");
                setIncomingProgressToneMode("none");
                return;
            }
            setIncomingProgressStage((prev) => prev === "loading_card" ? prev : "loading_card");
            return;
        }

        if (sipStatus === SessionState.Establishing || (incoming && incoming.state !== SessionState.Initial)) {
            setIncomingProgressStage((prev) => {
                if (prev === "loading_card" || prev === "connecting") return prev;
                return "connecting";
            });
            return;
        }

        if (!incoming && !sipStatus) {
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
        }
    }, [activeCall, effectivePostActive, incoming, incomingProgressStage, showInterOverlay, sipStatus]);

    useEffect(() => {
        const shouldAutoAcceptIncoming = autoAnswerEnabled || outboundCall;
        if (!shouldAutoAcceptIncoming) return;
        if (!incoming || incoming.state !== SessionState.Initial) return;
        if (activeCall || effectivePostActive) return;
        if (autoAnsweredIncomingRef.current === incoming) return;

        autoAnsweredIncomingRef.current = incoming;

        if (outboundCall) {
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
        } else {
            setIncomingProgressFrom(incoming.remoteIdentity.uri.user || "");
            setIncomingProgressStage("accepted");
            setIncomingProgressToneMode("once");
        }

        answerCall().catch(() => {
            if (autoAnsweredIncomingRef.current === incoming) {
                autoAnsweredIncomingRef.current = null;
            }
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
        });
    }, [activeCall, answerCall, autoAnswerEnabled, effectivePostActive, incoming, outboundCall]);

    useEffect(() => {
        if (!incoming || incoming.state === SessionState.Terminated) {
            autoAnsweredIncomingRef.current = null;
        }
    }, [incoming]);

    const onAccept = () => {
        if (!incoming) return;
        autoAnsweredIncomingRef.current = incoming;
        setIncomingProgressFrom(incoming.remoteIdentity.uri.user || "");
        setIncomingProgressStage("accepted");
        setIncomingProgressToneMode("none");
        answerCall().catch(() => {
            if (autoAnsweredIncomingRef.current === incoming) {
                autoAnsweredIncomingRef.current = null;
            }
            setIncomingProgressStage(null);
            setIncomingProgressFrom("");
            setIncomingProgressToneMode("none");
        });
        // clearIncoming();
    };
    const onReject = () => {
        if (!incoming) return;
        autoAnsweredIncomingRef.current = null;
        setIncomingProgressStage(null);
        setIncomingProgressFrom("");
        setIncomingProgressToneMode("none");
        hangUp()
        clearIncoming();
    };

    function shortGuid(g: string, len = 8) {
        return g.length > len ? `...${g.slice(-len)}` : g;
    }

    function labelForGuid(g: string) {
        return shortGuid(g);

    }

    const popupFrom = incoming?.remoteIdentity.uri.user || incomingProgressFrom;
    const showIncomingInitialPopup = Boolean(
        incoming &&
        incoming.state === SessionState.Initial &&
        !incomingProgressStage &&
        !autoAnswerEnabled &&
        !outboundCall
    );
    const showIncomingProgressPopup = Boolean(
        incomingProgressStage &&
        !activeCall &&
        !effectivePostActive &&
        !outboundCall
    );


    const onCloseCall = React.useCallback(() => {
        setSelectedCall(null);
    }, []);

    return (
        <div className="container-fluid">
            {showInterOverlay && interCall && (
                <InterCallOverlay call={interCall} onHangup={hangupInterCall} />
            )}
            {enabled && (
                <>
                    {/* Аудио для удалённого потока */}
                    <audio ref={remoteAudioRef} autoPlay hidden />

                    {/* Аудио для локального потока (mute/unmute) */}
                    <audio ref={localAudioRef} autoPlay muted hidden />

                    {showIncomingInitialPopup && (
                        <NotificationPopup
                            from={popupFrom}
                            onAccept={onAccept}
                            onReject={onReject}
                            toneMode={outboundCall ? "none" : "loop"}
                        />
                    )}
                    {showIncomingProgressPopup && (
                        <NotificationPopup
                            from={popupFrom}
                            progressStage={incomingProgressStage}
                            toneMode={incomingProgressToneMode}
                        />
                    )}
                </>
            )}


            {/* Шапка с панелью управления (HeaderPanel) */}
            <HeaderPanel
                setShowScriptPanel={setShowScriptPanel}
                showScriptPanel={showScriptPanel}
                selectedProject={selectedProject}
                postActive={effectivePostActive}
                setPostActive={setUnifiedPostActive}
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
                outActivePhoneData={outActivePhoneData}
                setOutActivePhoneData={setOutActivePhoneData}
                startModulesRanRef={startModulesRanRef}
                autoAnswerEnabled={autoAnswerEnabled}
                setAutoAnswerEnabled={setAutoAnswerEnabled}
            />

            {managerPanel ? (
                <ManagerPanel />
            ) : showTasksDashboard ? (
                <>
                    {/* Показываем Dashboard, если нет активного звонка */}
                    {!(activeCall || effectivePostActive) && openedPhones.length === 0 && (
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
                    )}

                    <div
                        style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 16,
                        }}
                    >
                        {/* ====== SPLIT ROW (ТОЛЬКО КОГДА ЕСТЬ ЧАТ) ====== */}
                        {openedPhones.length > 0 && activeGuid && (
                            <div
                                ref={splitWrapRef}
                                style={{
                                    order: 1,
                                    flex: "0 0 100%",
                                    marginTop: 20,
                                    minWidth: 0,
                                    display: "flex",
                                    alignItems: "stretch",
                                }}
                            >
                                {/* LEFT: CHAT */}
                                <div
                                    style={{
                                        flex: `0 0 ${chatCallRatio * 100}%`,
                                        minWidth: 320,
                                        minHeight: 0,
                                    }}
                                >
                                    {guidsFromOpened && guidsFromOpened.length > 1 && (
                                        <div className="pb-2">
                                            <ul className={styles.chatTabs}>
                                                {guidsFromOpened.map((g) => {
                                                    const unread = unreadByGuid[g] ?? 0;
                                                    const isActive = activeGuid === g;

                                                    return (
                                                        <li key={g} className={styles.chatTabsItem}>
                                                            <button
                                                                type="button"
                                                                className={`${styles.chatTabsBtn} ${isActive ? styles.isActive : ""} ${
                                                                    unread ? styles.hasUnread : ""
                                                                }`}
                                                                onClick={() => setActiveGuid(g)}
                                                                title={labelForGuid(g)}
                                                                aria-label={`${labelForGuid(g)}${
                                                                    unread ? `, непрочитанных: ${unread}` : ""
                                                                }`}
                                                            >
                                                                <span className={styles.chatTabsLabel}>{labelForGuid(g)}</span>
                                                                {unread > 0 && (
                                                                    <span className={styles.chatTabsBadge}>{unread}</span>
                                                                )}
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}

                                    <MemoLocalChat
                                        guid={activeGuid}
                                        selfLogin={viewer.login}
                                        selfName={viewer.name}
                                        selfRole={viewer.role}
                                        collapsed={collapsed.value}
                                        onToggle={onToggleCollapsed}
                                        messages={messages}
                                        height={collapsed.value ? "52px" : "clamp(420px, 65vh, 820px)"}
                                        onSend={handleSend}
                                        operatorDict={operatorDictStableRef.current}
                                        title={`Чат · ${activeGuid ?? ""}`}
                                        readMap={readMap}
                                    />
                                </div>

                                {/* DIVIDER */}
                                <div
                                    onPointerDown={(e) => {
                                        splitDraggingRef.current = true;
                                        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);

                                        document.body.style.cursor = "col-resize";
                                        document.body.style.userSelect = "none";
                                    }}
                                    style={{
                                        flex: "0 0 auto",
                                        width: 10,
                                        marginLeft: "20px",
                                        cursor: "col-resize",
                                        borderRadius: 8,
                                        background: "rgba(0,0,0,0.08)",
                                        position: "relative",
                                        touchAction: "none",
                                    }}
                                    title="Потяни, чтобы изменить ширину"
                                    aria-label="Resize"
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "20%",
                                            bottom: "20%",
                                            left: "50%",
                                            width: 2,
                                            transform: "translateX(-50%)",
                                            background: "rgba(0,0,0,0.25)",
                                            borderRadius: 2,
                                        }}
                                    />
                                </div>

                                {/* RIGHT: CALL CONTROL */}
                                <div
                                    style={{
                                        flex: `0 0 ${(0.97 - chatCallRatio) * 100}%`,
                                        minWidth: 360,
                                        minHeight: 0,
                                    }}
                                >
                                    {(openedPhones.length > 0 || activeCall || effectivePostActive) && (
                                        <MemoCallControlPanel
                                            call={selectedCall}
                                            hasActiveCall={activeCall}
                                            activeProject={scriptProject}
                                            onClose={onCloseCall}
                                            postActive={effectivePostActive}
                                            setPostActive={setUnifiedPostActive}
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
                                            setOutboundCall={setOutboundCall}
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
                                            setActiveGuid={setActiveGuid}
                                            interCall={interCall}
                                            showInterCallHeader={showInterInCardHeader}
                                            onHangupInterCall={hangupInterCall}
                                            suspendStartModules={inboundSearchPending}

                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ====== ScriptPanel (как раньше, без разделителя) ====== */}
                        <div
                            style={{
                                order: openedPhones.length > 0 && activeGuid ? 3 : fullWidthCard ? 2 : 1,
                                flex:
                                    openedPhones.length > 0 && activeGuid
                                        ? "0 0 98%"
                                        : fullWidthCard
                                            ? "0 0 100%"
                                            : "0 0 48%",
                                minWidth: 0,
                            }}
                        >
                            {!effectivePostActive && !activeCall && openedPhones.length > 0 && (
                                <div style={{ marginLeft: 13, marginRight: 14 }}>
                                    {groupProjects.length > 1 && (
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: "8px",
                                                marginBottom: "6px",
                                                marginLeft: "25px",
                                            }}
                                        >
                                            {groupProjects.map((proj) => {
                                                const isActive = scriptProject === proj;
                                                return (
                                                    <button
                                                        key={proj}
                                                        className={`${stylesButton.projectButton} ${
                                                            isActive ? stylesButton.active : ""
                                                        }`}
                                                        style={{
                                                            color: isActive ? "#fff" : projectColors[proj],
                                                            background: isActive ? projectColors[proj] : "transparent",
                                                            borderColor: projectColors[proj],
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
                                    suspendAutoStart={effectivePostActive}
                                />
                            )}
                        </div>

                        {/* ====== CallControlPanel как раньше (когда НЕТ чата) ====== */}
                        {!(openedPhones.length > 0 && activeGuid) && (
                            <div
                                style={{
                                    order: 1,
                                    flex: fullWidthCard ? "0 0 100%" : "0 0 48%",
                                    minWidth: 0,
                                }}
                            >
                                {(openedPhones.length > 0 || activeCall || effectivePostActive) && (
                                    <MemoCallControlPanel
                                        call={selectedCall}
                                        hasActiveCall={activeCall}
                                        activeProject={scriptProject}
                                        onClose={onCloseCall}
                                        postActive={effectivePostActive}
                                        setPostActive={setUnifiedPostActive}
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
                                        setOutboundCall={setOutboundCall}
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
                                        setActiveGuid={setActiveGuid}
                                        interCall={interCall}
                                        showInterCallHeader={showInterInCardHeader}
                                        onHangupInterCall={hangupInterCall}
                                        suspendStartModules={inboundSearchPending}

                                    />
                                )}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="row my-3">
                    <div
                        className={fullWidthCard ? "col-12" : "col-12 col-md-6"}
                        style={{ order: fullWidthCard ? 2 : 1 }}
                    >
                        {selectedCall && scriptDir && scriptProject && !effectivePostActive && !activeCalls.length ? (
                            <ScriptPanel
                                direction={scriptDir}
                                projectName={scriptProject}
                                onClose={() => setSelectedCall(null)}
                                tuskMode={showTasksDashboard}
                                selectedCall={selectedCall}
                                suspendAutoStart={effectivePostActive}
                            />
                        ) : showScriptPanel || (activeCall && activeProjectName) || (effectivePostActive && activeProjectName) ? (
                            <ScriptPanel
                                direction={scriptDir}
                                projectName={activeProjectName}
                                onClose={() => setShowScriptPanel(false)}
                                tuskMode={showTasksDashboard}
                                suspendAutoStart={effectivePostActive}
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
                        )}
                    </div>

                    <div
                        className={fullWidthCard ? "col-12" : "col-12 col-md-6"}
                        style={{ order: fullWidthCard ? 1 : 2 }}
                    >
                        {(selectedCall || activeCall || effectivePostActive) && (
                            <MemoCallControlPanel
                                call={selectedCall}
                                hasActiveCall={activeCall}
                                activeProject={activeProjectName}
                                onClose={onCloseCall}
                                postActive={effectivePostActive}
                                setPostActive={setUnifiedPostActive}
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
                                setOutboundCall={setOutboundCall}
                                tuskMode={showTasksDashboard}
                                fullWidthCard={fullWidthCard}
                                setFullWidthCard={setFullWidthCard}
                                postCallData={postCallData}
                                setPostCallData={setPostCallData}
                                startModulesRanRef={startModulesRanRef}
                                monoModules={monoModules}
                                setMonoModules={setMonoModules}
                                expressCall={expressCall}
                                setActiveGuid={setActiveGuid}
                                interCall={interCall}
                                showInterCallHeader={showInterInCardHeader}
                                onHangupInterCall={hangupInterCall}
                                suspendStartModules={inboundSearchPending}

                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );

};

export default MainApp;
