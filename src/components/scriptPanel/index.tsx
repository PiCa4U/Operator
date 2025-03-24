// src/components/scriptPanel/index.tsx
import React from 'react';

const ScriptPanel: React.FC = () => {
    const handleBack = () => {
        // Функция «назад» – можно реализовать навигацию или переключение видимости компонента
        console.log('Back button pressed');
        // Например, если вы используете React Router:
        // history.push('/worker_main');
    };

    return (
        <div
            id="script_place"
            className="col-7 pl-0 pr-3 mr-2 py-1"
            style={{ marginLeft: 0 }}
        >
            <div className="row col-12" style={{ height: '40px' }}>
                <div className="col"></div>
                <button
                    className="btn btn-outline-light text text-dark"
                    onClick={handleBack}
                >
                    <i className="fas fa-fw fa-times"></i>
                </button>
            </div>
            <div className="col-12">
                <div id="replica_box" className="col-12 script_box">
                    <div
                        id="replica_place"
                        className="col-12"
                        style={{ marginTop: 'auto' }}
                    >
                        {/* Здесь будет отображаться содержимое скрипта */}
                    </div>
                </div>
                <div
                    id="question_place"
                    className="col-12 mt-4 pr-3 pb-4"
                    style={{ backgroundColor: '#F2F2F2', borderRadius: '5px' }}
                >
                    {/* Здесь будут отображаться вопросы/ответы */}
                </div>
            </div>
        </div>
    );
};

export default ScriptPanel;
