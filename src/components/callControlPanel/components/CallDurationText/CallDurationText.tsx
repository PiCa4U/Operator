import React from "react";

function hasExplicitTz(s: string): boolean {
    // ISO with Z or +03:00 / +0300
    return /([zZ]|[+\-]\d{2}:?\d{2})$/.test(s.trim());
}

/** Достаём host из glagol_parent на случай если придёт с протоколом/портом/путём */
function normalizeHost(raw?: string | null): string {
    const s = (raw ?? "").trim();
    if (!s) return "";
    try {
        // если уже похоже на URL
        if (/^[a-zA-Z][\w+.-]*:\/\//.test(s)) return new URL(s).host;
        // если просто host[:port][/...]
        const withProto = "https://" + s.replace(/^\/\//, "");
        return new URL(withProto).host;
    } catch {
        // fallback: берём до первого /
        return s.split("/")[0];
    }
}

/**
 * created без TZ трактуем как время в "assumedOffsetMinutes"
 *  - например, если строка "16:36" в UTC+3 => реальный UTC = 13:36 => вычитаем 180 минут
 */
function parseCreatedUtcMs(created?: string | null, assumedOffsetMinutes = 0): number {
    if (!created) return 0;
    const s = created.trim();
    if (!s) return 0;

    // Если пришла строка уже с таймзоной — доверяем ей
    if (hasExplicitTz(s)) {
        const ms = new Date(s.replace(" ", "T")).getTime();
        return Number.isFinite(ms) ? ms : 0;
    }

    // "YYYY-MM-DD HH:mm:ss" или "YYYY-MM-DDTHH:mm:ss" БЕЗ TZ
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

        const msAsUtc = Date.UTC(year, month - 1, day, hour, minute, second, milli);
        const ms = msAsUtc - assumedOffsetMinutes * 60_000;
        return Number.isFinite(ms) ? ms : 0;
    }

    // fallback: пробуем как ISO с "Z", но тоже с учётом assumedOffsetMinutes (редкий случай)
    const msIso = new Date(s.replace(" ", "T") + "Z").getTime();
    if (!Number.isFinite(msIso)) return 0;
    return msIso - assumedOffsetMinutes * 60_000;
}

function safeSecondsFromCreated(created?: string | null, assumedOffsetMinutes = 0): number {
    const ms = parseCreatedUtcMs(created, assumedOffsetMinutes);
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
    glagol_parent?: string;
};

const CallDurationText: React.FC<Props> = React.memo(({ created, className, glagol_parent }) => {
    const host = React.useMemo(() => normalizeHost(glagol_parent), [glagol_parent]);

    // test server => UTC+3, иначе UTC+0
    const assumedOffsetMinutes = React.useMemo(() => {
        return host === "fs.at.akc24.ru" ? 180 : 0;
    }, [host]);

    const createdRef = React.useRef<string>(created ?? "");
    const offsetRef = React.useRef<number>(assumedOffsetMinutes);

    const [sec, setSec] = React.useState<number>(() =>
        safeSecondsFromCreated(created, assumedOffsetMinutes)
    );

    React.useEffect(() => {
        createdRef.current = created ?? "";
        offsetRef.current = assumedOffsetMinutes;
        setSec(safeSecondsFromCreated(created, assumedOffsetMinutes));
    }, [created, assumedOffsetMinutes]);

    React.useEffect(() => {
        if (!createdRef.current) return;

        const id = window.setInterval(() => {
            setSec(safeSecondsFromCreated(createdRef.current, offsetRef.current));
        }, 1000);

        return () => window.clearInterval(id);
    }, [created, assumedOffsetMinutes]);

    return <span className={className}>{formatDuration(sec)}</span>;
});

export default CallDurationText;
