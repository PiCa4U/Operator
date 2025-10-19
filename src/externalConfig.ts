// src/externalConfig.ts
export type ToneMap = Partial<{
    ringback: string;
    busy: string;
    reorder: string;
    incoming: string;
}>;

export type AppExternalConfig = {
    assetsBase?: string;
    tones?: ToneMap;
    volume?: number;
};

// --- helpers ---
function safeJson<T = unknown>(s?: string | null): T | undefined {
    if (!s) return undefined;
    try { return JSON.parse(s) as T; } catch { return undefined; }
}
function getSearchParams(): URLSearchParams {
    // избегаем "location" без префикса
    const search = typeof window !== 'undefined' ? window.location?.search ?? '' : '';
    return new URLSearchParams(search);
}

// Читаем конфиг из нескольких источников — чем дальше, тем ниже приоритет:
export function readExternalConfig(): AppExternalConfig {
    // 1) глобальная переменная до загрузки бандла
    const fromGlobal = (window as any).__APP_CONFIG__ as AppExternalConfig | undefined;

    // 2) data-* на корневом элементе
    const root = typeof document !== 'undefined' ? document.getElementById('root') : null;
    let fromDataset: AppExternalConfig | undefined;
    if (root) {
        try {
            const tonesStr = root.dataset.tones;
            const assetsBase = root.dataset.assetsBase;
            const volStr = root.dataset.volume;
            const volume = volStr != null ? Number(volStr) : undefined;
            if (tonesStr || assetsBase || volume != null) {
                fromDataset = {
                    assetsBase,
                    tones: safeJson<ToneMap>(tonesStr),
                    volume: Number.isFinite(volume as number) ? (volume as number) : undefined,
                };
            }
        } catch {/* no-op */}
    }

    // 3) URL-параметры (на всякий случай)
    const sp = getSearchParams();
    const fromQuery: AppExternalConfig | undefined = (() => {
        const ab = sp.get('assetsBase') ?? undefined;
        const tones = safeJson<ToneMap>(sp.get('tones'));
        const volStr = sp.get('volume');
        const vol = volStr != null ? Number(volStr) : undefined;
        if (ab || tones || vol != null) {
            return {
                assetsBase: ab,
                tones,
                volume: Number.isFinite(vol as number) ? (vol as number) : undefined,
            };
        }
        return undefined;
    })();

    // 4) динамическая доставка после старта через событие
    const current: AppExternalConfig = {
        assetsBase: fromGlobal?.assetsBase ?? fromDataset?.assetsBase ?? fromQuery?.assetsBase,
        tones: {
            ...fromGlobal?.tones,
            ...fromDataset?.tones,
            ...fromQuery?.tones,
        },
        volume: fromGlobal?.volume ?? fromDataset?.volume ?? fromQuery?.volume,
    };

    return current;
}

// подписка на позднюю доставку конфига (если хост выставит его после монтирования)
export function subscribeExternalConfig(onUpdate: (cfg: AppExternalConfig) => void) {
    const handler = (e: Event) => {
        const detail = (e as CustomEvent).detail as AppExternalConfig | undefined;
        if (detail) onUpdate(detail);
    };
    window.addEventListener('app:config', handler as EventListener);
    return () => window.removeEventListener('app:config', handler as EventListener);
}
