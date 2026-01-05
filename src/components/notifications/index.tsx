import React, { useEffect, useRef } from 'react';
import s from './NotificationPopup.module.css';
import { readExternalConfig, subscribeExternalConfig, AppExternalConfig } from '../../externalConfig';

interface Props {
    from?: string;
    subtitle?: string;
    avatarUrl?: string;
    onAccept(): void;
    onReject(): void;
}

const NotificationPopup: React.FC<Props> = ({
                                                from = 'Неизвестный номер',
                                                subtitle,
                                                avatarUrl,
                                                onAccept,
                                                onReject,
                                            }) => {
    const acceptRef = useRef<HTMLButtonElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const resumeHandlerRef = useRef<(() => void) | null>(null);
    const cfgRef = useRef<AppExternalConfig>(readExternalConfig());

    const resolveIncoming = (cfg: AppExternalConfig) =>
        cfg.tones?.incoming ||
        (cfg.assetsBase ? `${cfg.assetsBase}/tones/incoming.mp3` : '/tones/incoming.mp3');

    const cleanupResumeHandlers = () => {
        const h = resumeHandlerRef.current;
        if (!h) return;
        window.removeEventListener('click', h);
        window.removeEventListener('keydown', h);
        window.removeEventListener('pointerdown', h);
        resumeHandlerRef.current = null;
    };

    const stopRingtone = () => {
        cleanupResumeHandlers();
        const a = audioRef.current;
        if (!a) return;
        try { a.pause(); } catch {}
        a.currentTime = 0;
    };

    const startRingtone = (url: string, volume: number) => {
        stopRingtone();
        const a = new Audio(url);
        a.loop = true;
        a.volume = Math.max(0, Math.min(1, volume ?? 0.6));
        audioRef.current = a;

        a.play().catch(() => {
            const resume = () => {
                a.play().finally(() => cleanupResumeHandlers());
            };
            resumeHandlerRef.current = resume;
            window.addEventListener('click', resume, { once: true });
            window.addEventListener('keydown', resume, { once: true });
            window.addEventListener('pointerdown', resume, { once: true });
        });
    };

    useEffect(() => {
        acceptRef.current?.focus();

        const url = resolveIncoming(cfgRef.current);
        const vol = cfgRef.current.volume ?? 0.6;
        startRingtone(url, vol);

        const unsub = subscribeExternalConfig((next: AppExternalConfig): void => {
            cfgRef.current = {
                assetsBase: next.assetsBase ?? cfgRef.current.assetsBase,
                tones: { ...(cfgRef.current.tones || {}), ...(next.tones || {}) },
                volume: typeof next.volume === 'number' ? next.volume : cfgRef.current.volume,
            };

            const newUrl = resolveIncoming(cfgRef.current);
            const newVol = cfgRef.current.volume ?? 0.6;
            startRingtone(newUrl, newVol);
        });

        return () => {
            unsub();
            stopRingtone();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAccept = () => { stopRingtone(); onAccept(); };
    const handleReject = () => { stopRingtone(); onReject(); };

    // Горячие клавиши: Enter — принять, Esc — отклонить
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') handleAccept();
            if (e.key === 'Escape') handleReject();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onAccept, onReject]);

    return (
        <div className={s.overlay} role="dialog" aria-modal="true" aria-labelledby="incomingTitle">
            <div className={s.popup}>
                <div className={s.ringGlow} aria-hidden />
                <header className={s.header}>
                    <span id="incomingTitle" className={s.title}>Входящий вызов</span>
                    {subtitle && <span className={s.subtitle}>{subtitle}</span>}
                </header>

                <div className={s.callerRow}>
                    <div className={s.avatarWrap}>
                        {avatarUrl ? (
                            <img className={s.avatar} src={avatarUrl} alt="" />
                        ) : (
                            <div className={s.avatarFallback}>{from?.[0]?.toUpperCase() || '?'}</div>
                        )}
                        <span className={s.pulse} aria-hidden />
                    </div>
                    <div className={s.callerInfo}>
                        <div className={s.callerName} title={from}>{from}</div>
                        <div className={s.callerHint}>Нажмите Enter, чтобы принять</div>
                    </div>
                </div>

                <div className={s.buttons}>
                    <button
                        ref={acceptRef}
                        onClick={handleAccept}
                        className={`${s.btn} ${s.accept}`}
                    >
                        <span className={s.btnIcon} aria-hidden>📞</span>
                        Принять
                    </button>
                    <button
                        onClick={handleReject}
                        className={`${s.btn} ${s.reject}`}
                    >
                        <span className={s.btnIcon} aria-hidden>✖</span>
                        Отклонить
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NotificationPopup;
