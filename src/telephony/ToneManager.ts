// src/telephony/ToneManager.ts
type ToneKey = 'ringback' | 'busy' | 'reorder' | 'incoming';

type Sources = Partial<Record<ToneKey, string>>;

export class ToneManager {
    private cache = new Map<ToneKey, HTMLAudioElement>();

    constructor(opts?: { sources?: Sources; volume?: number }) {
        if (opts?.sources) this.setSources(opts.sources);
        this.setVolume(opts?.volume ?? 0.7);
    }

    /** задать/переопределить ссылки на звуки */
    setSources(srcs: Sources) {
        (Object.keys(srcs) as ToneKey[]).forEach((name) => {
            const url = srcs[name];
            if (!url) return;
            let a = this.cache.get(name);
            if (!a) {
                a = new Audio();
                a.preload = 'auto';
                a.loop = name === 'ringback';        // как у тебя было
                a.addEventListener('error', () => {
                    // @ts-ignore
                    console.error(`[ToneManager] audio load error: ${name} -> ${a!.src}`, a!.error);
                });
                this.cache.set(name, a);
            }
            a.src = url;
        });
    }

    setVolume(v: number) {
        const val = Math.min(1, Math.max(0, v));
        this.cache.forEach(a => { a.volume = val; });
    }

    async play(name: ToneKey) {
        this.stopAll();
        const a = this.cache.get(name);
        if (!a) return;
        try {
            a.currentTime = 0;
            await a.play();
        } catch {
            const resume = () => {
                a!.play().finally(() => {
                    window.removeEventListener('click', resume);
                    window.removeEventListener('keydown', resume);
                    window.removeEventListener('pointerdown', resume);
                });
            };
            window.addEventListener('click', resume, { once: true });
            window.addEventListener('keydown', resume, { once: true });
            window.addEventListener('pointerdown', resume, { once: true });
        }
    }

    stop(name: ToneKey) {
        const a = this.cache.get(name);
        if (!a) return;
        a.pause();
        a.currentTime = 0;
    }

    stopAll() {
        this.cache.forEach(a => { a.pause(); a.currentTime = 0; });
    }
}
