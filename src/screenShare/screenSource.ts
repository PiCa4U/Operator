let screenSource: MediaStream | null = null;

export function getScreenSource(): MediaStream | null {
    return screenSource;
}

function hasLiveVideo(stream: MediaStream | null): boolean {
    if (!stream) return false;
    return stream.getVideoTracks().some((t) => t.readyState === "live");
}

export async function ensureScreenSource(): Promise<MediaStream> {
    if (screenSource && hasLiveVideo(screenSource)) {
        return screenSource;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 15, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
    });

    const track = stream.getVideoTracks()[0];
    if (!track) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("no video track in displayMedia");
    }

    screenSource = stream;

    track.addEventListener(
        "ended",
        () => {
            screenSource = null;
        },
        { once: true }
    );

    return stream;
}
