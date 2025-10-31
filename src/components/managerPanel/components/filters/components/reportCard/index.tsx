import React, { FC, useMemo, useRef, useEffect } from "react";
import { makeSelectFullProjectPool } from "../../../../../../redux/operatorSlice";
import { useSelector } from "react-redux";
import { store } from "../../../../../../redux/store";

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
    position?: number;
    width?: number | null;
};

type Props = {
    selectedReport: any;     // элемент из списка
    fieldsData: any | null;  // может быть null, если проектов нет
    reports: any[];          // related calls для выбранного разговора
};

// ── утилиты ───────────────────────────────────────────────────────────────────
const stripDirectionSuffix = (name?: string) =>
    typeof name === "string"
        ? name.replace(/\s*\((?:outbound|inbound)\)\s*$/i, "").trim()
        : "";

const norm = (s?: string) => stripDirectionSuffix(s).toLowerCase();

const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));

// ── чтение fsServer из data-атрибута ──────────────────────────────────────────
const container = document.getElementById("root");
if (!container) throw new Error("Root container not found");
const rawFsServer = (container.dataset as any).fsServer;
const fsServer = rawFsServer || "wwstest.glagol.ai";

// ── выбор лучшей «ноги» разговора (детерминированно) ─────────────────────────
type Comm = any;
function pickPrimaryCall(selectedReport: any, reports: Comm[]) {
    if (!Array.isArray(reports) || reports.length === 0) return selectedReport || null;

    const targetKey =
        selectedReport?.special_key_call ||
        selectedReport?.special_key_conn ||
        selectedReport?.correlation_id ||
        null;

    const totalDir = String(
        selectedReport?.total_direction || selectedReport?.direction || ""
    ).toLowerCase();

    const wantOtherType =
        totalDir === "inbound" ? "originatee" :
            totalDir === "outbound" ? "originator" : null;

    const score = (r: Comm) => {
        const rn = String(r?.record_name || "");
        const hasRec = rn ? 1 : 0;
        const includesKey = targetKey && rn.includes(String(targetKey)) ? 1 : 0;
        const isRecordedFlag = r?.is_recorded ? 1 : 0;
        const external = r?.channel_direction === "external" ? 1 : 0;
        const otherTypeOk = wantOtherType ? (r?.other_type === wantOtherType ? 1 : 0) : 0;
        const answered = r?.cc_cause === "answered" ? 1 : 0;
        const bill = Number.isFinite(r?.billsec) ? r.billsec : 0;
        const dur = Number.isFinite(r?.duration) ? r.duration : 0;
        return [hasRec, includesKey, isRecordedFlag, external, otherTypeOk, answered, bill, dur];
    };

    const sorted = reports.slice().sort((a, b) => {
        const sa = score(a), sb = score(b);
        for (let i = 0; i < sa.length; i++) {
            const diff = sb[i] - sa[i]; // DESC
            if (diff !== 0) return diff;
        }
        const ta = new Date(a?.datetime_start || 0).getTime() || 0;
        const tb = new Date(b?.datetime_start || 0).getTime() || 0;
        return tb - ta;
    });

    const top = sorted[0];
    if (top?.record_name) return top;

    return reports.find(r => r?.id === selectedReport?.id) || top || selectedReport || null;
}

