// src/components/CallControlPanel.tsx
import React from 'react';
import { useCallLogic } from '../../hooks/useCallLogic';

const CallControlPanel: React.FC = () => {
    const { callState, handlePhoneChange, callByNumber } = useCallLogic();

    return (
        <div className="call-control-panel">
            <input
                type="text"
                placeholder="Номер для вызова"
                value={callState.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="form-control"
                style={{ height: '40px' }}
            />
            <button
                onClick={() => callByNumber(callState.phone)}
                className="btn btn-outline-success"
                title="Вызов по введенному номеру телефона"
            >
                <i className="align-middle mr-1 fas fa-fw fa-address-book"></i>
                Вызов по номеру
            </button>
            {callState.error && <p className="error-message">{callState.error}</p>}
        </div>
    );
};

export default CallControlPanel;
