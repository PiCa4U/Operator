// src/components/managerPanel/tabs/monitoring/components/ActiveDialogsTable.tsx
import React from "react";
import { VideoTile } from "../../../../../screenShare/VideoTile";

export type Row = {
    project: string;
    operator: string; // логин
    name?: string;
    department?: string | null;
    phone?: string;
    duration?: string;
    uuid?: string | null;
    b_uuid?: string | null;
    direction?: string | null; // inbound / outbound / ...
};

export type ConnectionType = "listen_only" | "whisper" | "takeover" | "barge";

type JoinUiState = {
    type: ConnectionType;
    managerUuid?: string;
};

type Props = {
    loading?: boolean;
    rows: Row[];
    onHold?: (uuid: string) => void;
    onHangup?: (uuid: string) => void;
    pending?: Record<string, boolean>;
    /** ▶️ новый колбэк – подключение к экрану оператора */
    onScreenShare?: (operatorLogin: string) => void;
    /** ▶️ новый колбэк – подключение менеджера к звонку */
    onJoinCall?: (row: Row, type: ConnectionType) => void;
    /** состояние "созвона" по uuid исходного звонка */
    joinStatesByTargetUuid?: Record<string, JoinUiState>;

    /** ▶️ кто сейчас активен для шаринга */
    activeScreenOperator?: string | null;
    /** ▶️ состояние viewer-а */
    screenShareStatus?: "idle" | "connecting" | "connected";
    screenShareError?: string | null;
    screenShareStreams?: MediaStream[];
    onStopScreenShare?: () => void;
};

/** эврика по uuid – дублируем логику из MonitoringTab */
const resolveJoinUuidFromRow = (
    row: Row,
    type: ConnectionType
): string | null => {
    const dir = (row.direction || "").toLowerCase();
    const uuid = row.uuid ?? null;
    const bUuid = row.b_uuid ?? null;

    const isTakeover = type === "takeover";

    if (!isTakeover) {
        if (dir === "outbound") return uuid ?? bUuid;
        if (dir === "inbound") return bUuid ?? uuid;
        return bUuid ?? uuid;
    }

    // takeover — наоборот
    if (dir === "outbound") return bUuid ?? uuid;
    if (dir === "inbound") return uuid ?? bUuid;
    return uuid ?? bUuid;
};

