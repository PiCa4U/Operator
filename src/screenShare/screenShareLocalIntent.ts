
let viewerInitiatedUntil = 0;


export function markViewerInitiated(ttlMs = 15000) {
    viewerInitiatedUntil = Date.now() + Math.max(0, ttlMs);
}


export function consumeIfViewerInitiated(): boolean {
    if (Date.now() <= viewerInitiatedUntil) {
        viewerInitiatedUntil = 0;
        return true;
    }
    return false;
}
