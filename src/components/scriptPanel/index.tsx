import React, { useState, useEffect } from 'react';
import { socket } from '../../socket';
import Swal from 'sweetalert2';

interface ScriptBlock {
    blockName: string;
    blockText: string;
    instructions?: string;
    buttons: ScriptButton[];
}

interface ScriptButton {
    text: string;
    nextNumber: number;
    keyNote: number;
}

interface ScriptPanelProps {
    projectName: string;
    onClose: () => void;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({ projectName, onClose }) => {
    const [currentBlock, setCurrentBlock] = useState<ScriptBlock | null>(null);
    const [loading, setLoading] = useState(false);
    const [comment, setComment] = useState('');

    useEffect(() => {
        const handleStartScript = (msg: any) => {
            const block: ScriptBlock = {
                blockName: msg.block_name,
                blockText: msg.block_text,
                instructions: msg.instructions,
                buttons: msg.block_buttons || [],
            };
            setCurrentBlock(block);
            setLoading(false);
        };

        socket.on('start_script', handleStartScript);

        // Можно подписаться и на другие события (move_script, run_module, etc.)

        // Отписываемся при размонтировании
        return () => {
            socket.off('start_script', handleStartScript);
        };
    }, []);

    const handleButtonClick = (button: ScriptButton) => {
        // Если режим комментария включён, можно показать поле для ввода комментария
        // Или сразу отправлять запрос на сервер
        // Пример отправки:
        const payload = {
            action: 'move_script',
            nextNumber: button.nextNumber,
            comment: comment,
            project_name: projectName,
            // другие необходимые поля, например, uuid и т.д.
        };
        socket.emit('script_operations', payload, (response: any) => {
            if (response.success) {
                // Обновляем текущий блок скрипта
                setCurrentBlock({
                    blockName: response.block_name,
                    blockText: response.block_text,
                    instructions: response.instructions,
                    buttons: response.block_buttons || [],
                });
                // Сбрасываем комментарий
                setComment('');
            } else {
                Swal.fire({ title: 'Ошибка', text: response.error, icon: 'error' });
            }
        });
    };

    if (loading || !currentBlock) {
        return <div>Загрузка скрипта...</div>;
    }

    return (
        <div className="script-panel">
            <div className="script-header">
                <h5>{currentBlock.blockName}</h5>
                <button onClick={onClose} className="btn btn-outline-danger">Закрыть скрипт</button>
            </div>
            <div className="script-body">
                <p>{currentBlock.blockText}</p>
                {currentBlock.instructions && (
                    <div className="script-instructions">
                        <p><strong>Инструкции:</strong> {currentBlock.instructions}</p>
                    </div>
                )}
                {/* Если комментарии нужны для этого шага */}
                { /* comment_mode можно сделать условием */ }
                <div className="form-group">
                    <label>Комментарий:</label>
                    <textarea
                        className="form-control"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Введите комментарий (если нужно)"
                    />
                </div>
                <div className="script-buttons">
                    {currentBlock.buttons.map((btn, index) => (
                        <button
                            key={index}
                            className={`btn btn-outline-${btn.keyNote === 3 ? 'warning' : 'primary'} m-1`}
                            onClick={() => handleButtonClick(btn)}
                        >
                            {btn.text}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ScriptPanel;
