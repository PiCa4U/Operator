import type { SignalItem } from "./api";

const shownKey = (login: string) => `mgr_signal_shown_${login}`;
const historyKey = (login: string) => `mgr_signal_history_${login}`;

// meta по каждому id: когда впервые увидели на клиенте + когда прочитали
const metaKey = (login: string) => `mgr_signal_meta_${login}`;

export type SignalMeta = {
    receivedAt?: string; // когда клиент впервые увидел уведомление
    readAt?: string;     // когда пометили прочитанным (в т.ч. автопрочтение)
};

/** ===== shown (используется для toasts "уже показывали") ===== */

export function readShown(login: string): Set<number> {
    try {
        return new Set<number>(JSON.parse(localStorage.getItem(shownKey(login)) || "[]"));
    } catch {
        return new Set<number>();
    }
}

export function writeShown(login: string, ids: Set<number>): void {
    const arr: number[] = Array.from(ids);
    localStorage.setItem(shownKey(login), JSON.stringify(arr));
}

/** ===== history (храним последние N уведомлений, чтобы показывать в модалке) ===== */

export function readHistory(login: string): SignalItem[] {
    try {
        return JSON.parse(localStorage.getItem(historyKey(login)) || "[]");
    } catch {
        return [];
    }
}

export function appendHistory(login: string, items: SignalItem[]) {
    if (!items.length) return;

    const exist = readHistory(login);
    const map = new Map<number, SignalItem>(exist.map((i) => [i.id, i]));
    items.forEach((i) => map.set(i.id, i));

    // лимит истории (например, 200)
    const merged: SignalItem[] = Array.from(map.values())
        .sort((a, b) => b.id - a.id)
        .slice(0, 200);

    localStorage.setItem(historyKey(login), JSON.stringify(merged));
}

/** ===== meta (receivedAt/readAt) ===== */

export function readMeta(login: string): Record<string, SignalMeta> {
    try {
        return JSON.parse(localStorage.getItem(metaKey(login)) || "{}");
    } catch {
        return {};
    }
}

export function writeMeta(login: string, meta: Record<string, SignalMeta>) {
    localStorage.setItem(metaKey(login), JSON.stringify(meta));
}

/** Если для id ещё нет receivedAt — ставим его (момент первого "увидел" на клиенте). */
export function ensureReceived(login: string, items: SignalItem[], at = new Date().toISOString()) {
    if (!items.length) return;

    const meta = readMeta(login);
    let changed = false;

    for (const n of items) {
        const k = String(n.id);
        if (!meta[k]) meta[k] = {};
        if (!meta[k].receivedAt) {
            meta[k].receivedAt = at;
            changed = true;
        }
    }

    if (changed) writeMeta(login, meta);
}

/** Помечаем readAt локально (сразу, не дожидаясь бекенда). */
export function markReadLocal(login: string, ids: number[], at = new Date().toISOString()) {
    if (!ids.length) return;

    const meta = readMeta(login);

    for (const id of ids) {
        const k = String(id);
        if (!meta[k]) meta[k] = {};
        meta[k].readAt = at;
    }

    writeMeta(login, meta);
}
