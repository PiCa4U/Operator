import React, { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { socket } from '../../socket';
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";
import { getCookies } from "../../utils";
import {CallData} from "../callControlPanel";
import {Project} from "../headerPanel";

/** Упрощённая функция для рендера EditorJS-данных. */
function renderEditorJsData(data: any) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.blocks)) {
        if (typeof data === 'string') {
            return <p className="text text-dark">{data}</p>;
        }
        return <p className="text text-dark">{JSON.stringify(data)}</p>;
    }

    return (
        <>
            {data.blocks.map((block: any, idx: number) => {
                const { type, data: blockData } = block;
                switch (type) {
                    case 'paragraph':
                        return <p key={idx} className="text text-dark">{blockData.text}</p>;
                    default:
                        return (
                            <div key={idx} className="text text-danger my-2">
                                Unsupported block type: {type}
                            </div>
                        );
                }
            })}
        </>
    );
}

interface ScriptButton {
    Text: string;
    NextNumber: number;
    Keynote: string;       // Определяет цвет кнопки (0..4)
    BlockResultId?: number;
}

interface ScriptQuestion {
    id: string;
    text: string;
    answer: any;
    category?: string;
}

interface ScriptPanelProps {
    projectName: string;
    direction?: string;
    uuid?: string;
    bUuid?: string;
    onClose: () => void;
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({
                                                     projectName,
                                                     direction,
                                                     uuid = '',
                                                     bUuid = '',
                                                     onClose,
                                                 }) => {
    const sessionKey = getCookies('session_key') || '';
    const sipLogin   = getCookies('sip_login')   || '';
    const fsServer   = getCookies('fs_server')   || '';
    const worker     = getCookies('worker')      || '';
    console.log("projectNameSCRIPT: ", projectName)
    console.log("direction: ", direction)

    // Текущая «комната» (room_id)
    const roomId     = useSelector((state: RootState) => state.room.roomId) || 'default_room';

    // Состояния, аналогичные старому коду
    const [scriptId, setScriptId] = useState('');
    const [scriptMode, setScriptMode] = useState<string>('');  // 'rememeber', 'forget' и т.п.
    const [commentMode, setCommentMode] = useState<string>(''); // 'true'/'false'
    const [source, setSource] = useState('');                   // 'fs' или иное

    // Текущий блок
    const [blockName, setBlockName] = useState('');
    const [blockText, setBlockText] = useState<any>(null);
    const [instructions, setInstructions] = useState<any>(null);
    const [blockButtons, setBlockButtons] = useState<ScriptButton[]>([]);
    // useEffect(()=> console.log("projectName: ", projectName),[projectName])
    // FAQ
    const [questions, setQuestions] = useState<ScriptQuestion[]>([]);
    const [searchText, setSearchText] = useState('');
    const [openAnswers, setOpenAnswers] = useState<{ [id: string]: boolean }>({});

    // Комментарий (если commentMode === 'true')
    const [comment, setComment] = useState('');
    const [selectedQuestion, setSelectedQuestion] = useState<ScriptQuestion | null>(null);
// Функция, вызываемая при клике по кнопке вопроса:
    const handleQuestionClick = (q: ScriptQuestion) => {
        setSelectedQuestion(q);
    };

    // Из Redux — массив активных звонков
    const activeCalls: any[] = useSelector((state: RootState) => state.operator.activeCalls);
    const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false
    /** При монтировании: если есть активный звонок, запрашиваем start_script */
    useEffect(() => {
        if (hasActiveCall) {

            const firstCall = activeCalls[0];
            const currentUuid  = firstCall.uuid  || uuid;
            const currentBUuid = firstCall.b_uuid|| bUuid;

            socket.emit('script_operations', {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                room_id: roomId,
                fs_server: fsServer,
                action: 'start_script',
                direction,
                uuid: currentUuid || "",
                b_uuid: currentBUuid || "",
                project_name: projectName
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectName, direction, activeCalls]);

    useEffect(() => {
        /** Событие "start_script" */
        function handleStartScript(msg: any) {
            setScriptId(msg.script_id || '');
            setScriptMode(msg.script_mode || '');
            setCommentMode(msg.comment_mode || '');
            setSource(msg.source || '');

            setBlockName(msg.block_name || '');
            setBlockText(msg.block_text || null);
            setInstructions(msg.instructions || null);

            const rawButtons = msg.block_buttons;
            let buttonsArray: any[] = [];

            if (rawButtons && typeof rawButtons === 'object' && !Array.isArray(rawButtons)) {
                buttonsArray = Object.values(rawButtons);
            } else if (Array.isArray(rawButtons)) {
                buttonsArray = rawButtons;
            }
            setBlockButtons(buttonsArray);

            // FAQ
            if (msg.questions) {
                const arrQuestions: ScriptQuestion[] = Object.values(msg.questions).map((q: any) => ({
                    id: String(q.id),
                    text: q.block_name || 'No title',
                    answer: q.block_text || '',
                    category: q.category || ''
                }));
                setQuestions(arrQuestions);
            } else {
                setQuestions([]);
            }
        }

        /** Событие "move_script" */
        function handleMoveScript(msg: any) {
            setBlockName(msg.block_name || '');
            setBlockText(msg.block_text || null);
            setInstructions(msg.instructions || null);

            const rawButtons = msg.block_buttons;
            let buttonsArray: any[] = [];
            if (rawButtons && typeof rawButtons === 'object' && !Array.isArray(rawButtons)) {
                buttonsArray = Object.values(rawButtons);
            } else if (Array.isArray(rawButtons)) {
                buttonsArray = rawButtons;
            }
            setBlockButtons(buttonsArray);
        }

        socket.on('start_script', handleStartScript);
        socket.on('move_script', handleMoveScript);

        return () => {
            socket.off('start_script', handleStartScript);
            socket.off('move_script', handleMoveScript);
        };
    }, [direction, projectName, sipLogin, sessionKey, roomId, fsServer, worker]);

    /** Клик по кнопке скрипта => move_script */
    const handleButtonClick = (btn: ScriptButton) => {
        if (Number(btn.NextNumber) === 0) {
            onClose();
            return;
        }

        const payload = {
            worker,
            sip_login: sipLogin,
            session_key: sessionKey,
            room_id: roomId,
            fs_server: fsServer,
            script_id: scriptId,
            source,
            action: 'move_script',
            NextNumber: btn.NextNumber,
            comment: (commentMode === 'true') ? comment : '',
            direction: direction || "",
            uuid: activeCalls[0]?.uuid ?? "",
            b_uuid: activeCalls[0]?.b_uuid ?? "",
            project_name: projectName,
            result_text: btn.Text,
            result_id: btn.BlockResultId || 0
        };
        socket.emit('script_operations', payload);
        setComment('');
    };

    /** Фильтрация FAQ */
    const filteredQuestions = questions.filter((q) => {
        const str = searchText.toLowerCase();
        const inText = q.text.toLowerCase().includes(str);
        const inCategory = q.category?.toLowerCase().includes(str);

        let inAnswer = false;
        if (typeof q.answer === 'string') {
            inAnswer = q.answer.toLowerCase().includes(str);
        } else if (q.answer && typeof q.answer === 'object') {
            inAnswer = JSON.stringify(q.answer).toLowerCase().includes(str);
        }
        return inText || inCategory || inAnswer;
    });

    /** Показ/скрытие ответа FAQ */
    const toggleAnswer = (id: string) => {
        setOpenAnswers(prev => ({ ...prev, [id]: !prev[id] }));
    };

    /** Если скрипт ещё не загрузился */
    if (!scriptId) {
        return (
            <div className="card border-info p-3 ml-3 text-center w-100">
                <p className="font-weight-bold mb-2 mt-3 text-dark">
                    Скрипт загружается или не запущен...
                </p>
            </div>
        );
    }

    const getBtnVariant = (keyNote: string): string => {
        switch (keyNote) {
            case "0": return 'danger';
            case "1": return 'info';
            case "2": return 'success';
            case "3": return 'warning';
            case "4": return 'dark';
            default: return 'primary';
        }
    };

    return (
        <div className="card border-info p-3 ml-3 w-100" style={{ backgroundColor: '#fff' }}>
            <div className="d-flex justify-content-between align-items-center mb-2">
                <h5 className="mb-0 text-dark">
                    {blockName || 'Приветствие'}
                </h5>
                <button onClick={onClose} className="btn btn-outline-light text text-dark">
                    <span className="material-icons" style={{marginTop: 4}}>
                        close
                    </span>
                </button>
            </div>

            <div className="mb-3" style={{ fontSize: '1rem', lineHeight: '1.5' }}>
                {renderEditorJsData(blockText)}
            </div>

            {instructions && (
                <div className=" mb-3">
                    <div  style={{display: "flex", flexDirection: "row", gap: 30}}>
                        <span className="material-icons" style={{fontSize: 16, color: "#11a5ed", marginTop: 2}}>
                            info
                        </span>
                        {renderEditorJsData(instructions)}
                    </div>
                </div>
            )}

            {commentMode === 'true' && (
                <div className="mb-3">
                    <label className="font-weight-bold text-dark">Комментарий к шагу:</label>
                    <textarea
                        className="form-control mt-1"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Введите комментарий..."
                        style={{ minHeight: '60px' }}
                    />
                </div>
            )}

            <div className="d-flex flex-wrap mb-3">
                {blockButtons.map((btn, idx) => {
                    const variant = getBtnVariant(btn.Keynote);
                    console.log("variant: ", variant)
                    return (
                        <button
                            key={idx}
                            className={`btn btn-outline-${variant} m-1`}
                            style={{ minWidth: '200px' }}
                            onClick={() => handleButtonClick(btn)}
                        >
                            {btn.Text}
                        </button>
                    );
                })}
            </div>
            <div style={{display: "flex", width:"100%", borderRadius: 4, borderWidth: 2, borderColor: "#A9A9A9", height: 1, borderStyle:"inherit"}}/>

            <div style={{backgroundColor: "#f1f1f1", marginTop: 8, borderRadius: 4, padding: 16}}>
                {/* Поиск по FAQ */}
                <div className="mb-2" style={{marginTop: 8}}>
                    <input
                        type="text"
                        className="form-control mt-1"
                        placeholder="Найти вопрос..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>

                <div className="mt-3">
                    {filteredQuestions.length === 0 && (
                        <p className="text-muted">Нет вопросов по вашему запросу.</p>
                    )}

                    {/* Контейнер с кнопками (вопросами) */}
                    <div className="d-flex flex-wrap" style={{ gap: '8px' }}>
                        {filteredQuestions.map((q) => (
                            <button
                                key={q.id}
                                className="btn btn-outline-light text text-dark"
                                style={{ border: '1px solid #ccc' }}
                                onClick={() => handleQuestionClick(q)}
                            >
                                {q.text}
                                {q.category ? <span className="ml-2 text-secondary">({q.category})</span> : null}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3">
                        <div
                            style={{
                                display: "flex",
                                width: "100%",
                                borderRadius: 4,
                                borderWidth: 2,
                                borderColor: "#A9A9A9",
                                height: 1,
                                borderStyle: "solid"
                            }}
                        />
                        {selectedQuestion ? (
                            <div className="p-3">
                                <h5 className="font-weight-bold text-dark">{selectedQuestion.text}</h5>
                                <div className="mt-2">
                                    {renderEditorJsData(selectedQuestion.answer)}
                                </div>
                            </div>
                        ) : (
                            <p className="text-muted">Выберите вопрос, чтобы увидеть ответ.</p>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default ScriptPanel;
