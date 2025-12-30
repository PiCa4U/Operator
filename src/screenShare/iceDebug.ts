// src/screenShare/iceDebug.ts

export function toUrlList(urls: any): string[] {
    if (!urls) return [];
    if (Array.isArray(urls)) return urls.filter((u) => typeof u === "string");
    if (typeof urls === "string") return [urls];
    return [];
}

export function isTurnUrl(u: string): boolean {
    const s = u.trim().toLowerCase();
    return s.startsWith("turn:") || s.startsWith("turns:");
}

/**
 * Оставляем ТОЛЬКО TURN/TURNS.
 * ВАЖНО: TCP НЕ режем — для теста TURN это критично.
 */
export function onlyTurnServers(iceServers: RTCIceServer[] | undefined): RTCIceServer[] {
    const arr = (iceServers || []) as RTCIceServer[];

    return arr
        .map((s) => {
            const urls = toUrlList((s as any).urls).filter(isTurnUrl);
            if (!urls.length) return null;
            return { ...s, urls };
        })
        .filter(Boolean) as RTCIceServer[];
}

export async function logSelectedIcePair(pc: RTCPeerConnection, tag: string) {
    try {
        const report = await pc.getStats();
        let pair: any = null;

        report.forEach((r: any) => {
            if (r.type === "transport" && r.selectedCandidatePairId) {
                pair = report.get(r.selectedCandidatePairId);
            }
        });

        if (!pair) {
            report.forEach((r: any) => {
                if (r.type === "candidate-pair" && r.selected) pair = r;
            });
        }

        if (!pair) {
            console.log(`[ICE ${tag}] no selected pair`);
            return;
        }

        const local: any = report.get(pair.localCandidateId);
        const remote: any = report.get(pair.remoteCandidateId);

        console.log(
            `[ICE ${tag}] SELECTED`,
            `local=${local?.candidateType} ${local?.address || local?.ip}:${local?.port}`,
            `remote=${remote?.candidateType} ${remote?.address || remote?.ip}:${remote?.port}`,
            `pairProto=${pair.protocol}`,
            `rtt=${pair.currentRoundTripTime}`
        );
    } catch {
        // ignore
    }
}

/**
 * Вешаем максимально полезные логи:
 * - pc.getConfiguration() (проверим, что relay реально применился)
 * - onicecandidate: ищем "typ relay"
 * - icecandidateerror: если TURN auth/transport/allocate падает — увидим
 */
export function attachIceDebug(pc: RTCPeerConnection, tag: string) {
    try {
        console.log(`[ICE ${tag}] pc.getConfiguration():`, pc.getConfiguration?.());
    } catch {}

    try {
        pc.addEventListener("icegatheringstatechange", () => {
            console.log(`[ICE ${tag}] iceGatheringState:`, pc.iceGatheringState);
        });

        pc.addEventListener("iceconnectionstatechange", () => {
            console.log(`[ICE ${tag}] iceConnectionState:`, pc.iceConnectionState);
        });

        pc.addEventListener("connectionstatechange", () => {
            console.log(`[ICE ${tag}] connectionState:`, pc.connectionState);
            if (pc.connectionState === "connected") {
                void logSelectedIcePair(pc, tag);
            }
        });

        pc.addEventListener("icecandidate", (e) => {
            if (!e.candidate) {
                console.log(`[ICE ${tag}] icecandidate: <end>`);
                void logSelectedIcePair(pc, tag);
                return;
            }
            const c = e.candidate.candidate || "";
            const hasRelay = / typ relay(\s|$)/i.test(c);
            if (hasRelay) {
                console.log(`[ICE ${tag}] cand ✅ RELAY:`, c);
            } else {
                console.log(`[ICE ${tag}] cand:`, c);
            }
        });

        pc.addEventListener("icecandidateerror", (e: any) => {
            console.warn(`[ICE ${tag}] icecandidateerror`, {
                url: e?.url,
                errorCode: e?.errorCode,
                errorText: e?.errorText,
                hostCandidate: e?.hostCandidate,
            });
        });
    } catch {}
}
