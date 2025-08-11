import React, {FC, useMemo} from "react";
import {makeSelectFullProjectPool} from "../../../../../../redux/operatorSlice";
import {useSelector} from "react-redux";
import {store} from "../../../../../../redux/store";

type FieldType = {
    field_id: string;
    field_name: string;
    field_type?: string;
    editable?: boolean;
    group_id?: number;
};

type GroupMeta = {
    id: number;
    group_name: string;
    position: number;
    width: number;
};

type Props = {
    selectedReport: any;
    fieldsData: any;
    reports: any[];
};

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');
const rawFsServer = (container.dataset as any).fsServer;
const fsServer = rawFsServer || 'wwstest.glagol.ai';

export const ReportCard: FC<Props> = ({ selectedReport, fieldsData, reports }) => {
    const call = reports.find((item) => item.channel_direction === "internal");
    const iconCol = call?.total_direction === "outbound" ? "#f26666" : "#7cd420";
    console.log("selectedReport1: ", selectedReport)
    console.log("selectedReport2: ", fieldsData)
    console.log("selectedReport3: ", call)
    const { sipLogin = '' } = store.getState().credentials;

    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];
    console.log("projectPool: ", projectPool)
    const findProjectName = (proj: string) => {
        const matched = projectPool.find(project => project.project_name === proj)
        return matched.glagol_name
    }

    const operatorID = call
        ? call.total_direction === "outbound" && !call.express
            ? call.a_line_num || call.destination_id || call.caller_id || "—"
            : call.b_line_num || call.caller_id || "—"
        : "—";

    const operatorName = selectedReport.operator_name;

    const callReason = String(Object.values(selectedReport.call_reasons ?? {})[0] ?? "");
    const callResult = String(Object.values(selectedReport.call_results ?? {})[0] ?? "");
    const comment = String(Object.values(selectedReport.comments ?? {})[0] ?? "");



    const renderSelectedCallHeader = () => {
        return (
            <div>
                <div className="d-flex align-items-center my-2">
                    <span className="material-icons" style={{ color: iconCol }}>
                        {call?.total_direction === "outbound" ? "logout" : "login"}
                    </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600 }}>
                        {call?.total_direction === "outbound"
                            ? call?.b_line_num || call.caller_id || "—"
                            : call?.a_line_num || call?.destination_id || call?.caller_id || "—"}
                        {" | "}
                        {new Date(call?.datetime_start || "0").toLocaleString()}
                    </strong>
                </div>
                {call?.record_name && (
                    <div className="mb-3">
                        <audio controls style={{ width: "100%" }}>
                            <source
                                src={`https://my.glagol.ai/get_cc_audio/${fsServer}/${call.record_name}`}
                                type="audio/mpeg"
                            />
                            Ваш браузер не поддерживает аудиоплеер
                        </audio>
                    </div>
                )}
                <label className="mb-2" style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: ".85rem" }}>
                    Проекты:&nbsp;
                    <span>{selectedReport.project_names.join(", ")}</span>
                </label>
            </div>
        );
    };

    const commonField = (label: string, value: string) => {
        const val = value ? value : "";
        return (
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <div style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{label}:</div>
                <div style={{ fontWeight: 600 }}>{val}</div>
            </div>
        );
    };

    console.log("fieldsData: ", fieldsData)

    const findGroupName = (project: string ,id: number) => {
        const groups = fieldsData.group_instructions[project].groups
        const matched = groups.find((item: any) => item.id === id);
        return matched?.group_name ?? `Группа ${id}`;

    }
    const renderGroupedFields = () => {
        if (!fieldsData?.as_is_dict || !fieldsData?.group_instructions) return null;

        return Object.entries(fieldsData.as_is_dict as Record<string, FieldType[]>).map(
            ([project, fields]) => {
                const groups: GroupMeta[] = fieldsData.group_instructions["groups"]?.[project] || [];

                const grouped = new Map<number, FieldType[]>();
                fields.forEach((field) => {
                    const groupId = field.group_id ?? -1;
                    if (!grouped.has(groupId)) grouped.set(groupId, []);
                    grouped.get(groupId)!.push(field);
                });

                return (
                    <div key={project} style={{ marginTop: 12 }}>
                        <h5>{findProjectName(project)}</h5>

                        {Array.from(grouped.entries()).map(([groupId, groupFields]) => {
                            const groupMeta = groups.find((g) => g.id === groupId);
                            const groupLabel =
                                groupMeta?.group_name ??
                                (groupId === -1 ? "Без группы" : `${findGroupName(project,groupId)}`);
                            const fieldsDataConn = call.base_fields[project]
                            console.log("fieldsDataConn: ", fieldsDataConn)
                            return (
                                <div
                                    key={groupId}
                                    style={{
                                        marginTop: 8,
                                        padding: 8,
                                        border: "1px solid #ccc",
                                        borderRadius: 4,
                                        background: "#f9f9f9",
                                    }}
                                >
                                    <strong>{groupLabel}</strong>
                                    <div
                                        style={{
                                            marginTop: 8,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 6,
                                        }}
                                    >
                                        {groupFields.map((field) => (
                                            <div key={field.field_id} style={{ display: "flex", gap: 6 }}>
                                                <div style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{field.field_name}:</div>
                                                <div style={{ color: "#333", fontWeight: 500}}>{fieldsDataConn[field.field_id]}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                );
            }
        );
    };


    return (
        <div className="card col ml-0">
            <div>
                {renderSelectedCallHeader()}
                {commonField("id оператора", operatorID)}
                {commonField("Оператор", operatorName)}
                {commonField("Причина звонка", callReason)}
                {commonField("Результат звонка", callResult)}
                {commonField("Комментарий", comment)}
                <hr />
                {renderGroupedFields()}
                {/*<hr />*/}
                <div style={{marginBottom: 10}}/>
            </div>
        </div>
    );
};
