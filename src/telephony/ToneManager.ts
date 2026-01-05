export type ToneName = 'ringback' | 'busy' | 'reorder' | 'incoming';
export type ToneSources = Partial<Record<ToneName, string>>;

type OscStep = { f: number; d: number };

export class ToneManager {
    private els: Partial<Record<ToneName, HTMLAudioElement>> = {};
    private playing: ToneName | null = null;

    private ctx: AudioContext | null = null;
    private gain: GainNode | null = null;
    private cadenceTimer: number | null = null;

    private _volume = 0.7;

    constructor(opts?: { sources?: ToneSources; volume?: number }) {
        if (opts?.sources) this.setSources(opts.sources);
        if (typeof opts?.volume === 'number') this._volume = clamp01(opts.volume);
    }

    setSources(srcs: ToneSources) {
        (['ringback', 'busy', 'reorder', 'incoming'] as ToneName[]).forEach((name) => {
            const url = srcs[name];
            if (url) {
                const el = new Audio();
                el.preload = 'auto';
                el.src = url;
                el.loop = name === 'ringback' || name === 'incoming';
                el.volume = this._volume;

                // если ресурс не проигрывается/404 — тихо уходим в WebAudio
                el.addEventListener('error', () => {
                    delete this.els[name];
                    if (this.playing === name) this.playWithOsc(name);
                });

                this.els[name] = el;
            } else {
                delete this.els[name];
            }
        });
    }

    setVolume(v: number) {
        this._volume = clamp01(v);
        Object.values(this.els).forEach((el) => (el.volume = this._volume));
        if (this.gain) this.gain.gain.value = this._volume;
    }

    async play(name: ToneName) {
        this.stopAll();

        const el = this.els[name];
        if (el && el.src) {
            try {
                el.currentTime = 0;
                await el.play();
                this.playing = name;
                return;
            } catch {
            }
        }

        this.playWithOsc(name);
    }

    stopAll() {
        Object.values(this.els).forEach((el) => {
            try {
                el.pause();
                el.currentTime = 0;
            } catch {}
        });

        this.playing = null;
        if (this.cadenceTimer) {
            clearTimeout(this.cadenceTimer);
            this.cadenceTimer = null;
        }
    }

    // ─────────────────────────────── private

    private ensureCtx() {
        if (!this.ctx) {
            const AC: typeof AudioContext =
                (window as any).AudioContext || (window as any).webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.gain = this.ctx.createGain();
            this.gain.gain.value = this._volume;
            this.gain.connect(this.ctx.destination);
        }
    }

    private playWithOsc(name: ToneName) {
        this.ensureCtx();
        if (!this.ctx || !this.gain) return;

        const pattern: OscStep[] =
            name === 'ringback'
                ? [{ f: 440, d: 400 }, { f: 0, d: 200 }, { f: 440, d: 400 }, { f: 0, d: 2000 }]
                : name === 'busy'
                    ? [{ f: 480, d: 250 }, { f: 0, d: 250 }]
                    : name === 'reorder'
                        ? [{ f: 620, d: 150 }, { f: 0, d: 150 }]
                        : [{ f: 440, d: 500 }, { f: 0, d: 200 }]; // incoming

        this.playing = name;
        let i = 0;

        const tick = () => {
            if (this.playing !== name || !this.ctx || !this.gain) return;
            const step = pattern[i++ % pattern.length];
            if (step.f > 0) {
                const osc = this.ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.value = step.f;
                osc.connect(this.gain);
                osc.start();
                setTimeout(() => {
                    try {
                        osc.stop();
                        osc.disconnect();
                    } catch {}
                }, step.d);
            }
            this.cadenceTimer = window.setTimeout(tick, step.d);
        };

        tick();
    }
}

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x));
}
