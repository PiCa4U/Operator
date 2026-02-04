import React from "react";

function hasExplicitTz(s: string): boolean {
    // ISO with Z or +03:00 / +0300
    return /([zZ]|[+\-]\d{2}:?\d{2})$/.test(s.trim());
}

function parseCreatedUtcMs(created?: string | null): number {
    if (!created) return 0;
    const s = created.trim();
    if (!s) return 0;

    // Если пришла строка уже с таймзоной — доверяем ей
    if (hasExplicitTz(s)) {
        const ms = new Date(s.replace(" ", "T")).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    // "YYYY-MM-DD HH:mm:ss" или "YYYY-MM-DDTHH:mm:ss" БЕЗ TZ => считаем, что это UTC
    const m = s.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
    );

    if (m) {
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        const hour = Number(m[4]);
        const minute = Number(m[5]);
        const second = Number(m[6]);
        const milli = m[7] ? Number(m[7].padEnd(3, "0")) : 0;

        const ms = Date.UTC(year, month - 1, day, hour, minute, second, milli);
        return Number.isFinite(ms) ? ms : 0;
    }

    // fallback: пробуем как ISO UTC (часто прокатывает)
    const ms = new Date(s.replace(" ", "T") + "Z").getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function safeSecondsFromCreated(created?: string | null): number {
    const ms = parseCreatedUtcMs(created);
    if (!ms) return 0;
    const diff = Math.floor((Date.now() - ms) / 1000);
    return diff > 0 ? diff : 0;
}

function formatDuration(sec: number): string {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes} мин. ${seconds} сек.`;
}

type Props = {
    created?: string | null;
    className?: string;
};

const CallDurationText: React.FC<Props> = React.memo(({ created, className }) => {
    const createdRef = React.useRef<string>(created ?? "");
    const [sec, setSec] = React.useState<number>(() => safeSecondsFromCreated(created));

    React.useEffect(() => {
        createdRef.current = created ?? "";
        setSec(safeSecondsFromCreated(created));
    }, [created]);

    React.useEffect(() => {
        if (!createdRef.current) return;

        const id = window.setInterval(() => {
            setSec(safeSecondsFromCreated(createdRef.current));
        }, 1000);

        return () => window.clearInterval(id);
    }, [created]);

    return <span className={className}>{formatDuration(sec)}</span>;
});

export default CallDurationText;
