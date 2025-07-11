import React, {useState, useEffect, useRef, MutableRefObject} from 'react';
import Swal from 'sweetalert2';
import {initSocket} from '../../socket';
import { useSelector } from "react-redux";
import {RootState, store} from "../../redux/store";
import { getCookies } from "../../utils";
import {CallData} from "../callControlPanel";
import {Project} from "../headerPanel";
import {CallRecord} from "../../App";

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
                        return (
                            <p key={idx} className="text text-dark" dangerouslySetInnerHTML={{ __html: blockData.text }}/>
                        );

                    case 'table': {
                        const content: string[][] = blockData.content || [];
                        if (content.length === 0) {
                            return null;
                        }
                        const [headerRow, ...bodyRows] = content;
                        const clean = (cell: any) =>
                            String(cell)
                                .replace(/&nbsp;/g, ' ')
                                .trim();

                        return (
                            <table key={idx} className="table table-sm table-bordered mb-3">
                                <thead>
                                <tr>
                                    {headerRow.map((cell, cIdx) => (
                                        <th key={cIdx}>{clean(cell)}</th>
                                    ))}
                                </tr>
                                </thead>
                                <tbody>
                                {bodyRows.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {row.map((cell, cIdx) => (
                                            <td key={cIdx}>{clean(cell)}</td>
                                        ))}
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        );
                    }

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
    selectedCall?: CallRecord | null
    setScriptFlag?: (scriptFlag: boolean) => void
    setScriptAnotherID?: (scriptFlag: string) => void
}

const ScriptPanel: React.FC<ScriptPanelProps> = ({
                                                     projectName,
                                                     direction,
                                                     uuid = '',
                                                     bUuid = '',
                                                     onClose,
                                                     selectedCall,
                                                     setScriptFlag,
                                                     setScriptAnotherID
                                                 }) => {
    const {
        sessionKey = '',
        sipLogin   = '',
        fsServer   = '',
        worker     = '',
    } = store.getState().credentials;

    // Текущая «комната» (room_id)
    const roomId     = useSelector((state: RootState) => state.room.roomId) || 'default_room';
    const socket = initSocket();

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
    // FAQ
    const [questions, setQuestions] = useState<ScriptQuestion[]>([]);
    const [searchText, setSearchText] = useState('');
    const [openAnswers, setOpenAnswers] = useState<{ [id: string]: boolean }>({});

    const prevCallUuid = useRef<string | null>(null);
    // Комментарий (если commentMode === 'true')
    const [comment, setComment] = useState('');
    const [selectedQuestion, setSelectedQuestion] = useState<ScriptQuestion | null>(null);
// Функция, вызываемая при клике по кнопке вопроса:
    const handleQuestionClick = (q: ScriptQuestion) => {
        setSelectedQuestion(q);
    };

    useEffect(() => {
        if (!scriptId && setScriptFlag) {
            setScriptFlag(true);
        }
    },[setScriptFlag, scriptId])
    useEffect(() => console.log("111editScript: ",direction),[direction])
    useEffect(() => console.log("111editProject: ",projectName),[projectName])

    // Из Redux — массив активных звонков
    const activeCalls: any[] = useSelector((state: RootState) => state.operator.activeCalls);
    const hasActiveCall = Array.isArray(activeCalls) ? activeCalls.some(ac => Object.keys(ac).length > 0) : false
    /** При монтировании: если есть активный звонок, запрашиваем start_script */
    useEffect(() => {
        if (hasActiveCall) {

            const firstCall = activeCalls[0];
            const currentUuid  = firstCall.uuid  || uuid;
            const currentBUuid = firstCall.b_uuid || bUuid;

            if (prevCallUuid.current === currentUuid) return;

            if (projectName) {
                prevCallUuid.current = currentUuid
            }

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
        } if (selectedCall) {
            socket.emit('script_operations', {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                room_id: roomId,
                fs_server: fsServer,
                action: 'start_script',
                direction,
                uuid: selectedCall.special_key_call || "",
                b_uuid: selectedCall.special_key_conn || "",
                project_name: projectName
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectName, direction, activeCalls]);

    useEffect(() => {
        function handleStartScript(msg: any) {
            if (setScriptAnotherID) {
                setScriptAnotherID(msg.script_id || '')
            }
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
                <div className="mb-3 p-3" style={{
                    backgroundColor: "#f7fafd",
                    border: "1px solid #b6defb",
                    borderRadius: 6
                }}>
                    <div className="d-flex align-items-center mb-2" style={{ gap: 8 }}>
                        <span className="material-icons" style={{ fontSize: 18, color: "#11a5ed" }}>
                            info
                        </span>
                        <span style={{ fontWeight: 600, color: "#0c4b85" }}>
                            Инструкция:
                        </span>
                    </div>

                    <div style={{
                        wordBreak: "break-word",
                        whiteSpace: "normal",
                        overflowX: "auto",
                        maxWidth: "100%"
                    }}>
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

                    {/*/!* Контейнер с кнопками (вопросами) *!/*/}
                    {/*<div className="d-flex flex-wrap" style={{ gap: '8px' }}>*/}
                    {/*    {filteredQuestions.map((q) => (*/}
                    {/*        <button*/}
                    {/*            key={q.id}*/}
                    {/*            className="btn btn-outline-light text text-dark"*/}
                    {/*            style={{ border: '1px solid #ccc' }}*/}
                    {/*            onClick={() => handleQuestionClick(q)}*/}
                    {/*        >*/}
                    {/*            {q.text}*/}
                    {/*            {q.category ? <span className="ml-2 text-secondary">({q.category})</span> : null}*/}
                    {/*        </button>*/}
                    {/*    ))}*/}
                    {/*</div>*/}
                    <div
                        className="d-flex flex-wrap"
                        style={{
                            gap: '8px',
                            alignItems: "flex-start",
                        }}
                    >
                        {filteredQuestions.map(q => (
                            <div
                                key={q.id}
                                style={{
                                    display: "inline-flex",
                                    flex: "0 0 auto",
                                    alignItems: "center",
                                    flexDirection: "column",
                                    fontSize: "0.9rem",
                                    cursor: "pointer",
                                    whiteSpace: "normal",
                                    wordBreak: "break-word",
                                    maxWidth: "100%",
                                }}
                            >
                                <button
                                    className="btn btn-outline-light text-dark"
                                    style={{ border: '1px solid #ccc', whiteSpace: 'normal' }}
                                    onClick={() => handleQuestionClick(q)}
                                >
                                    {q.text}
                                    {q.category && <span className="ml-2 text-secondary">({q.category})</span>}
                                </button>

                                {selectedQuestion?.id === q.id && (
                                    <div
                                        className="mt-1 p-2 bg-white border"
                                        style={{ borderRadius: 4 }}
                                    >
                                        <h6 className="font-weight-bold mb-2">{q.text}</h6>
                                        {renderEditorJsData(q.answer)}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                </div>

            </div>
        </div>
    );
};

export default ScriptPanel;