export const ActiveDialogsTable: React.FC<Props> = ({
                                                        loading,
                                                        rows,
                                                        onHold,
                                                        onHangup,
                                                        pending,
                                                        onScreenShare,
                                                        onJoinCall,
                                                        joinStatesByTargetUuid,
                                                        activeScreenOperator,
                                                        screenShareStatus,
                                                        screenShareError,
                                                        screenShareStreams,
                                                        onStopScreenShare,
                                                    }) => {
    const hasRows = rows?.length > 0;
    const hasScreenVideo =
        !!screenShareStreams && screenShareStreams.length > 0;

    return (
        <section>
            <div className="d-flex align-items-center justify-content-between mb-2">
                <h5 className="mb-0">Активные диалоги</h5>
                <span className="badge bg-secondary">{rows.length}</span>
            </div>

            <div className="table-responsive">
                <table className="table table-sm table-striped align-middle">
                    <thead className="table-light">
                    <tr>
                        <th style={{ minWidth: 160 }}>Проект</th>
                        <th style={{ minWidth: 120 }}>Оператор</th>
                        <th style={{ minWidth: 160 }}>Имя</th>
                        <th style={{ minWidth: 140 }}>Отдел</th>
                        <th style={{ minWidth: 140 }}>Номер</th>
                        <th style={{ minWidth: 120 }}>Длительность</th>
                        <th style={{ minWidth: 420 }}>Действия</th>
                    </tr>
                    </thead>
                    <tbody>
                    {!loading && !hasRows && (
                        <tr>
                            <td colSpan={7} className="text-muted">
                                Активных диалогов нет.
                            </td>
                        </tr>
                    )}

                    {rows.map((r, i) => {
                        const currentUuid = r.uuid || r.b_uuid || null;
                        const isBusy = currentUuid
                            ? !!pending?.[currentUuid]
                            : false;

                        // uuid для каждого типа (логика совпадает с MonitoringTab)
                        const joinUuidByType: Record<ConnectionType, string | null> = {
                            listen_only: resolveJoinUuidFromRow(r, "listen_only"),
                            whisper:     resolveJoinUuidFromRow(r, "whisper"),
                            takeover:    resolveJoinUuidFromRow(r, "takeover"),
                            barge:       resolveJoinUuidFromRow(r, "barge"),
                        };

                        // состояние join-а для каждого типа
                        const joinStateByType: Partial<Record<ConnectionType, JoinUiState>> = {};
                        (["listen_only", "whisper", "takeover", "barge"] as ConnectionType[]).forEach((t) => {
                            const ju = joinUuidByType[t];
                            if (ju && joinStatesByTargetUuid) {
                                joinStateByType[t] = joinStatesByTargetUuid[ju];
                            }
                        });

                        // по этому звонку уже есть какой-то join (любого типа)
                        const anyJoinActive = (["listen_only", "whisper", "takeover", "barge"] as ConnectionType[])
                            .some((t) => !!joinStateByType[t]);

                        const isScreenActiveHere =
                            activeScreenOperator === r.operator;

                        // const screenBtnDisabled: boolean =
                        //     !r.operator ||
                        //     !onScreenShare ||
                        //     (!!activeScreenOperator && !isScreenActiveHere);

                        // хелпер для кнопки "созвона"
                        const mkJoinBtnProps = (type: ConnectionType) => {
                            const joinState = joinStateByType[type];
                            const isThisTypeActive = joinState?.type === type;

                            const baseClass =
                                "btn btn-sm " +
                                (isThisTypeActive
                                    ? "btn-danger"
                                    : "btn-outline-success");

                            const disabled =
                                !currentUuid ||
                                isBusy ||
                                !onJoinCall ||
                                (anyJoinActive && !isThisTypeActive);

                            const commonOnClick = () =>
                                onJoinCall && onJoinCall(r, type);

                            return {
                                isThisTypeActive,
                                className: baseClass,
                                disabled,
                                onClick: commonOnClick,
                            };
                        };

                        const listenBtn = mkJoinBtnProps("listen_only");
                        const whisperBtn = mkJoinBtnProps("whisper");
                        const takeoverBtn = mkJoinBtnProps("takeover");
                        const bargeBtn = mkJoinBtnProps("barge");

                        const screenBtnDisabled: boolean =
                            !r.operator ||
                            !onScreenShare ||
                            (!!activeScreenOperator && !isScreenActiveHere);

                        return (
                            <React.Fragment
                                key={`${r.project}-${r.operator}-${r.phone}-${r.uuid}-${i}`}
                            >
                                <tr>
                                    <td>{r.project}</td>
                                    <td className="text-monospace">
                                        {r.operator}
                                    </td>
                                    <td>{r.name || "—"}</td>
                                    <td>{r.department || "—"}</td>
                                    <td className="text-monospace">
                                        {r.phone || "—"}
                                    </td>
                                    <td>{r.duration || "—"}</td>
                                    <td>
                                        <div
                                            className="btn-group"
                                            role="group"
                                            aria-label="call-actions"
                                        >
                                            {/* варианты подключения менеджера к разговору */}
                                            {onJoinCall && (
                                                <>
                                                    {/* Слушать / Закончить прослушивание */}
                                                    <button
                                                        type="button"
                                                        className={
                                                            listenBtn.className
                                                        }
                                                        disabled={
                                                            listenBtn.disabled
                                                        }
                                                        onClick={
                                                            listenBtn.onClick
                                                        }
                                                        title={
                                                            listenBtn.isThisTypeActive
                                                                ? "Закончить прослушивание"
                                                                : "Подслушивать (listen_only)"
                                                        }
                                                    >
                                                        {listenBtn.isThisTypeActive
                                                            ? "Закончить прослушивание"
                                                            : "Слушать"}
                                                    </button>

                                                    {/* Шёпот / Закончить шёпот */}
                                                    <button
                                                        type="button"
                                                        className={
                                                            whisperBtn.className
                                                        }
                                                        disabled={
                                                            whisperBtn.disabled
                                                        }
                                                        onClick={
                                                            whisperBtn.onClick
                                                        }
                                                        title={
                                                            whisperBtn.isThisTypeActive
                                                                ? "Закончить шёпот"
                                                                : "Шёпот к оператору (whisper)"
                                                        }
                                                    >
                                                        {whisperBtn.isThisTypeActive
                                                            ? "Закончить шёпот"
                                                            : "Шёпот"}
                                                    </button>

                                                    {/* Перехват / Закончить перехват */}
                                                    <button
                                                        type="button"
                                                        className={
                                                            takeoverBtn.className
                                                        }
                                                        disabled={
                                                            takeoverBtn.disabled
                                                        }
                                                        onClick={
                                                            takeoverBtn.onClick
                                                        }
                                                        title={
                                                            takeoverBtn.isThisTypeActive
                                                                ? "Закончить перехват"
                                                                : "Перехват разговора (takeover)"
                                                        }
                                                    >
                                                        {takeoverBtn.isThisTypeActive
                                                            ? "Закончить перехват"
                                                            : "Перехват"}
                                                    </button>

                                                    {/* Конф. / Закончить конфу */}
                                                    <button
                                                        type="button"
                                                        className={
                                                            bargeBtn.className
                                                        }
                                                        disabled={
                                                            bargeBtn.disabled
                                                        }
                                                        onClick={
                                                            bargeBtn.onClick
                                                        }
                                                        title={
                                                            bargeBtn.isThisTypeActive
                                                                ? "Закончить конференцию"
                                                                : "Конференция с оператором и клиентом (barge)"
                                                        }
                                                    >
                                                        {bargeBtn.isThisTypeActive
                                                            ? "Закончить конф."
                                                            : "Конф."}
                                                    </button>
                                                </>
                                            )}

                                            {/* удержание */}
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-warning"
                                                disabled={
                                                    !currentUuid ||
                                                    isBusy ||
                                                    !onHold
                                                }
                                                onClick={() =>
                                                    currentUuid &&
                                                    onHold?.(currentUuid)
                                                }
                                                title="Поставить/снять с удержания"
                                            >
                                                {isBusy ? (
                                                    <span
                                                        className="spinner-border spinner-border-sm"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    "Удержание"
                                                )}
                                            </button>

                                            {/* сброс */}
                                            <button
                                                type="button"
                                                className="btn btn-sm btn-outline-danger"
                                                disabled={
                                                    !currentUuid ||
                                                    isBusy ||
                                                    !onHangup
                                                }
                                                onClick={() =>
                                                    currentUuid &&
                                                    onHangup?.(currentUuid)
                                                }
                                                title="Сбросить звонок"
                                            >
                                                {isBusy ? (
                                                    <span
                                                        className="spinner-border spinner-border-sm"
                                                        aria-hidden="true"
                                                    />
                                                ) : (
                                                    "Сброс"
                                                )}
                                            </button>

                                            {/* экран оператора */}
                                            {onScreenShare && (
                                                <button
                                                    type="button"
                                                    className={
                                                        isScreenActiveHere
                                                            ? "btn btn-sm btn-danger"
                                                            : "btn btn-sm btn-outline-primary"
                                                    }
                                                    disabled={
                                                        screenBtnDisabled
                                                    }
                                                    onClick={() =>
                                                        onScreenShare(
                                                            r.operator
                                                        )
                                                    }
                                                    title={
                                                        isScreenActiveHere
                                                            ? "Отключить просмотр экрана"
                                                            : "Подключиться к экрану оператора"
                                                    }
                                                >
                                                    {isScreenActiveHere
                                                        ? "Закрыть экран"
                                                        : "Экран"}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>

                                {/* Инлайновая панель просмотра экрана под активной строкой */}
                                {isScreenActiveHere && (
                                    <tr className="table-active">
                                        <td colSpan={7}>
                                            <div className="p-2 border-top">
                                                <div className="d-flex justify-content-between align-items-center mb-2">
                                                    <div className="fw-semibold small">
                                                        Экран оператора{" "}
                                                        <span className="text-monospace">
                                                                {r.operator}
                                                            </span>
                                                    </div>
                                                    {onStopScreenShare && (
                                                        <button
                                                            type="button"
                                                            className="btn btn-sm btn-outline-danger"
                                                            onClick={
                                                                onStopScreenShare
                                                            }
                                                        >
                                                            Отключиться
                                                        </button>
                                                    )}
                                                </div>

                                                {screenShareError && (
                                                    <div className="text-danger small mb-2">
                                                        {screenShareError}
                                                    </div>
                                                )}

                                                {!screenShareError &&
                                                    screenShareStatus ===
                                                    "connecting" && (
                                                        <div className="text-muted small mb-2">
                                                            Подключение к
                                                            экрану…
                                                        </div>
                                                    )}

                                                {hasScreenVideo && (
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns:
                                                                "repeat(auto-fit, minmax(260px, 1fr))",
                                                            gap: 8,
                                                        }}
                                                    >
                                                        {screenShareStreams!.map(
                                                            (
                                                                s,
                                                                idx
                                                            ) => (
                                                                <VideoTile
                                                                    key={
                                                                        idx
                                                                    }
                                                                    stream={
                                                                        s
                                                                    }
                                                                />
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default ActiveDialogsTable;
