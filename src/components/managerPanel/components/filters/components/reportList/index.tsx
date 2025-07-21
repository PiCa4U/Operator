import React, { FC } from "react";

interface Props {
    reportList: any[];
    setSelectedReport: (selectedReport: any) => void
}

export const ReportList: FC<Props> = ({ reportList, setSelectedReport }) => {
    const columnTemplate = "12% 10% 8% 6% 10% 12% 14% 14% 14%";

    const getCellStyle = (): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'stretch',
    });

    const getInnerStyle = (addRightBorder: boolean, borderColor: string): React.CSSProperties => ({
        flex: 1,
        padding: '4px 6px',
        borderRight: addRightBorder ? `1px solid ${borderColor}` : undefined,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
    });


    const icon = (dir: string) => {

        if (dir === "outbound" ) {
            return(
                <span className="material-icons" style={{color: "#f26666"}}>
                    logout
                </span>
            )
        } else {
            return(
                <span className="material-icons" style={{color: "#7cd420"}}>
                    login
                </span>
            )
        }
    }

    return (
        <div
            style={{
                display: "flex",
                flexDirection: "column",
                maxHeight: "70vh",
                overflowY: "auto",
                border: "1px solid #ccc",
                borderRadius: 6,
                padding: 8,
                gap: 8,
            }}
        >
            {Array.isArray(reportList) && reportList.length > 0 && reportList.map((call, idx) => {
                const isError = !call.project_names || call.project_names.length === 0;
                const borderColor = isError ? '#dc3545' : '#17a2b8';

                return (
                    <div
                        key={idx}
                        onClick={() => setSelectedReport(call)}
                        style={{
                            display: "grid",
                            gridTemplateColumns: columnTemplate,
                            alignItems: "stretch",
                            fontSize: "0.75rem",
                            border: `1px solid ${borderColor}`,
                            borderBottom: `1px solid ${borderColor}`,
                            padding: 4,
                            borderRadius: 4,
                            cursor: "pointer",
                            backgroundColor: "#fdfdfd",
                            transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = "#f0f0f0"}
                        onMouseLeave={(e) => e.currentTarget.style.background = "#fdfdfd"}
                    >
                        <div style={getCellStyle()}>
                            <div style={getInnerStyle(true, borderColor)}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    height: '100%',
                                }}>
                                    {icon(call.direction)}
                                    <span>{call.phone_number || "—"}</span>
                                </div>
                            </div>
                        </div>

                        <div style={getCellStyle()}><div style={getInnerStyle(true, borderColor)}>{call.date_start || "—"}</div></div>
                        <div style={getCellStyle()}><div style={getInnerStyle(true, borderColor)}>{call.time_start || "—"}</div></div>
                        <div style={getCellStyle()}><div style={getInnerStyle(true, borderColor)}>{call.duration || "—"}</div></div>
                        <div style={getCellStyle()}><div style={getInnerStyle(true, borderColor)}>{call.operator_name || "—"}</div></div>
                        <div style={getCellStyle()}>
                            <div style={getInnerStyle(true, borderColor)} title={call.project_names?.join(", ")}>
                                {call.project_names?.length > 2
                                    ? call.project_names.slice(0, 2).join(", ") + "…"
                                    : call.project_names?.join(", ") || "—"}
                            </div>
                        </div>
                        <div style={getCellStyle()}>
                            <div style={getInnerStyle(true, borderColor)}>
                                {String(Object.values(call.call_reasons || {})[0] || "—")}
                            </div>
                        </div>
                        <div style={getCellStyle()}>
                            <div style={getInnerStyle(true, borderColor)}>
                                {String(Object.values(call.call_results || {})[0] || "—")}
                            </div>
                        </div>
                        <div style={getCellStyle()}>
                            <div style={getInnerStyle(false, borderColor)}>
                                {String(Object.values(call.comments || {})[0] || "—")}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
