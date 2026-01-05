import React, { useEffect, useMemo, useRef, useState } from "react";

type Props = {
    stream: MediaStream;
    title?: string;
};

type Phase = "loading" | "playing" | "error";

export const VideoTile: React.FC<Props> = ({ stream, title }) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [phase, setPhase] = useState<Phase>("loading");

    const hasEverPlayedRef = useRef(false);
    const rafTimerRef = useRef<number | null>(null);

    const trackLabel = useMemo(() => {
        const t = stream.getVideoTracks?.()[0];
        return t?.label ? String(t.label) : "";
    }, [stream]);

    useEffect(() => {
        const v = videoRef.current;
        if (!v) return;

        setPhase("loading");
        hasEverPlayedRef.current = false;

        try {
            // @ts-ignore
            v.srcObject = stream;
        } catch {
            v.src = URL.createObjectURL(stream as any);
        }

        v.autoplay = true;
        v.playsInline = true;
        v.muted = true;

        const setPlaying = () => {
            hasEverPlayedRef.current = true;
            setPhase("playing");
        };

        const onPlaying = () => setPlaying();
        const onLoadedData = () => setPlaying();
        const onLoadedMeta = () => {
        };

        const onWaiting = () => {
            if (!hasEverPlayedRef.current) setPhase("loading");
        };
        const onStalled = () => {
            if (!hasEverPlayedRef.current) setPhase("loading");
        };

        const onError = () => setPhase("error");

        v.addEventListener("playing", onPlaying);
        v.addEventListener("loadeddata", onLoadedData);
        v.addEventListener("loadedmetadata", onLoadedMeta);
        v.addEventListener("waiting", onWaiting);
        v.addEventListener("stalled", onStalled);
        v.addEventListener("error", onError);

        const anyV = v as any;
        let stopFrameCb = false;

        const tick = () => {
            if (!v) return;
            if (stopFrameCb) return;

            if (!hasEverPlayedRef.current && (v.videoWidth > 0 || v.currentTime > 0)) {
                setPlaying();
            }

            rafTimerRef.current = window.setTimeout(tick, 350);
        };

        if (typeof anyV.requestVideoFrameCallback === "function") {
            const onFrame = () => {
                if (!hasEverPlayedRef.current) setPlaying();
                if (!stopFrameCb) anyV.requestVideoFrameCallback(onFrame);
            };
            anyV.requestVideoFrameCallback(onFrame);
        } else {
            tick();
        }

        void v.play().catch(() => {});

        return () => {
            stopFrameCb = true;
            if (rafTimerRef.current) {
                window.clearTimeout(rafTimerRef.current);
                rafTimerRef.current = null;
            }

            v.removeEventListener("playing", onPlaying);
            v.removeEventListener("loadeddata", onLoadedData);
            v.removeEventListener("loadedmetadata", onLoadedMeta);
            v.removeEventListener("waiting", onWaiting);
            v.removeEventListener("stalled", onStalled);
            v.removeEventListener("error", onError);

            try {
                // @ts-ignore
                v.srcObject = null;
            } catch {}
        };
    }, [stream]);

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16 / 9",
                borderRadius: 12,
                overflow: "hidden",
                background: "#000",
                border: "1px solid rgba(255,255,255,0.12)",
            }}
        >
            <style>{`@keyframes ssSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>

            <video
                ref={videoRef}
                style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    display: "block",
                    background: "#000",
                }}
            />

            {(title || trackLabel) && (
                <div
                    style={{
                        position: "absolute",
                        left: 10,
                        top: 10,
                        padding: "6px 10px",
                        borderRadius: 10,
                        fontSize: 12,
                        color: "#fff",
                        background: "rgba(0,0,0,0.55)",
                        backdropFilter: "blur(4px)",
                        maxWidth: "90%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {title || trackLabel}
                </div>
            )}

            {phase !== "playing" && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "column",
                        gap: 10,
                        color: "#fff",
                        background: "rgba(0,0,0,0.55)",
                        backdropFilter: "blur(2px)",
                        padding: 16,
                        textAlign: "center",
                    }}
                >
                    {phase === "loading" ? (
                        <>
                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: "50%",
                                    border: "4px solid rgba(255,255,255,0.25)",
                                    borderTopColor: "#fff",
                                    animation: "ssSpin 1s linear infinite",
                                }}
                            />
                            <div style={{ fontWeight: 700 }}>Загрузка видео…</div>
                        </>
                    ) : (
                        <>
                            <div style={{ fontSize: 22 }}>⚠️</div>
                            <div style={{ fontWeight: 700 }}>Не удалось отобразить видео</div>
                            <div style={{ fontSize: 12, opacity: 0.9 }}>
                                Попробуйте переподключиться (Отключиться → Экран).
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};
