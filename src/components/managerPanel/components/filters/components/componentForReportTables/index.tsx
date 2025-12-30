import React, {FC, useEffect, useRef, useState} from "react";
import SearchableSelect from "../../../../../callControlPanel/components/select";
import ChartContainer from "../charts";
import {ChartConfig, MyChartData} from "../../index";
import {ChartDataTable} from "../table";


export const intervalOptions = [
    {id: "minute", name: "минута"},
    {id: "hour", name: "час"},
    {id: "day", name: "день"},
]

export const dataOptions = [
    {id: "accepted", name: "Принято вызовов"},
    {id: "arrived", name: "Поступило вызовов"},
    {id: "lost", name: "Пропущено вызовов"},
    {id: "lost_rate", name: "Процент пропущенных"},
    {id: "wait", name: "ASA (Ожидание на линии)"},
    {id: "talk", name: "AHT (Среднее время разговора)"},
    {id: "service_levels", name: "SL (Разбивка по сервисным уровням)"},
    {id: "operator_speed", name: "Скорость работы операторов"},
]

export const modifyOptions = [
    {id: "average", name: "среднее" },
    {id: "sum", name: "сумма" },
    {id: "none", name: "без преобразования" }
]

export const lineOptions = [
    {id: "Линия", name: "Линия"},
    {id: "Гистограмма", name: "Гистограмма"},
]

type Props = {
    table: boolean;
    setTable: (table: boolean) => void;
    interval: string;
    setinterval: (interval: string) => void;
    data: string;
    setData: (data: string) => void;
    line: string;
    setLine: (line: string) => void;
    modify: string;
    setModify: (modify: string) => void;
    color: string;
    setColor: (color: string) => void;
    getInfo: () => void;
    charts: MyChartData[];
    setCharts: (charts: MyChartData[]) => void;
    chartConfigs: ChartConfig[];
    setChartConfig: (chartConfigs: ChartConfig[]) => void;
};

export const ComponentForReportTables: FC<Props> = ({
                                                        table,
                                                        setTable,
                                                        interval,
                                                        setinterval,
                                                        data,
                                                        setData,
                                                        line,
                                                        setLine,
                                                        modify,
                                                        setModify,
                                                        color,
                                                        setColor,
                                                        getInfo,
                                                        charts,
                                                        setCharts,
                                                        chartConfigs,
                                                        setChartConfig,
                                                    }) => {
    const timeoutRef = useRef<number | null>(null);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current);
        }
        timeoutRef.current = window.setTimeout(() => {
            setColor(newColor);
        }, 200);
    };

    const renderButtons = () => (
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            <button
                className="btn btn-outline-success"
                style={table ? { backgroundColor: "#0BB918", color: "white" } : {}}
                onClick={() => setTable(true)}
            >
                Таблица
            </button>
            <button
                className="btn btn-outline-success"
                style={!table ? { backgroundColor: "#0BB918", color: "white" } : {}}
                onClick={() => setTable(false)}
            >
                График
            </button>
        </div>
    );

    const renderChartLegend = () => (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {charts.map((chart, index) => (
                <div
                    key={chart.label + index}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        border: "1px solid #ccc",
                        borderRadius: 4,
                        padding: "4px 8px",
                        backgroundColor: "#f9f9f9",
                    }}
                >
                    <div
                        style={{
                            width: 12,
                            height: 12,
                            backgroundColor: chart.color,
                            marginRight: 6,
                            borderRadius: 2,
                        }}
                    />
                    <span style={{ marginRight: 6 }}>{chart.label}</span>
                    <button
                        className="btn btn-sm btn-outline-danger"
                        style={{ padding: "2px 6px", fontSize: 12 }}
                        onClick={() => {
                            const updatedCharts = charts.filter((_, i) => i !== index);
                            const updatedConfigs = chartConfigs.filter((_, i) => i !== index);
                            setCharts(updatedCharts);
                            setChartConfig(updatedConfigs);
                        }}

                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {renderButtons()}

            <div style={{ width: 200 }}>
                <SearchableSelect
                    value={interval}
                    onChange={setinterval}
                    options={intervalOptions}
                    isSearchable={false}
                />
            </div>

            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <SearchableSelect
                        value={data}
                        onChange={setData}
                        options={dataOptions}
                        isSearchable={false}
                    />
                </div>

                {data && (
                    <div style={{ display: "flex", flexDirection: "row", gap: 8, flex: 3 }}>
                        <div style={{ flex: 1 }}>
                            <SearchableSelect
                                value={line}
                                onChange={setLine}
                                options={lineOptions}
                                isSearchable={false}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <SearchableSelect
                                value={modify}
                                onChange={setModify}
                                options={modifyOptions}
                                isSearchable={false}
                            />
                        </div>
                        <input
                            type="color"
                            value={color}
                            className="form-control"
                            onChange={handleChange}
                            style={{ flex: "0 0 150px" }}
                        />
                        <button
                            className="btn btn-outline-light text text-dark"
                            style={{ whiteSpace: "nowrap" }}
                            onClick={getInfo}
                        >
                            Добавить
                        </button>
                    </div>
                )}
            </div>

            {!table && charts.length > 0 && (
                <>
                    {renderChartLegend()}
                    <div style={{ width: "100%", height: 400 }}>
                        <ChartContainer charts={charts} />
                    </div>
                </>
            )}
            {table && charts.length > 0 && (
                <ChartDataTable charts={charts} />
            )}
        </div>
    );
};
