// src/screenShare/VideoTile.tsx
import React, { useEffect, useRef } from "react";

type Props = {
    stream: MediaStream;
};

export const VideoTile: React.FC<Props> = ({ stream }) => {
    const ref = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        try {
            (el as any).srcObject = stream;
            el.play().catch(() => {});
        } catch {
            /* no-op */
        }
    }, [stream]);

    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted
            style={{
                width: "100%",
                borderRadius: 8,
                background: "#000",
            }}
        />
    );
};
