import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";

import LocalChat, { type UiMessage, type Role } from "./chat/LocalChat";
import { chatApi, fetchChatHistory, type RawChatMessage } from "./chat/api";
import { useChatSocket } from "./chat/useChatSocket";
import { useChatCollapsed } from "./useChatCollapsed";

import { store } from "../../redux/store";
import CallControlPanel from "../../components/callControlPanel";
import { ModuleData, MonoProjectsModuleData } from "../../components/mainApp";
import { formatOperator, useOperatorsDirectory } from "../../features/signals/useOperatorsDirectory";
import { ContactFilesPanel } from "./chat/FieldsPanel";
import styles from "./chat/style.module.css"

type ContactRow = Record<string, any>;

type Action = { action_name: string; action_type: string; code_filename: string };
type Preset = {
    id: number;
    preset_name: string;
    group_table: string;
    structure: Record<string, { name: string; default: string; render_template: string }>;
    actions: Action[];
    group_by: string[];
    projects: string[];
};
type OptionType = { value: number; label: string; preset: Preset };

type ReadStatus = { watched: string[]; responsible_watch: boolean };
type ReadMap = Record<string, ReadStatus>;


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

function extractPhoneGroups(input: any): any[][] {
    const result: any[][] = [];
    const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) {
            if (node.length && typeof node[0] === "object" && node[0] && "id" in node[0]) {
                result.push(node);
            } else {
                node.forEach(walk);
            }
        } else if (typeof node === "object") {
            Object.values(node).forEach(walk);
        }
    };
    walk(input);
    return result;
}

