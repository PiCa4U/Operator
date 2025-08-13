// src/telephony/ToneManager.ts
export class ToneManager {
    private cache = new Map<string, HTMLAudioElement>();

    constructor() {
        const tones: Record<'ringback'|'busy'|'reorder', string> = {
            ringback: '/tones/ringback.mp3',
            busy:     '/tones/busy.mp3',
            reorder:  '/tones/reorder.mp3',
        };
        (Object.keys(tones) as Array<keyof typeof tones>).forEach((name) => {
            const a = new Audio(tones[name]);
            a.preload = 'auto';
            a.loop = name === 'ringback';
            a.volume = 0.7;
            a.addEventListener('error', () => {
                // поможет быстро понять, что не так
                // загляни в Network: должен быть 200 и корректный Content-Type
                // (audio/mpeg для mp3)
                // @ts-ignore
                console.error(`[ToneManager] audio load error: ${name} -> ${a.src}`, a.error);
            });
            this.cache.set(name, a);
        });
    }

    async play(name: 'ringback'|'busy'|'reorder') {
        this.stopAll();
        const a = this.cache.get(name);
        if (!a) return;
        try {
            a.currentTime = 0;
            await a.play();
        } catch (e) {
            const resume = () => {
                a.play().finally(() => {
                    window.removeEventListener('click', resume);
                    window.removeEventListener('keydown', resume);
                });
            };
            window.addEventListener('click', resume, { once: true });
            window.addEventListener('keydown', resume, { once: true });
        }
    }

    stop(name: 'ringback'|'busy'|'reorder') {
        const a = this.cache.get(name);
        if (!a) return;
        a.pause();
        a.currentTime = 0;
    }

    stopAll() {
        this.cache.forEach(a => { a.pause(); a.currentTime = 0; });
    }
}
