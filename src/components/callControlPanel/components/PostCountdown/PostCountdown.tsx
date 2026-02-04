import React from "react";

type Props = {
    enabled: boolean;
    limitSec: number;
    secondsRef: React.MutableRefObject<number>;
    onExpire: () => void;
    className?: string;
};

const PostCountdown: React.FC<Props> = React.memo(
    ({ enabled, limitSec, secondsRef, onExpire, className }) => {
        const onExpireRef = React.useRef(onExpire);
        React.useEffect(() => {
            onExpireRef.current = onExpire;
        }, [onExpire]);

        const [sec, setSec] = React.useState<number>(limitSec);
        const timerRef = React.useRef<number | null>(null);

        React.useEffect(() => {
            // сброс при выключении
            if (!enabled) {
                if (timerRef.current) window.clearInterval(timerRef.current);
                timerRef.current = null;
                setSec(limitSec);
                secondsRef.current = limitSec;
                return;
            }

            // старт / ресет при включении
            setSec(limitSec);
            secondsRef.current = limitSec;

            if (timerRef.current) window.clearInterval(timerRef.current);

            timerRef.current = window.setInterval(() => {
                setSec((prev) => {
                    const next = prev - 1;
                    const clamped = next < 0 ? 0 : next;
                    secondsRef.current = clamped;

                    if (clamped <= 0) {
                        if (timerRef.current) window.clearInterval(timerRef.current);
                        timerRef.current = null;
                        // вызываем авто-возврат
                        onExpireRef.current();
                        return 0;
                    }

                    return clamped;
                });
            }, 1000);

            return () => {
                if (timerRef.current) window.clearInterval(timerRef.current);
                timerRef.current = null;
            };
        }, [enabled, limitSec, secondsRef]);

        if (!enabled) return null;

        return (
            <p className={className}>
                Постобработка: осталось {sec} сек.
            </p>
        );
    }
);

export default PostCountdown;
