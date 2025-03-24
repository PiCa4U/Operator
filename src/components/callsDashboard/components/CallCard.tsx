import React from 'react';

interface CallCardProps {
    call: any;
}

const CallCard: React.FC<CallCardProps> = ({ call }) => {
    const { id, caller_id, destination_id, datetime_start, call_reason, call_result } = call;

    return (
        <div className="call-card">
            <p>Номер: {caller_id ?? destination_id}</p>
            <p>Время начала: {datetime_start}</p>
            <p>Причина: {call_reason ?? '—'}</p>
            <p>Результат: {call_result ?? '—'}</p>
            {/* Кнопки «Редактировать», «Удержать» и т.д. можно тоже здесь добавить */}
        </div>
    );
};

export default CallCard;
