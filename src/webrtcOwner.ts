// src/webrtcOwner.ts

type OwnerState = {
    ownerId: string;
    since: number;
    lastSeen: number;
    busy: boolean; // владелец сейчас в звонке (или набирает/идёт входящий)
};

type Listener = (isOwner: boolean, owner: OwnerState | null) => void;

const HEARTBEAT_MS = 2500;
const STALE_MS = 8000;
const CH_PREFIX = 'glagol-webrtc-owner::bc::';
const LS_PREFIX = 'glagol-webrtc-owner::ls::';

// Небольшая случайная задержка, чтобы при освобождении владельца вкладки
// "соревновались" и выбор был случайным (а не «побеждает самая быстрая машина»)
const JITTER_MIN = 30;
const JITTER_MAX = 250;

function withJitter(fn: () => void, min = JITTER_MIN, max = JITTER_MAX) {
    const d = Math.floor(min + Math.random() * (max - min));
    return window.setTimeout(fn, d);
}

function makeUuid() {
    const g: any = globalThis as any;
    if (g?.crypto?.randomUUID) return g.crypto.randomUUID();
    return Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

const TAB_ID = (() => {
    const key = 'glagol-webrtc-tabid';
    let id = sessionStorage.getItem(key);
    if (!id) {
        id = `${makeUuid()}:${Date.now()}`;
        sessionStorage.setItem(key, id);
    }
    return id;
})();

type BCMsg =
    | { type: 'owner:claimed'; payload: OwnerState }
    | { type: 'owner:released' }
    | { type: 'owner:beat'; payload: OwnerState }
    | { type: 'owner:request'; from: string; reqId: string } // другая вкладка просит отдать владение
    | { type: 'owner:busy'; to: string; reqId: string }       // владелец занят (в звонке)
    | { type: 'owner:ok'; to: string; reqId: string };        // владелец освободил

export class WebRTCOwner {
    private namespace = 'default';
    private lsKey = `${LS_PREFIX}default`;
    private bc: BroadcastChannel | null = null;
    private hbTimer: number | null = null;
    private watchTimer: number | null = null;
    private listeners = new Set<Listener>();
    private busy = false; // локальный флаг — владелец занят
    private claimTimer: number | null = null; // защита от частых повторов tryClaimWithJitter

    init(namespace: string) {
        this.namespace = namespace || 'default';
        this.lsKey = `${LS_PREFIX}${this.namespace}`;
        try {
            this.bc =
                'BroadcastChannel' in window
                    ? new BroadcastChannel(`${CH_PREFIX}${this.namespace}`)
                    : null;
            this.bc && (this.bc.onmessage = (e) => this.onBC(e.data as BCMsg));
        } catch {
            this.bc = null;
        }
        this.startWatcher();
        window.addEventListener('unload', () => {
            if (this.isOwner()) this.release();
        });
    }

    // ===== публичный API

    isOwner(): boolean {
        const st = this.read();
        return !!st && st.ownerId === TAB_ID && Date.now() - st.lastSeen < STALE_MS;
    }

    getOwner(): OwnerState | null {
        const st = this.read();
        if (!st) return null;
        if (Date.now() - st.lastSeen >= STALE_MS) return null;
        return st;
    }

    subscribe(fn: Listener) {
        this.listeners.add(fn);
        queueMicrotask(() => fn(this.isOwner(), this.getOwner()));
        return () => {
            this.listeners.delete(fn);
        };
    }

    /** Сообщить координатору, что владелец сейчас «занят» (идёт звонок/звонит и т.д.) */
    setBusy(v: boolean) {
        this.busy = v;
        if (!this.isOwner()) return;
        const st = this.read();
        if (!st) return;
        st.busy = v;
        this.write(st);
        this.bcPost({ type: 'owner:beat', payload: st });
        this.emit();
    }

    /** Попытаться стать владельцем. true — удалось, false — отказ (обычно «занят»). */
    async claim(): Promise<boolean> {
        const cur = this.read();
        const stale = !cur || Date.now() - cur.lastSeen >= STALE_MS;

        // никого нет — просто становимся владельцем
        if (stale) {
            this.write({
                ownerId: TAB_ID,
                since: Date.now(),
                lastSeen: Date.now(),
                busy: false,
            });
            this.bcPost({ type: 'owner:claimed', payload: this.read()! });
            this.startHeartbeat();
            this.emit();
            return true;
        }
        if (cur.ownerId === TAB_ID) return true;

        // просим текущего владельца передать управление
        const reqId = makeUuid();

        return await new Promise<boolean>((resolve) => {
            let resolved = false;
            const done = (ok: boolean) => {
                if (resolved) return;
                resolved = true;
                cleanup();
                resolve(ok);
            };

            const onMsg = (e: MessageEvent<BCMsg>) => {
                const msg = e.data;
                if (!msg) return;
                if (msg.type === 'owner:busy' && msg.to === TAB_ID && msg.reqId === reqId) {
                    done(false);
                }
                if (msg.type === 'owner:ok' && msg.to === TAB_ID && msg.reqId === reqId) {
                    // владелец освободил — пытаемся захватить
                    setTimeout(() => done(this.claimNowIfFree()), 700);
                }
            };

            const cleanup = () => {
                if (this.bc) this.bc.removeEventListener('message', onMsg as any);
                clearTimeout(timer);
            };

            if (this.bc) this.bc.addEventListener('message', onMsg as any);
            this.bcPost({ type: 'owner:request', from: TAB_ID, reqId });

            const timer = window.setTimeout(() => {
                // не ответили — попробуем сами (вдруг владелец умер)
                done(this.claimNowIfFree());
            }, 2000);
        });
    }

    /** Явно отпустить владение (например, при выключении WebRTC) */
    release() {
        const st = this.read();
        if (st && st.ownerId === TAB_ID) {
            try {
                localStorage.removeItem(this.lsKey);
            } catch {}
            this.stopHeartbeat();
            this.bcPost({ type: 'owner:released' });
            this.emit();
        }
    }

    // ===== внутреннее

    private claimNowIfFree(): boolean {
        const cur = this.read();
        const stale = !cur || Date.now() - cur.lastSeen >= STALE_MS;
        if (!stale) return false;
        this.write({
            ownerId: TAB_ID,
            since: Date.now(),
            lastSeen: Date.now(),
            busy: false,
        });
        this.bcPost({ type: 'owner:claimed', payload: this.read()! });
        this.startHeartbeat();
        this.emit();
        return true;
    }

    private tryClaimWithJitter() {
        if (this.claimTimer) {
            clearTimeout(this.claimTimer);
            this.claimTimer = null;
        }
        this.claimTimer = withJitter(() => {
            this.claimTimer = null;
            this.claimNowIfFree();
        });
    }

    private read(): OwnerState | null {
        try {
            const raw = localStorage.getItem(this.lsKey);
            return raw ? (JSON.parse(raw) as OwnerState) : null;
        } catch {
            return null;
        }
    }

    private write(s: OwnerState) {
        try {
            localStorage.setItem(this.lsKey, JSON.stringify(s));
        } catch {}
    }

    private startHeartbeat() {
        this.stopHeartbeat();
        this.hbTimer = window.setInterval(() => {
            const st = this.read();
            if (!st || st.ownerId !== TAB_ID) {
                this.stopHeartbeat();
                return;
            }
            st.lastSeen = Date.now();
            st.busy = this.busy;
            this.write(st);
            this.bcPost({ type: 'owner:beat', payload: st });
        }, HEARTBEAT_MS);
    }

    private stopHeartbeat() {
        if (this.hbTimer) {
            clearInterval(this.hbTimer);
            this.hbTimer = null;
        }
    }

    private startWatcher() {
        if (this.watchTimer) return;
        this.watchTimer = window.setInterval(() => {
            const st = this.read();
            const stale = st && Date.now() - st.lastSeen >= STALE_MS;
            if (!st || stale) {
                // Пытаемся аккуратно занять с небольшой случайной задержкой,
                // чтобы выбор вкладки был случайным.
                this.tryClaimWithJitter();
            }
        }, HEARTBEAT_MS);

        window.addEventListener('storage', (e) => {
            if (e.key === this.lsKey) this.emit();
        });
    }

    private bcPost(msg: BCMsg) {
        try {
            this.bc?.postMessage(msg);
        } catch {}
    }

    private onBC(msg: BCMsg) {
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'owner:claimed' || msg.type === 'owner:beat') {
            this.emit();
            return;
        }

        if (msg.type === 'owner:released') {
            // Кто-то освободил владение → пробуем занять с джиттером
            this.emit();
            this.tryClaimWithJitter();
            return;
        }

        if (msg.type === 'owner:request') {
            // пришёл запрос: если я владелец
            if (this.isOwner()) {
                const st = this.read();
                if (!st) return;
                if (this.busy || st.busy) {
                    this.bcPost({ type: 'owner:busy', to: msg.from, reqId: msg.reqId });
                } else {
                    // отдаём
                    this.release();
                    this.bcPost({ type: 'owner:ok', to: msg.from, reqId: msg.reqId });
                }
            }
        }
    }

    private emit() {
        const isOwner = this.isOwner();
        const owner = this.getOwner();
        this.listeners.forEach((fn) => fn(isOwner, owner));
    }
}

export const webrtcOwner = new WebRTCOwner();
