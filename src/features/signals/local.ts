import type { SignalItem } from "./api";

const shownKey = (login: string) => `mgr_signal_shown_${login}`;
const historyKey = (login: string) => `mgr_signal_history_${login}`;

export function readShown(login: string): Set<number> {
    try { return new Set<number>(JSON.parse(localStorage.getItem(shownKey(login)) || "[]")); }
    catch { return new Set<number>(); }
}
export function writeShown(login: string, ids: Set<number>): void {
    const arr: number[] = Array.from(ids);
    localStorage.setItem(shownKey(login), JSON.stringify(arr));
}

export function readHistory(login: string): SignalItem[] {
    try { return JSON.parse(localStorage.getItem(historyKey(login)) || "[]"); }
    catch { return []; }
}
export function appendHistory(login: string, items: SignalItem[]) {
    if (!items.length) return;
    const exist = readHistory(login);
    const map = new Map<number, SignalItem>(exist.map(i => [i.id, i]));
    items.forEach(i => map.set(i.id, i));
    // лимит истории на сессию (например, 200)
    const merged: SignalItem[] = Array.from(map.values())
        .sort((a, b) => b.id - a.id)
        .slice(0, 200);
    localStorage.setItem(historyKey(login), JSON.stringify(merged));
}
