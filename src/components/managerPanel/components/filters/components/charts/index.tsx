import React, { useMemo } from "react";
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    ResponsiveContainer,
    LabelList,
} from "recharts";

export interface ChartData {
    label: string;
    color: string;
    type: "line" | "bar";
    data: { x: string; y: number }[];
}

interface Props {
    charts: ChartData[];
    showValues?: boolean;
}

type NumLike = number | string;

const toNum = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    return null;
};

const toValNum = (v: unknown): number | null => {
    if (v == null) return null;
    if (Array.isArray(v)) {
        const last = v[v.length - 1];
        const n = Number(last);
        return Number.isFinite(n) ? n : null;
    }
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** ===== Line label renderer (через LabelList) ===== */
type LineLabelProps = {
    x?: NumLike;
    y?: NumLike;
    value?: unknown;
};

const makeLineLabel =
    (seriesIndex: number, showZeros: boolean, color: string) =>
        (p: LineLabelProps): React.ReactNode => {
            const x = toNum(p.x);
            const y = toNum(p.y);
            if (x == null || y == null) return null;

            const v = toValNum(p.value);
            if (v == null) return null;
            if (!showZeros && v === 0) return null;

            const dy = 10 + seriesIndex * 14;

            return (
                <text
                    x={x}
                    y={y - dy}
                    textAnchor="middle"
                    fontSize={12}
                    fill={color}
                    stroke="#fff"          // обводка чтобы читалось на фоне
                    strokeWidth={3}
                    paintOrder="stroke"    // сначала stroke, потом fill
                >
                    {v}
                </text>
            );
        };

/** ===== Bar label renderer ===== */
type BarLabelProps = {
    x?: NumLike;
    y?: NumLike;
    width?: NumLike;
    value?: unknown;
};

const makeBarLabel =
    (seriesIndex: number, showZeros: boolean, color: string) =>
        (p: BarLabelProps): React.ReactNode => {
            const x = toNum(p.x);
            const y = toNum(p.y);
            const w = toNum(p.width);
            if (x == null || y == null || w == null) return null;

            const v = toValNum(p.value);
            if (v == null) return null;
            if (!showZeros && v === 0) return null;

            const dy = 6 + seriesIndex * 14;

            return (
                <text
                    x={x + w / 2}
                    y={y - dy}
                    textAnchor="middle"
                    fontSize={12}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={3}
                    paintOrder="stroke"
                >
                    {v}
                </text>
            );
        };

const ChartContainer: React.FC<Props> = ({ charts, showValues = false }) => {
    const showZeros = false;

    const xLabels = useMemo(() => {
        const base = charts[0]?.data.map((d) => d.x) ?? [];
        const set = new Set(base);
        for (const c of charts) for (const p of c.data) set.add(p.x);
        return Array.from(set);
    }, [charts]);

    const mergedData = useMemo(() => {
        return xLabels.map((x) => {
            const row: Record<string, unknown> = { x };
            for (const c of charts) {
                const found = c.data.find((p) => p.x === x);
                row[c.label] = found?.y ?? 0;
            }
            return row;
        });
    }, [xLabels, charts]);

    const topMargin = showValues ? 58 : 28;

    return (
        <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
                data={mergedData}
                margin={{ top: topMargin, right: 16, left: 8, bottom: 8 }}
            >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                    dataKey="x"
                    angle={-35}
                    textAnchor="end"
                    height={60}
                    interval="preserveStartEnd"
                    minTickGap={18}
                />
                <YAxis />
                <Tooltip />

                {/* 1) Сначала рисуем сами графики */}
                {charts.map((chart) =>
                    chart.type === "line" ? (
                        <Line
                            key={chart.label}
                            type="monotone"
                            dataKey={chart.label}
                            stroke={chart.color}
                            dot={false}
                            activeDot={{ r: 4 }}
                            isAnimationActive={false}
                        />
                    ) : (
                        <Bar
                            key={chart.label}
                            dataKey={chart.label}
                            fill={chart.color}
                            barSize={20}
                            isAnimationActive={false}
                        />
                    )
                )}

                {/* 2) Потом рисуем подписи ПОСЛЕДНИМИ — они будут поверх всего */}
                {showValues &&
                    charts.map((chart, seriesIndex) =>
                        chart.type === "line" ? (
                            <Line
                                key={`${chart.label}__labels`}
                                type="monotone"
                                dataKey={chart.label}
                                stroke="transparent"
                                dot={false}
                                activeDot={false}
                                legendType="none"
                                isAnimationActive={false}
                            >
                                <LabelList
                                    dataKey={chart.label}
                                    content={makeLineLabel(seriesIndex, showZeros, chart.color)}
                                />
                            </Line>
                        ) : (
                            <Bar
                                key={`${chart.label}__labels`}
                                dataKey={chart.label}
                                fill="transparent"
                                barSize={20}
                                legendType="none"
                                isAnimationActive={false}
                            >
                                <LabelList
                                    dataKey={chart.label}
                                    content={makeBarLabel(seriesIndex, showZeros, chart.color)}
                                />
                            </Bar>
                        )
                    )}
            </ComposedChart>
        </ResponsiveContainer>
    );
};

export default ChartContainer;
