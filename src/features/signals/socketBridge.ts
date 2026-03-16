import { socket, subscribeAfterReconnect } from "../../socket";
import { store } from "../../redux/store";
import { getSignals, normalizeSignalsPayload, SignalItem } from "./api";
import { appendHistory, ensureReceived } from "./local";
import { removeUnreadSignals, replaceUnreadSignals, upsertUnreadSignals } from "./runtime";

/**
 * ВАЖНО:
 * если бек присылает уведомления не событием "notification",
 * а другим именем, просто поменяй эту константу.
 */
const SOCKET_NOTIFICATION_EVENT = "notification";

let bridgeStarted = false;
let activeManagerLogin = "";
let syncSeq = 0;
let syncInFlight = false;
let bufferedLive: SignalItem[] = [];
const pendingWatchedIds = new Set<number>();

function getAuth() {
    const state = store.getState();

    return {
        sessionKey: String(state.operator?.sessionKey || "").trim(),
        worker: String(state.credentials?.worker || "").trim(),
        sipLogin: String(state.credentials?.sipLogin || "").trim(),
    };
}

function dedupeAndSort(rows: SignalItem[]): SignalItem[] {
    const map = new Map<number, SignalItem>();

    for (const row of rows) {
        if (!row?.id) continue;
        map.set(row.id, row);
    }

    return Array.from(map.values()).sort((a, b) => b.id - a.id);
}

function persistRows(login: string, rows: SignalItem[]) {
    if (!login || !rows.length) return;

    ensureReceived(login, rows);
    appendHistory(login, rows);
}

function pushToBuffer(rows: SignalItem[]) {
    if (!rows.length) return;
    bufferedLive = dedupeAndSort([...bufferedLive, ...rows]);
}

function flushPendingWatched() {
    if (!activeManagerLogin) return;

    const ids = Array.from(pendingWatchedIds);
    if (!ids.length) return;

    const { sessionKey, worker, sipLogin } = getAuth();
    if (!socket.connected || !sessionKey || !worker || !sipLogin) return;

    pendingWatchedIds.clear();

    socket.emit("notification_watched", {
        session_key: sessionKey,
        worker,
        sip_login: sipLogin,
        signal_ids: ids,
    });
}

async function startResync() {
    if (!activeManagerLogin) return;

    const currentSeq = ++syncSeq;
    syncInFlight = true;
    bufferedLive = [];

    try {
        const snapshot = await getSignals(activeManagerLogin);

        if (currentSeq !== syncSeq) return;

        const merged = dedupeAndSort([...snapshot, ...bufferedLive]);

        replaceUnreadSignals(activeManagerLogin, merged);
        persistRows(activeManagerLogin, merged);

        syncInFlight = false;
        bufferedLive = [];

        flushPendingWatched();
    } catch (error) {
        if (currentSeq !== syncSeq) return;

        syncInFlight = false;
        bufferedLive = [];
        console.error("[signals/socketBridge] resync failed", error);
    }
}

function onAfterReconnect() {
    void startResync();
}

function onDisconnect() {
    /**
     * Инвалидируем текущий sync, если он ещё в полёте,
     * чтобы старый ответ не затёр более новый.
     */
    syncSeq += 1;
    syncInFlight = false;
    bufferedLive = [];
}

function onIncomingNotification(payload: any) {
    if (!activeManagerLogin) return;

    const rows = normalizeSignalsPayload(payload);
    if (!rows.length) return;

    if (syncInFlight) {
        pushToBuffer(rows);
    }

    upsertUnreadSignals(activeManagerLogin, rows);
    persistRows(activeManagerLogin, rows);
}

export function initSignalsSocketBridge(managerLogin?: string) {
    const login = String(managerLogin || "").trim();
    if (!login) return;

    const loginChanged = activeManagerLogin !== login;
    activeManagerLogin = login;

    if (!bridgeStarted) {
        bridgeStarted = true;

        subscribeAfterReconnect(onAfterReconnect);
        socket.on("disconnect", onDisconnect);
        socket.on(SOCKET_NOTIFICATION_EVENT, onIncomingNotification);
    }

    if (loginChanged && socket.connected) {
        void startResync();
        return;
    }

    if (socket.connected && !syncInFlight) {
        void startResync();
    }
}

export function markSignalsWatched(managerLogin: string, ids: number[]) {
    if (!managerLogin || !ids.length) return;

    removeUnreadSignals(managerLogin, ids);

    ids.forEach((id) => pendingWatchedIds.add(id));
    flushPendingWatched();
}