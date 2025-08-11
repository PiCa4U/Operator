// NotificationPopup.tsx
import React, { useEffect } from 'react';
import s from './NotificationPopup.module.css';

interface Props {
    direction: 'inbound' | 'outbound';
    from?: string;
    onAccept(): void;
    onReject(): void;
}

const NotificationPopup: React.FC<Props> = ({ direction, from, onAccept, onReject }) => {
    useEffect(() => {
        const audio = new Audio('/iphone-11-pro.mp3');
        audio.loop = true;
        audio.play();
        return () => {
            audio.pause();
        };
    }, []);

    return (
        <div className={s.overlay}>
            <div className={s.popup}>
                <h3>{direction === 'inbound' ? 'Входящий звонок' : 'Исходящий звонок'}</h3>
                {from && <p>От: {from}</p>}
                <div className={s.buttons}>
                    <button onClick={onAccept} className={s.accept}>Принять</button>
                    <button onClick={onReject} className={s.reject}>Отклонить</button>
                </div>
            </div>
        </div>
    );
};

export default NotificationPopup;
