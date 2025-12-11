// src/screenShare/screenSource.ts
let screenSource: MediaStream | null = null;

export function getScreenSource(): MediaStream | null {
    return screenSource;
}

export async function ensureScreenSource(): Promise<MediaStream> {
    if (screenSource && screenSource.getVideoTracks().some(t => t.readyState === "live")) {
        return screenSource;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
    });

    const track = stream.getVideoTracks()[0];
    if (!track) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error("no video track in displayMedia");
    }

    screenSource = stream;

    // если юзер нажал Stop в баннере браузера — считаем доступ отозванным
    track.addEventListener("ended", () => {
        screenSource = null;
    }, { once: true });

    return stream;
}
