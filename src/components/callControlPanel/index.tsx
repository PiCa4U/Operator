import React, { useState, useEffect } from 'react';
import { socket } from '../../socket';
import { getCookies } from '../../utils';
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";
import {selectMyProjects, selectProjectPool} from "../../redux/operatorSlice";
import Swal from "sweetalert2";
import EditableFields from "./components";

// Интерфейсы
export interface CallData {
    a_line_num: string;
    api_transfer: boolean;
    b_line_num: string;
    base_fields: {
        [key: string]: string;
    };
    billsec: number;
    call_reason: number | string;
    call_reson_manual: number | string | null;
    call_result: number | string;
    call_result_manual: number | string | null;
    call_stopper: string;
    caller_context: string;
    caller_id: string;
    cc_cancel_reason: string | null;
    cc_cause: string;
    cc_member_pre_answer_uuid: string | null;
    cc_member_session_uuid: string;
    cc_member_uuid: string;
    cc_queue_joined_epoch: string;
    cc_queue_terminated_epoch: string | null;
    channel_call_state: string;
    channel_direction: string;
    channel_name: string;
    date_end: string;
    date_start: string;
    datetime_end: string;
    datetime_start: string;
    destination_id: string;
    direction: string;
    duration: number;
    event_sequence: number;
    fs_server: string;
    hangup_cause: string;
    id: number;
    id_gateway: number | null;
    is_recorded: boolean;
    len_queue: number;
    len_time: number;
    missed_mark: any | null;
    oper_saved: boolean;
    other_type: string;
    project_name: string;
    recall: boolean;
    record_name: string;
    refer_uuid: string | null;
    seqence_num: string;
    special_key_call: string;
    special_key_conn: string;
    stampsec: number;
    time_end: string;
    time_start: string;
    total_direction: string;
    total_queue_time: number;
    transfer_destination: string | null;
    transfered: string | null;
    user_comment: string;
    user_login: string;
    variable_cc_queue: string;
    variable_last_arg: string | null;
    variable_profile_start_stamp: string;
    variable_sip_contact_user: string;
    waitsec: number;
}

interface CallControlPanelProps {
    call: CallData;
    onClose: () => void; // функция закрытия карточки
}

interface ReasonItem {
    active: boolean;
    created_date: string;
    deleted_date: string | null;
    glagol_parent: string;
    project_name: string;
    id: string;
    name: string;
    description: string | null;
}

interface ResultItem {
    active: boolean;
    created_date: string;
    deleted_date: string | null;
    glagol_parent: string;
    project_name: string;
    id: string;
    name: string;
    description: string | null;
}

export interface FieldDefinition {
    created_dt: string;
    deleted: boolean;
    editable: boolean;
    field_id: string;
    field_name: string;
    field_type: string;
    field_vals: string | null;
    glagol_parent: string;
    id: number;
    modified_dt: string | null;
    must_have: boolean;
    project_name: string;
}

