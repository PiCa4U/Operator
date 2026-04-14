import React, { useEffect, useRef } from 'react';
import s from './NotificationPopup.module.css';
import { readExternalConfig, subscribeExternalConfig, AppExternalConfig } from '../../externalConfig';

type ProgressStage = 'accepted' | 'connecting' | 'loading_card';
type ToneMode = 'none' | 'loop' | 'once';

interface Props {
    from?: string;
    subtitle?: string;
    avatarUrl?: string;
    onAccept?(): void;
    onReject?(): void;
    progressStage?: ProgressStage | null;
    toneMode?: ToneMode;
}

const progressOrder: ProgressStage[] = ['accepted', 'connecting', 'loading_card'];

const progressMeta: Record<ProgressStage, { title: string; hint: string; label: string }> = {
    accepted: {
        title: 'Вызов принят',
        hint: 'Фиксируем принятие вызова и запускаем соединение.',
        label: 'Вызов принят',
    },
    connecting: {
        title: 'Соединяем с клиентом',
        hint: 'Ожидаем установку голосового соединения.',
        label: 'Соединяем с клиентом',
    },
    loading_card: {
        title: 'Открываем карточку',
        hint: 'Подтягиваем данные звонка, поля и модули.',
        label: 'Открываем карточку',
    },
};

const NotificationPopup: React.FC<Props> = ({
    from = 'Неизвестный номер',
    subtitle,
    avatarUrl,
    onAccept,
    onReject,
    progressStage,
    toneMode = 'loop',
}) => {
    const acceptRef = useRef<HTMLButtonElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const resumeHandlerRef = useRef<(() => void) | null>(null);
    const cfgRef = useRef<AppExternalConfig>(readExternalConfig());
    const isProgressMode = Boolean(progressStage);
    const currentStageIndex = progressStage ? progressOrder.indexOf(progressStage) : -1;

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

    const playTone = (url: string, volume: number, loop: boolean) => {
        stopRingtone();
        const a = new Audio(url);
        a.loop = loop;
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
        if (toneMode === 'none') {
            stopRingtone();
            return;
        }

        const url = resolveIncoming(cfgRef.current);
        const vol = cfgRef.current.volume ?? 0.6;
        const isLoop = toneMode === 'loop';
        playTone(url, vol, isLoop);

        if (!isLoop) {
            return () => {
                stopRingtone();
            };
        }

        const unsub = subscribeExternalConfig((next: AppExternalConfig): void => {
            cfgRef.current = {
                assetsBase: next.assetsBase ?? cfgRef.current.assetsBase,
                tones: { ...(cfgRef.current.tones || {}), ...(next.tones || {}) },
                volume: typeof next.volume === 'number' ? next.volume : cfgRef.current.volume,
            };

            const newUrl = resolveIncoming(cfgRef.current);
            const newVol = cfgRef.current.volume ?? 0.6;
            playTone(newUrl, newVol, true);
        });

        return () => {
            unsub();
            stopRingtone();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toneMode]);

    useEffect(() => {
        if (isProgressMode) return;
        acceptRef.current?.focus();
    }, [isProgressMode]);

    const handleAccept = () => {
        if (!onAccept) return;
        stopRingtone();
        onAccept();
    };

    const handleReject = () => {
        if (!onReject) return;
        stopRingtone();
        onReject();
    };

    useEffect(() => {
        if (isProgressMode) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Enter') handleAccept();
            if (e.key === 'Escape') handleReject();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isProgressMode, onAccept, onReject]);

    return (
        <div
            className={`${s.overlay} ${isProgressMode ? s.overlayPassive : ''}`}
            role={isProgressMode ? 'status' : 'dialog'}
            aria-modal={isProgressMode ? undefined : 'true'}
            aria-labelledby="incomingTitle"
            aria-live={isProgressMode ? 'polite' : undefined}
        >
            <div className={s.popup}>
                <div className={s.ringGlow} aria-hidden />
                <header className={s.header}>
                    <span id="incomingTitle" className={s.title}>
                        {progressStage ? progressMeta[progressStage].title : 'Входящий вызов'}
                    </span>
                    <span className={s.subtitle}>
                        {progressStage ? progressMeta[progressStage].hint : subtitle}
                    </span>
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
                        <div className={s.callerHint}>
                            {progressStage
                                ? 'Сейчас последовательно пройдём все этапы подготовки звонка.'
                                : 'Нажмите Enter, чтобы принять'}
                        </div>
                    </div>
                </div>

                {progressStage ? (
                    <div className={s.progressPanel}>
                        {progressOrder.map((stage, index) => {
                            const isDone = index < currentStageIndex;
                            const isCurrent = index === currentStageIndex;
                            return (
                                <div
                                    key={stage}
                                    className={`${s.stageRow} ${isCurrent ? s.stageRowCurrent : ''}`}
                                >
                                    <span
                                        className={`${s.stageDot} ${
                                            isDone ? s.stageDotDone : isCurrent ? s.stageDotActive : ''
                                        }`}
                                        aria-hidden
                                    >
                                        {isDone ? '✓' : index + 1}
                                    </span>
                                    <span className={`${s.stageLabel} ${isDone ? s.stageLabelDone : ''}`}>
                                        {progressMeta[stage].label}
                                    </span>
                                    {isCurrent && <span className={s.stageSpinner} aria-hidden />}
                                </div>
                            );
                        })}
                    </div>
                ) : (
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
                )}
            </div>
        </div>
    );
};

export default NotificationPopup;
