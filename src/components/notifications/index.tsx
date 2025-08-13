import React, { useEffect, useRef } from 'react';
import s from './NotificationPopup.module.css';

interface Props {
    from?: string;                 // "Иван Петров" или "1003"
    subtitle?: string;             // например, проект/линия/кампания
    avatarUrl?: string;            // логотип/инициалы звонящего
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

    // Автовоспроизведение рингтона + автофокус на "Принять"
    useEffect(() => {
        acceptRef.current?.focus();

        const audio = new Audio('/iphone-11-pro.mp3');
        audio.loop = true;
        audio.volume = 0.6;
        audioRef.current = audio;
        audio.play().catch(() => {
            // Если браузер заблокировал авто‑play — проиграем при первом клике
            const resume = () => {
                audio.play().finally(() => {
                    window.removeEventListener('click', resume);
                    window.removeEventListener('keydown', resume);
                });
            };
            window.addEventListener('click', resume, { once: true });
            window.addEventListener('keydown', resume, { once: true });
        });

        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };
    }, []);

    // Горячие клавиши: Enter — принять, Esc — отклонить
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') onAccept();
            if (e.key === 'Escape') onReject();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
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
                        onClick={onAccept}
                        className={`${s.btn} ${s.accept}`}
                    >
                        <span className={s.btnIcon} aria-hidden>📞</span>
                        Принять
                    </button>
                    <button
                        onClick={onReject}
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