function FieldsPanel({ contacts }: { contacts: ContactRow[] }) {
    if (!contacts.length) return <div className="p-3 text-muted">Нет данных по контактам.</div>;
    return (
        <div className="p-3">
            <h5 className="mb-3">Карточка</h5>
            {contacts.map((c, i) => (
                <div key={i} className="mb-3 border rounded p-2">
                    {Object.entries(c).map(([k, v]) => (
                        <div key={k} className="d-flex">
                            <div className="text-muted" style={{ width: 160 }}>{k}</div>
                            <div className="flex-grow-1">{String(v)}</div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}


export default function ItsmGuidScreen() {
    // guid — ТОЛЬКО из URL
    const { guid = "" } = useParams();
    const collapsed = useChatCollapsed(guid);
    const { data: operatorDict = {} } = useOperatorsDirectory(); // карта {login -> name}

    // креды — ТОЛЬКО из Redux
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent      = ''
    } = store.getState().credentials;
    const hasSip = !!sipLogin?.trim();
    const isClient = !hasSip;
    // если sip есть — оператор, иначе клиент
    const viewer = useMemo(() => {
        const role: Role = hasSip ? "operator" : "client";
        const name = hasSip ? sipLogin : "Клиент";
        const login = hasSip ? sipLogin : null;
        return { role, name, login, worker: worker || null };
    }, [hasSip, sipLogin, worker]);

    /* ===== правая карточка (контакты по guid) ===== */
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<any[]>([]);

    useEffect(() => {
        let alive = true;
        setLoading(true); setError(null);
        chatApi.get(`/api/v1/contacts/${encodeURIComponent(guid)}`)
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
    }, [guid]);

    const [projectsDict, setProjectsDict] = useState<Record<string, string>>({});

    useEffect(() => {
        let alive = true;
        if (!glagolParent) return;

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
    }, [glagolParent]);

    const [openedPhones, setOpenedPhones] = useState<any[]>([]);
    const [presets, setPresets] = useState<OptionType[]>([]);
    const [selectedPreset, setSelectedPreset] = useState<OptionType | null>(null);
    const startModulesRanRef = useRef<boolean>(false);

    const [phonesData, setPhonesData] = useState<any[]>([]);
    const [openedGroup, setOpenedGroup] = useState<number[]>([]);
    const [groupIDs, setGroupIDs] = useState<number[][]>([]);
    const [relatedGuids, setRelatedGuids] = useState<string[]>([]);
    const [modules, setModules] = useState<ModuleData[]>([]);
    const [monoModules, setMonoModules] = useState<MonoProjectsModuleData>({});

    useEffect(() => {
        if (!data.length) return;

        const first = data[0];
        const phoneID: number | undefined = first?.id;
        const projectName: string | undefined = first?.project;
        if (!phoneID || !projectName) return;

        const roleForApi = "operator";
        const workerFromCreds = (store.getState().credentials?.worker ?? "") as string;

        (async () => {
            // 1) пресеты (если ещё не загружены)
            let myPresets = presets;
            if (myPresets.length === 0) {
                const resp = await axios.post<Preset[]>("/api/v1/get_preset_list", {
                    glagol_parent: "fs.at.glagol.ai",
                    worker: workerFromCreds,
                    projects: [projectName],
                    role: roleForApi,
                });
                myPresets = resp.data.map(p => ({ value: p.id, label: p.preset_name, preset: p }));
                setPresets(myPresets);
            }

            // 2) выбираем подходящий под проект
            const matchedPreset =
                myPresets.find(p => p.preset.projects.includes(projectName)) || myPresets[0] || null;

            setSelectedPreset(matchedPreset);
            if (!matchedPreset) return;

            // 3) берём группы телефонов
            const resp2 = await axios.post<any>("/api/v1/get_grouped_phones", {
                glagol_parent: "fs.at.glagol.ai",
                group_by: matchedPreset.preset.group_by,
                filter_by: { project: ["IN", matchedPreset.preset.projects]},
                group_table: matchedPreset.preset.group_table,
                role: roleForApi,
            });
            const projectIdData = resp2.data;

            const allGroups = extractPhoneGroups(projectIdData);
            const flat = allGroups.flat();
            setPhonesData(flat);

            // 4) находим группы, где есть наш первый телефон
            const matchedGroups = allGroups.filter(group =>
                group.some((item: any) => item?.id === phoneID)
            );
            if (matchedGroups.length) {
                const opened = matchedGroups.flat();
                setOpenedPhones(opened);

                const idsUnique = Array.from(new Set(opened.map((it: any) => it.id)));
                setOpenedGroup(idsUnique);

                const allGroupIDs = allGroups.map(g => g.map((it: any) => it.id));
                setGroupIDs(allGroupIDs);

                // GUID'ы для вкладок
                const guids = Array.from(
                    new Set(
                        opened
                            .map((it: any) => it?.guid || it?.contact_info?.guid || it?.b_uuid || it?.uuid)
                            .filter(Boolean)
                            .map((x: any) => String(x))
                    )
                );
                setRelatedGuids(guids);
            }
        })().catch(err => {
            console.error("Ошибка построения группы по первому телефону:", err);
        });
    }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

    // список GUID для табов (включая текущий из URL)
    const guidsFromOpened = useMemo(() => {
        const arr = Array.from(new Set(
            (openedPhones ?? [])
                .map((it: any) => it?.guid || it?.contact_info?.guid || it?.b_uuid || it?.uuid)
                .filter(Boolean)
                .map(String)
        ));
        if (guid && !arr.includes(guid)) arr.unshift(guid);
        return arr;
    }, [openedPhones, guid]);

    const [activeGuid, setActiveGuid] = useState<string>(guid);
    useEffect(() => {
        if (!guidsFromOpened.length) return;
        if (!activeGuid || !guidsFromOpened.includes(activeGuid)) {
            setActiveGuid(guidsFromOpened[0]);
        }
    }, [guidsFromOpened]); // eslint-disable-line react-hooks/exhaustive-deps

    function labelForGuid(g: string): string {
        const rows = (openedPhones ?? []).filter((it: any) => {
            const v = it?.guid || it?.contact_info?.guid || it?.b_uuid || it?.uuid;
            return String(v) === g;
        });

        if (!rows.length) return `GUID ${g.slice(0, 8)}…`;

        const first = rows[0];
        const phone = first?.phone || first?.contact_info?.phone || first?.msisdn || first?.phone_number;
        const name  = first?.name  || first?.contact_info?.name;
        const projRaw = first?.project || first?.contact_info?.project;
        const projNice = projectsDict[projRaw] || projRaw; // <- подмена

        if (name && phone && projNice) return `${name} · ${phone} · ${projNice}`;
        if (name && phone)             return `${name} · ${phone}`;
        if (phone && projNice)         return `${phone} · ${projNice}`;
        if (name)                      return `${name}`;
        if (phone)                     return `${phone}`;
        if (projNice)                  return `${projNice}`;
        return `GUID ${g.slice(0, 8)}…`;
    }

    const [history, setHistory] = useState<UiMessage[]>([]);
    const [chatError, setChatError] = useState<string | null>(null);
    const [live, setLive] = useState<UiMessage[]>([]);
    const [optimistic, setOptimistic] = useState<UiMessage[]>([]);

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

    const socketLogin = hasSip ? sipLogin : null;

    const markReadById = (arr: UiMessage[], id: string) =>
        arr.map(m => (m.id === id ? { ...m, isRead: true } : m));

    const markReadMany = (arr: UiMessage[], ids: number[]) => {
        const setIds = new Set(ids.map(String));
        return arr.map(m => (setIds.has(m.id) ? { ...m, isRead: true } : m));
    };

    const [serverFilesByGuid, setServerFilesByGuid] = useState<Record<string, string[]>>({});

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
    useEffect(() => {
        if (activeGuid) void refreshContactFiles(activeGuid);
    }, [activeGuid]);

    /* ====== СЧЁТЧИКИ НЕПРОЧИТАННЫХ ====== */

    const [unreadByGuid, setUnreadByGuid] = useState<Record<string, number>>({});
    // SIP-логин, по которому считаем непрочитанные (или "client")
    useEffect(() => console.log("unreadByGuid: ", unreadByGuid),[unreadByGuid])
    const loginForUnread = hasSip ? (sipLogin || "").trim() : "client";
    const totalUnread = useMemo(
        () => Object.values(unreadByGuid).reduce((a, b) => a + (b || 0), 0),
        [unreadByGuid]
    );

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

    async function fetchUnreadForGuid(g: string, hasSipLogin: boolean, login: string) {
        try {
            const params = hasSipLogin ? { logins: login } : undefined; // лучше массивом
            const { data } = await chatApi.get(`/api/v1/chat/${encodeURIComponent(g)}/count`, { params });
            return extractUnreadCount(data, hasSipLogin, login);
        } catch {
            return 0;
        }
    }

    async function refreshUnreadCounts(guids: string[], hasSipLogin: boolean, login: string) {
        if (!guids.length) return;
        const entries = await Promise.all(
            guids.map(async g => [g, await fetchUnreadForGuid(g, hasSipLogin, login)] as const)
        );
        setUnreadByGuid(prev => {
            const next = { ...prev };
            for (const [g, n] of entries) next[g] = n;
            return next;
        });
    }

    useEffect(() => {
        if (!guidsFromOpened.length) return;
        void refreshUnreadCounts(guidsFromOpened, hasSip, loginForUnread);
        const id = window.setInterval(() => {
            void refreshUnreadCounts(guidsFromOpened, hasSip, loginForUnread);
        }, 100000);
        return () => window.clearInterval(id);
    }, [guidsFromOpened, hasSip, loginForUnread]);

    const { connected, error: socketErr, send, markManyRead } = useChatSocket({
        guid: activeGuid,
        login: socketLogin,
        glagol_parent: glagolParent,
        onIncoming: (msg: UiMessage) => {
            setLive((prev: UiMessage[]) => [...prev, msg]);
            if (activeGuid) void refreshUnreadCounts([activeGuid], hasSip, loginForUnread);
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
            if (activeGuid) void refreshUnreadCounts([activeGuid], hasSip, loginForUnread);
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
            if (activeGuid) void refreshContactFiles(activeGuid);
        }
    });


    const messages = useMemo(() => {
        const merged = [...history, ...live, ...optimistic];
        return dedupeByKey(merged).sort(sortMessages);
    }, [history, live, optimistic]);

    useEffect(() => {
        if (!activeGuid) return;
        const t = window.setTimeout(() => {
            void refreshUnreadCounts([activeGuid], hasSip, loginForUnread);
        }, 250);
        return () => window.clearTimeout(t);
    }, [messages, activeGuid, hasSip, loginForUnread]);

    const [readMap, setReadMap] = useState<ReadMap>({});
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

    const sentReadRef = useRef<Set<number>>(new Set());   // уже отправляли в эту сессию
    const queueRef = useRef<Set<number>>(new Set());      // очередь на отправку
    const timerRef = useRef<number | null>(null);

    const groupProjects = useMemo(() => {
        const set = new Set<string>();
        (openedPhones ?? []).forEach((c: any) => {
            const p = c?.project || c?.contact_info?.project;
            if (p) set.add(String(p));
        });
        return Array.from(set);
    }, [openedPhones]);

    const projectColors = useMemo(() => {
        const palette = ['#4c78a8','#f58518','#54a24b','#e45756','#b279a2','#9d755d','#bab0ac','#72b7b2','#f2cf5b','#7b4173'];
        return groupProjects.reduce<Record<string,string>>((acc, proj, i) => {
            acc[proj] = palette[i % palette.length];
            return acc;
        }, {});
    }, [groupProjects]);

    const [scriptProject, setScriptProject] = useState<string | null>(null);
    useEffect(() => {
        if (!groupProjects.length) { setScriptProject(null); return; }
        if (!scriptProject || !groupProjects.includes(scriptProject)) {
            setScriptProject(groupProjects[0]); // авто-выбор первого
        }
    }, [groupProjects, scriptProject]);

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
        if (timerRef.current) return;
        timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            flushReads();
        }, 200);
    };

    useEffect(() => {
        if (!connected || !messages.length) return;

        const isIncomingForMe = (m: UiMessage) => {
            if (socketLogin) return (m.authorLogin ?? null) !== socketLogin;
            return m.authorRole !== "client";
        };

        const idsToMark: number[] = [];
        for (const m of messages) {
            const numId = Number(m.id);
            if (!Number.isFinite(numId)) continue;
            if (!isIncomingForMe(m)) continue;
            if (m.isRead) continue;
            if (sentReadRef.current.has(numId)) continue;
            idsToMark.push(numId);
        }
        if (!idsToMark.length) return;

        setHistory(prev => markReadMany(prev, idsToMark));
        setLive(prev => markReadMany(prev, idsToMark));
        setOptimistic(prev => markReadMany(prev, idsToMark));

        enqueueReads(idsToMark);
    }, [connected, messages, socketLogin]);

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
            authorLogin: socketLogin,
            authorName: hasSip ? sipLogin : "Клиент",
            authorRole: hasSip ? "operator" : "client",
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

    return (
        <div className="container-fluid py-3" style={{ height: "100vh" }}>
            <div className="row g-3 h-100">
                <div className="col-12 py-2 col-lg-6 d-flex flex-column min-h-0">
                    {chatError && <div className="alert alert-danger m-2">{chatError}</div>}
                    {socketErr && <div className="alert alert-warning m-2">Сокет: {socketErr}</div>}
                    {!connected && <div className="text-muted small ms-2">Подключение к чату…</div>}

                    {guidsFromOpened.length > 0 && (
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
                    <div className="flex-grow-1 d-flex flex-column min-h-0">
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
                </div>

                <div className="col-12 col-lg-6 min-h-0 overflow-auto">
                    {loading && <div className="p-3">Загрузка…</div>}
                    {error && <div className="alert alert-danger m-3">{error}</div>}
                    {!loading && !error && (
                        <>
                            <CallControlPanel
                                openedPhones={openedPhones}
                                activeProject={""}
                                assignedKey={""}
                                call={null}
                                currentPage={1}
                                expressCall={false}
                                hasActiveCall={false}
                                isLoading={false}
                                modules={modules}
                                onClose={() => console.log("lock")}
                                outActivePhone={""}
                                outActiveProjectName={""}
                                outboundCall={false}
                                postActive={false}
                                postCallData={null}
                                prefix={""}
                                setIsLoading={() => console.log("loading")}
                                setModules={setModules}
                                setPostActive={() => console.log("loading")}
                                setPostCallData={() => console.log("loading")}
                                setSelectedCall={() => console.log("loading")}
                                specialKey={""}
                                tuskMode
                                startModulesRanRef={startModulesRanRef}
                                isChating={true}
                                selectedPreset={selectedPreset}
                                setMonoModules={setMonoModules}
                                monoModules={monoModules}
                                isClient={isClient}
                            />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
