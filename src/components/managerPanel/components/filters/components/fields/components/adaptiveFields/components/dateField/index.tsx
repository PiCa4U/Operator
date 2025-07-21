import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

interface Props {
    value?: {
        preset: string;
        start?: Date | null;
        end?: Date | null;
    };
    onChange: (val: Props["value"]) => void;
}

const PRESETS = [
    { label: "Сегодня", value: "today" },
    { label: "Вчера", value: "yesterday" },
    { label: "Эта неделя", value: "this_week" },
    { label: "Прошлая неделя", value: "last_week" },
    { label: "Этот месяц", value: "this_month" },
    { label: "Прошлый месяц", value: "last_month" },
    { label: "Задать промежуток", value: "custom" },
];

export const DateField: React.FC<Props> = ({ value, onChange }) => {
    const selectedPreset = value?.preset || "today";

    const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const preset = e.target.value;
        if (preset !== "custom") {
            onChange({ preset });
        } else {
            const today = new Date();
            onChange({ preset: "custom", start: today, end: today });
        }
    };

    const handleRangeChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        onChange({
            preset: value?.preset ?? "custom",
            start,
            end,
        });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 400 }}>
            <select
                className="form-control"
                value={selectedPreset}
                onChange={handlePresetChange}
            >
                <option value="">Выберите дату</option>
                {PRESETS.map((p) => (
                    <option key={p.value} value={p.value}>
                        {p.label}
                    </option>
                ))}
            </select>

            {selectedPreset === "custom" && (
                <DatePicker
                    selected={value?.start || new Date()}
                    onChange={handleRangeChange}
                    startDate={value?.start || null}
                    endDate={value?.end || null}
                    selectsRange
                    className="form-control"
                    placeholderText="Выберите период"
                    dateFormat="dd.MM.yyyy"
                />
            )}
        </div>
    );
};
