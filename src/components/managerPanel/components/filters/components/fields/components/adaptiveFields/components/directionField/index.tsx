import React from "react";
import SearchableSelect from "../../../../../../../../../callControlPanel/components/select";

interface Props {
    value?: string;
    onChange: (val: string) => void;
}

const DIRECTION_OPTIONS = [
    { id: "all", name: "Все" },
    { id: "inbound", name: "Входящие" },
    { id: "outbound", name: "Исходящие" },
    { id: "transfer", name: "Переводы" },
];

export const DirectionField: React.FC<Props> = ({ value, onChange }) => {
    return (
        <div style={{ width: 300 }}>
            <SearchableSelect
                value={value || ""}
                onChange={onChange}
                options={DIRECTION_OPTIONS}
                placeholder="Выберите направление"
                isSearchable={false}
            />
        </div>
    );
};
