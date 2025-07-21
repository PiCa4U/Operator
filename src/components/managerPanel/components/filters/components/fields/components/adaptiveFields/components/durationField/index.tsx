import React from "react";
import SearchableSelect from "../../../../../../../../../callControlPanel/components/select";

interface Props {
    value?: {
        comparison: "gt" | "lt";
        seconds: number;
    };
    onChange: (val: Props["value"]) => void;
}

const comparisonOptions = [
    { id: "gt", name: "Больше" },
    { id: "lt", name: "Меньше" },
];

export const DurationField: React.FC<Props> = ({ value, onChange }) => {
    const currentComparison = value?.comparison ?? "gt";
    const currentSeconds = value?.seconds ?? 0;

    const handleComparisonChange = (val: string) => {
        onChange({
            comparison: val as "gt" | "lt",
            seconds: currentSeconds,
        });
    };

    const handleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange({
            comparison: currentComparison,
            seconds: Number(e.target.value),
        });
    };

    return (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <div style={{ minWidth: 160 }}>
                <SearchableSelect
                    value={currentComparison}
                    onChange={handleComparisonChange}
                    options={comparisonOptions}
                    placeholder="Сравнение"
                    isSearchable={false}
                />
            </div>
            <div style={{ width: 80 }}>
                <input
                    type="number"
                    className="form-control"
                    value={currentSeconds}
                    onChange={handleSecondsChange}
                    min={0}
                    step={1}
                />
            </div>

            <span>секунд</span>
        </div>
    );
};