// ── компонент ─────────────────────────────────────────────────────────────────
export const ReportCard: FC<Props> = ({ selectedReport, fieldsData, reports }) => {
    // выбираем «лучшую» ногу
    const primaryCall = useMemo(
        () => pickPrimaryCall(selectedReport, reports),
        [selectedReport?.id, reports]
    );

    const { sipLogin = "" } = store.getState().credentials;
    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];

    const iconCol = primaryCall?.total_direction === "outbound" ? "#f26666" : "#7cd420";

    const operatorID = primaryCall
        ? primaryCall.total_direction === "outbound" && !primaryCall.express
            ? primaryCall.a_line_num || primaryCall.destination_id || primaryCall.caller_id || "—"
            : primaryCall.b_line_num || primaryCall.caller_id || "—"
        : "—";

    const operatorName = selectedReport?.operator_name ?? "—";
    const callReason = String(Object.values(selectedReport?.call_reasons ?? {})[0] ?? "—");
    const callResult = String(Object.values(selectedReport?.call_results ?? {})[0] ?? "—");
    const comment = String(Object.values(selectedReport?.comments ?? {})[0] ?? "—");

    const commonField = (label: string, value: string) => (
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            <div style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{label}:</div>
            <div style={{ fontWeight: 600 }}>{value ?? ""}</div>
        </div>
    );

    const getGlagolName = (sysProjectName: string) => {
        const g = projectPool.find((p: any) => norm(p.project_name) === norm(sysProjectName))?.glagol_name
            ?? stripDirectionSuffix(sysProjectName);
        return stripDirectionSuffix(g);
    };

    // финальный список названий проектов (человеческие, без суффиксов)
    const displayProjectNames = useMemo<string[]>(() => {
        if (Array.isArray(selectedReport?.project_names) && selectedReport.project_names.length > 0) {
            return uniq((selectedReport.project_names as string[]).map(stripDirectionSuffix));
        }
        const sysFromComms = uniq<string>(
            (reports || []).map((r: any) => r?.project_name).filter(Boolean)
        );
        if (sysFromComms.length) return sysFromComms.map((sys) => getGlagolName(sys));
        if (primaryCall?.project_name) return [getGlagolName(primaryCall.project_name)];
        return [];
    }, [selectedReport, reports, primaryCall, projectPool]);

    // ── аудио (перемотка/обновление) ────────────────────────────────────────────
    const recordSrc = primaryCall?.record_name
        ? `https://my.glagol.ai/get_cc_audio/${fsServer}/${primaryCall.record_name}`
        : null;

    const audioKey = recordSrc ?? `no-record:${primaryCall?.id ?? selectedReport?.id}`;
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // если меняется src — перечитать метаданные (даёт длительность и скраббер)
    useEffect(() => {
        if (audioRef.current) {
            try { audioRef.current.load(); } catch {}
        }
    }, [recordSrc]);

    const renderSelectedCallHeader = () => {
        const dirIsOutbound = primaryCall?.total_direction === "outbound";
        const headNumber = dirIsOutbound
            ? primaryCall?.b_line_num || primaryCall?.caller_id || "—"
            : primaryCall?.a_line_num || primaryCall?.destination_id || primaryCall?.caller_id || "—";

        return (
            <div>
                <div className="d-flex align-items-center my-2">
          <span className="material-icons" style={{ color: iconCol }}>
            {dirIsOutbound ? "logout" : "login"}
          </span>
                    <strong className="ml-2" style={{ fontSize: 16, fontWeight: 600 }}>
                        {headNumber}
                        {" | "}
                        {primaryCall?.datetime_start ? new Date(primaryCall.datetime_start).toLocaleString() : "—"}
                    </strong>
                </div>

                {recordSrc ? (
                    <div className="mb-3">
                        <audio
                            key={audioKey}              // гарантированное пересоздание при смене записи
                            ref={audioRef}
                            controls
                            preload="metadata"          // даёт длительность и скраббер
                            crossOrigin="anonymous"     // если домен отличается и включён CORS
                            style={{ width: "100%" }}
                            onLoadedMetadata={(e) => {
                                // console.log('duration', e.currentTarget.duration);
                            }}
                        >
                            <source src={recordSrc} type="audio/mpeg" />
                            Ваш браузер не поддерживает аудиоплеер
                        </audio>
                    </div>
                ) : (
                    <div className="mb-3 text-muted" style={{ fontSize: ".9rem" }}>
                        Запись разговора недоступна
                    </div>
                )}

                <label className="mb-2" style={{ whiteSpace: "nowrap", fontWeight: 600, fontSize: ".85rem" }}>
                    Проекты:&nbsp;
                    <span>{displayProjectNames.length ? displayProjectNames.join(", ") : "—"}</span>
                </label>
            </div>
        );
    };

    const renderGroupedFields = () => {
        if (!fieldsData?.as_is_dict || !fieldsData?.group_instructions) return null;

        return Object.entries(fieldsData.as_is_dict as Record<string, FieldType[]>).map(
            ([sysProjectName, fields]) => {
                const groupsForProject: GroupMeta[] =
                    fieldsData?.group_instructions?.[sysProjectName]?.groups ?? [];

                const grouped = new Map<number, FieldType[]>();
                fields.forEach((f) => {
                    const gid = f.group_id ?? -1;
                    if (!grouped.has(gid)) grouped.set(gid, []);
                    grouped.get(gid)!.push(f);
                });

                return (
                    <div key={sysProjectName} style={{ marginTop: 12 }}>
                        <h5>{getGlagolName(sysProjectName)}</h5>

                        {Array.from(grouped.entries()).map(([groupId, groupFields]) => {
                            const meta = groupsForProject.find((g) => g.id === groupId);
                            const groupLabel =
                                meta?.group_name ?? (groupId === -1 ? "Без группы" : `Группа ${groupId}`);

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
                                        {groupFields.map((field) => {
                                            const value =
                                                (primaryCall?.base_fields?.[sysProjectName]?.[field.field_id] as string) ?? "";
                                            return (
                                                <div key={field.field_id} style={{ display: "flex", gap: 6 }}>
                                                    <div style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{field.field_name}:</div>
                                                    <div style={{ color: "#333", fontWeight: 500 }}>{value}</div>
                                                </div>
                                            );
                                        })}
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
                {commonField("id оператора", String(operatorID))}
                {commonField("Оператор", String(operatorName))}
                {commonField("Причина звонка", String(callReason))}
                {commonField("Результат звонка", String(callResult))}
                {commonField("Комментарий", String(comment))}
                <hr />
                {renderGroupedFields()}
                <div style={{ marginBottom: 10 }} />
            </div>
        </div>
    );
};
