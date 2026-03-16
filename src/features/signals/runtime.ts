import type { SignalItem } from "./api";

const listeners = new Set<() => void>();
const unreadByLogin = new Map<string, SignalItem[]>();
const EMPTY_SIGNALS: SignalItem[] = [];

function emitChange() {
    listeners.forEach((listener) => {
        try {
            listener();
        } catch (error) {
            console.error("[signals/runtime] listener failed", error);
        }
    });
}

function dedupeAndSort(rows: SignalItem[]): SignalItem[] {
    const map = new Map<number, SignalItem>();

    for (const row of rows) {
        if (!row?.id) continue;
        map.set(row.id, row);
    }

    return Array.from(map.values()).sort((a, b) => b.id - a.id);
}

export function subscribeSignals(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getUnreadSignals(login?: string): SignalItem[] {
    if (!login) return EMPTY_SIGNALS;
    return unreadByLogin.get(login) ?? EMPTY_SIGNALS;
}

export function replaceUnreadSignals(login: string, rows: SignalItem[]) {
    unreadByLogin.set(login, dedupeAndSort(rows));
    emitChange();
}

export function upsertUnreadSignals(login: string, rows: SignalItem[]) {
    const prev = unreadByLogin.get(login) ?? EMPTY_SIGNALS;
    unreadByLogin.set(login, dedupeAndSort([...prev, ...rows]));
    emitChange();
}

export function removeUnreadSignals(login: string, ids: number[]) {
    if (!login || !ids.length) return;

    const drop = new Set(ids);
    const prev = unreadByLogin.get(login) ?? EMPTY_SIGNALS;
    const next = prev.filter((item) => !drop.has(item.id));

    unreadByLogin.set(login, next);
    emitChange();
}