const CallControlPanel: React.FC<CallControlPanelProps> = ({ call, onClose }) => {
    // Получаем данные из cookies
    const sessionKey = getCookies('session_key') || '';
    const sipLogin = getCookies('sip_login') || '';
    const fsServer = getCookies('fs_server') || '';
    const worker = getCookies('worker') || '';
    const roomId = useSelector((state: RootState) => state.room.roomId) || 'default_room';

    const [callReason, setCallReason] = useState(call.call_reason || '');
    const [callResult, setCallResult] = useState(call.call_result || '');
    const [comment, setComment] = useState(call.user_comment || '');

    const [callReasons, setCallReasons] = useState<ReasonItem[]>([]);
    const [callResults, setCallResults] = useState<ResultItem[]>([]);

    const [params, setParams] = useState<FieldDefinition[]>([]);
    const [baseFieldValues, setBaseFieldValues] = useState<{ [fieldId: string]: string }>(
        call.base_fields || {}
    );
    console.log(`params: `, params)
    const myProject = useSelector((state: RootState) => state.operator.monitorData.monitorProjects[call.project_name]);
    console.log("myProject: ", myProject)
    const projectPool = useSelector((state: RootState) => selectProjectPool(state, sipLogin));

    // При изменении call обновляем локальные состояния
    useEffect(() => {
        setCallReason(call.call_reason || '');
        setCallResult(call.call_result || '');
        setComment(call.user_comment || '');
        if (call.base_fields) {
            setBaseFieldValues(call.base_fields);
        } else {
            setBaseFieldValues({});
        }
    }, [call]);

    // Обработка события fs_reasons
    useEffect(() => {
        const handleFsReasons = (data: {
            call_reasons: ReasonItem[];
            call_results: ResultItem[];
            as_is_dict: FieldDefinition[];
        }) => {
            // Фильтруем по проекту (на основании projectPool)
            setCallReasons(data.call_reasons.filter(reason => reason.project_name === projectPool[0]));
            setCallResults(data.call_results.filter(result => result.project_name === projectPool[0]));
            setParams(data.as_is_dict.filter(param => param.project_name === projectPool[0]));
        };
        socket.on('fs_reasons', handleFsReasons);
        return () => {
            socket.off('fs_reasons', handleFsReasons);
        };
    }, [projectPool]);

    const formatDuration = (sec: number) => {
        const minutes = Math.floor(sec / 60);
        const seconds = sec % 60;
        return `${minutes > 0 ? `${minutes} мин. ` : ''}${seconds} сек.`;
    };

    const getDisplayNumber = () => {
        return call.direction === 'outbound'
            ? call.destination_id || call.caller_id || '—'
            : call.caller_id || call.destination_id || '—';
    };

    const audioUrl = call.record_name
        ? `https://my.glagol.ai/get_cc_audio/${(call.project_name || '').replace('@', '_at_')}/${call.record_name}`
        : null;

    // Функция валидации формы
    const validateForm = (): boolean => {
        if (!callReason) {
            Swal.fire({ title: "Ошибка", text: "Выберите причину звонка", icon: "error" });
            return false;
        }
        if (!callResult) {
            Swal.fire({ title: "Ошибка", text: "Выберите результат звонка", icon: "error" });
            return false;
        }
        const missingFields = params.filter(
            param =>
                param.must_have &&
                (!baseFieldValues[param.field_id] || baseFieldValues[param.field_id].trim() === '')
        );
        if (missingFields.length > 0) {
            const names = missingFields.map(f => f.field_name).join(', ');
            Swal.fire({ title: "Ошибка", text: `Обязательные поля не заполнены: ${names}`, icon: "error" });
            return false;
        }
        return true;
    };

    const handleSave = () => {
        if (!validateForm()) return;

        const selectedReason = callReasons.find(reason => String(reason.id) === callReason);
        const selectedResult = callResults.find(result => String(result.id) === callResult);
        const selectedReasonText = selectedReason ? selectedReason.name : "";
        const selectedResultText = selectedResult ? selectedResult.name : "";

        console.log("selectedReason: ", selectedReason);
        console.log("selectedResult: ", selectedResult);

        socket.emit('edit_call_fs', {
            fs_server: fsServer,
            call_id: call.id,
            call_reason: callReason,
            call_result: callResult,
            comment: comment,
            session_key: sessionKey,
            worker: worker,
            base_fields: baseFieldValues,
            result_text: selectedResultText,
            reason_text: selectedReasonText,
        });
        socket.emit('get_fs_report', {
            worker: worker,
            session_key: sessionKey,
            sip_login: sipLogin,
            room_id: roomId,
            fs_server: fsServer,
            level: 0,
        });
        onClose();
    };

    const handleParamsChange = (values: { [fieldId: string]: string }) => {
        setBaseFieldValues(values);
    };

    return (
        <div className="card-body">
            <div >
                <h5 className="font-weight-bold d-flex align-items-center">
                    {call.total_direction === "outbound" ? (
                        <>
                            <span className="material-icons" style={{ color: "#7cd420" }}>
                                login
                            </span>
                            <div>
                                {call.b_line_num} | {call.datetime_start}
                            </div>
                        </>
                    ) : (
                        <>
                            <span className="material-icons" style={{ color: "#f26666" }}>
                                logout
                            </span>
                            <div>
                                {call.a_line_num} | {call.datetime_start}
                            </div>
                        </>
                    )}
                </h5>

                <p>
                    <strong>Проект: </strong> {myProject} <br />
                    <strong>Длительность:</strong> {formatDuration(call.len_time)}
                </p>

                {audioUrl && (
                    <div className="mb-3">
                        <audio controls style={{ width: '100%' }}>
                            <source src={audioUrl} type="audio/mpeg" />
                            Ваш браузер не поддерживает аудиоплеер.
                        </audio>
                    </div>
                )}

                <div className="form-group">
                    <label>
                        Причина звонка:<span style={{ color: 'red' }}> *</span>
                    </label>
                    <select
                        className="form-control"
                        value={callReason}
                        onChange={(e) => setCallReason(e.target.value)}
                    >
                        <option value="">Выберите причину</option>
                        {callReasons.map(reason => (
                            <option key={reason.id} value={reason.id} title={reason.description || ""}>
                                {reason.name}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>
                        Результат звонка:<span style={{ color: 'red' }}> *</span>
                    </label>
                    <select
                        className="form-control"
                        value={callResult}
                        onChange={(e) => setCallResult(e.target.value)}
                    >
                        <option value="">Выберите результат</option>
                        {callResults.map(result => (
                            <option key={result.id} value={result.id} title={result.description || ""}>
                                {result.name}
                            </option>
                        ))}
                    </select>
                </div>
                <EditableFields
                    params={params}
                    initialValues={baseFieldValues}
                    onChange={handleParamsChange}
                />

                <div className="form-group">
                    <label>Комментарий:</label>
                    <textarea
                        className="form-control"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Введите комментарий"
                    />
                </div>
            </div>

            <div className="card-footer d-flex justify-content-end">
                <button className="btn btn-outline-success" onClick={handleSave}>
                    Сохранить
                </button>
            </div>
        </div>
    );
};

export default CallControlPanel;
