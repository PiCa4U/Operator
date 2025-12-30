// src/screenShare/screenShareLocalIntent.ts

let viewerInitiatedUntil = 0;

/**
 * Вызываем ПЕРЕД socket.emit("screen_share:start") в вкладке-наблюдателе.
 * TTL держим подольше, чтобы успеть дождаться screen_share:start от бэка.
 */
export function markViewerInitiated(ttlMs = 15000) {
    viewerInitiatedUntil = Date.now() + Math.max(0, ttlMs);
}

/**
 * Используется в панели "отправителя" (шарера), чтобы не accept-нуть/не publish-нуть
 * сессию, которую эта вкладка сама инициировала как viewer.
 */
export function consumeIfViewerInitiated(): boolean {
    if (Date.now() <= viewerInitiatedUntil) {
        viewerInitiatedUntil = 0;
        return true;
    }
    return false;
}
