type CallIntent = {
    id: string;
    sourceTab: string;
    payload: { guid: string; phone: string; projectId?: string; meta?: any };
};

type Msg =
    | { type: 'CALL_INTENT'; intent: CallIntent }
    | { type: 'CALL_INTENT_ACK'; intentId: string; ownerTab: string }
    | { type: 'OPEN_CARD'; guid: string };

const TAB_ID = (() => {
    const k = 'glagol-callbus-tabid';
    let v = sessionStorage.getItem(k);
    if (!v) { v = crypto.randomUUID(); sessionStorage.setItem(k, v); }
    return v;
})();

export function makeCallBus(namespace: string) {
    const chName = `glagol-call-bus::${namespace}`;
    const bc = new BroadcastChannel(chName);

    // единый диспетчер и собственный реестр подписок
    const subs = new Set<(m: Msg) => void>();
    bc.onmessage = (e) => {
        const m = e.data as Msg;
        subs.forEach(fn => { try { fn(m); } catch {} });
    };

    function onMessage(fn: (m: Msg) => void): () => void {
        subs.add(fn);
        // ⬇️ ВАЖНО: возвращаем void, а не boolean
        return () => { subs.delete(fn); };
    }

    function sendIntent(payload: CallIntent['payload'], timeoutMs = 3000): Promise<boolean> {
        const intent: CallIntent = { id: crypto.randomUUID(), sourceTab: TAB_ID, payload };
        bc.postMessage({ type: 'CALL_INTENT', intent } as Msg);

        return new Promise<boolean>((resolve) => {
            let done = false;
            const off = onMessage((m) => {
                if (m?.type === 'CALL_INTENT_ACK' && m.intentId === intent.id) {
                    if (!done) { done = true; off(); resolve(true); }
                }
            });
            setTimeout(() => { if (!done) { done = true; off(); resolve(false); } }, timeoutMs);
        });
    }

    const ack = (intentId: string) =>
        bc.postMessage({ type: 'CALL_INTENT_ACK', intentId, ownerTab: TAB_ID } as Msg);

    const openCard = (guid: string) =>
        bc.postMessage({ type: 'OPEN_CARD', guid } as Msg);

    return { sendIntent, ack, openCard, onMessage };
}
