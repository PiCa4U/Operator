import React from "react";
import {useSip} from "../../../../context/SipContext";

type InterCallLike = {
    cid_num?: string | number;
    dest?: string | number;
    callstate?: string;
    uuid?: string;
};

type Props = {
    interCall: InterCallLike;

    canTransfer?: boolean;

    onTransfer?: () => void;
    onHangup?: (uuid: string) => void;

    transferLabel?: string;
    transferTitle?: string;

    hangupLabel?: string;
    hangupTitle?: string;

    style?: React.CSSProperties;
    className?: string;
};

const ui = {
    wrap: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid #dee2e6",
        background: "#fff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
        flexWrap: "wrap",
    } as React.CSSProperties,

    left: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        minWidth: 0,
        flex: "1 1 auto",
    } as React.CSSProperties,

    icon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        display: "grid",
        placeItems: "center",
        background: "#f8f9fa",
        border: "1px solid #dee2e6",
        color: "#495057",
        flex: "0 0 auto",
    } as React.CSSProperties,

    titleRow: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        minWidth: 0,
        flexWrap: "wrap",
        lineHeight: 1.1,
    } as React.CSSProperties,

    num: {
        fontWeight: 700,
        fontSize: 16,
        color: "#212529",
        whiteSpace: "nowrap",
    } as React.CSSProperties,

    arrow: {
        fontWeight: 700,
        fontSize: 16,
        color: "#6c757d",
        whiteSpace: "nowrap",
    } as React.CSSProperties,

    sub: {
        marginTop: 2,
        fontSize: 12,
        color: "#6c757d",
    } as React.CSSProperties,

    chip: {
        fontSize: 12,
        fontWeight: 700,
        padding: "3px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        border: "1px solid transparent",
    } as React.CSSProperties,

    actions: {
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        flexWrap: "wrap",
        flex: "0 0 auto",
    } as React.CSSProperties,

    btnIcon: {
        fontSize: 18,
        verticalAlign: "middle",
        marginRight: 6,
    } as React.CSSProperties,
};

function stateChip(callstate: any) {
    const s = String(callstate ?? "").toLowerCase().trim();

    // мягкие "bootstrap-like" оттенки (чтобы не кричало)
    const base = {
        background: "#f8f9fa",
        color: "#495057",
        borderColor: "#dee2e6",
    } as React.CSSProperties;

    if (!s) {
        return { label: "статус…", style: base };
    }

    if (s === "early") {
        return {
            label: "соединение",
            style: {
                background: "#fff3cd",
                color: "#856404",
                borderColor: "#ffeeba",
            } as React.CSSProperties,
        };
    }

    if (s === "active") {
        return {
            label: "разговор",
            style: {
                background: "#d4edda",
                color: "#155724",
                borderColor: "#c3e6cb",
            } as React.CSSProperties,
        };
    }

    if (s === "held") {
        return {
            label: "удержание",
            style: {
                background: "#d1ecf1",
                color: "#0c5460",
                borderColor: "#bee5eb",
            } as React.CSSProperties,
        };
    }

    if (s.includes("hangup") || s.includes("destroy") || s.includes("down")) {
        return {
            label: "завершён",
            style: {
                background: "#f8d7da",
                color: "#721c24",
                borderColor: "#f5c6cb",
            } as React.CSSProperties,
        };
    }

    return { label: s, style: base };
}

const InterCallBanner: React.FC<Props> = React.memo(
    ({
         interCall,
         canTransfer = false,
         onTransfer,
         onHangup,
         transferLabel = "Соединить",
         transferTitle = "Соединить основной вызов с консультацией",
         hangupLabel = "Сбросить",
         hangupTitle = "Сбросить внутренний звонок",
         style,
         className,
     }) => {
        const {
            consultSession,
            completeAttendedTransfer,
            cancelConsultCall,
        } = useSip();

        const from = String(interCall?.cid_num ?? "—");
        const to = String(interCall?.dest ?? "—");
        const chip = stateChip(interCall?.callstate);
        const uuid = String(interCall?.uuid ?? "");

        const handleTransferClick = async () => {
            try {
                if (consultSession) {
                    console.log("UI CLICK complete attended transfer");
                    onTransfer?.();
                    await completeAttendedTransfer();
                    return;
                }


            } catch (e) {
                console.error("InterCallBanner transfer failed", e);
            }
        };

        const handleHangupClick = async () => {
            try {
                if (consultSession) {
                    console.log("UI CLICK cancel consult");
                    await cancelConsultCall();
                    return;
                }

                onHangup?.(uuid);
            } catch (e) {
                console.error("InterCallBanner hangup failed", e);
            }
        };

        return (
            <div className={className} style={{ ...ui.wrap, ...style }}>
                <div style={ui.left}>
                    <div style={ui.icon} title="Внутренний звонок">
                        <span className="material-icons" style={{ fontSize: 20 }}>
                          swap_calls
                        </span>
                    </div>

                    <div style={{ minWidth: 0 }}>
                        <div style={ui.titleRow}>
                            <span style={ui.num}>{from}</span>
                            <span style={ui.arrow}>→</span>
                            <span style={ui.num}>{to}</span>

                            <span style={{ ...ui.chip, ...chip.style }}>{chip.label}</span>
                        </div>

                        <div style={ui.sub}>Внутренний звонок активен</div>
                    </div>
                </div>

                <div style={ui.actions}>
                    {canTransfer && (
                        <button
                            type="button"
                            className="btn btn-outline-primary"
                            onClick={handleTransferClick}
                            title={transferTitle}
                        >
                            <span className="material-icons" style={ui.btnIcon}>
                                call_merge
                            </span>
                            {transferLabel}
                        </button>
                    )}

                    <button
                        type="button"
                        className="btn btn-outline-danger"
                        onClick={handleHangupClick}
                        title={hangupTitle}
                        disabled={!uuid}
                    >
                        <span className="material-icons" style={ui.btnIcon}>
                            call_end
                        </span>
                        {hangupLabel}
                    </button>
                </div>
            </div>
        );
    }
);

InterCallBanner.displayName = "InterCallBanner";

export default InterCallBanner;
