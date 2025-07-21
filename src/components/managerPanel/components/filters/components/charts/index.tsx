import React from 'react';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Legend,
    ResponsiveContainer,
} from 'recharts';

export interface ChartData {
    label: string;
    color: string;
    type: 'line' | 'bar';
    data: { x: string; y: number }[];
}

const labelMap: Record<string, string> = {
    accepted: "Принято вызовов",
    arrived: "Поступило вызовов",
    lost: "Пропущено вызовов",
    lost_rate: "Процент пропущенных",
    wait: "ASA (Ожидание на линии)",
    talk: "AHT (Среднее время разговора)",
    service_levels: "SL (Разбивка по сервисным уровням)",
    operator_speed: "Скорость работы операторов",
};

const modifyMap: Record<string, string> = {
    sum: " (сумма)",
    average: " (среднее)",
    none: "",
};


interface Props {
    charts: ChartData[];
}

const ChartContainer: React.FC<Props> = ({ charts }) => {
    // Соберём все ключи по X
    const xLabels = charts[0]?.data.map(d => d.x) || [];

    // Построим объединённый массив по x
    const mergedData = xLabels.map(label => {
        const point: any = { x: label };
        charts.forEach(chart => {
            const found = chart.data.find(d => d.x === label);
            point[chart.label] = found?.y || 0;
        });
        return point;
    });

    return (
        <ResponsiveContainer width="100%" height={400}>
            <LineChart data={mergedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="x" />
                <YAxis />
                <Tooltip />
                {/*<Legend />*/}
                {charts.map(chart =>
                    chart.type === 'line' ? (
                        <Line
                            key={chart.label}
                            type="monotone"
                            dataKey={chart.label}
                            stroke={chart.color}
                            dot={false}
                        />
                    ) : (
                        <Bar
                            key={chart.label}
                            dataKey={chart.label}
                            fill={chart.color}
                            barSize={20}
                        />
                    )
                )}
            </LineChart>
        </ResponsiveContainer>
    );
};

export default ChartContainer;
