import { FILTER_FIELDS } from "../fields";
import SearchableSelect from "../../../../../callControlPanel/components/select";
import {AdaptiveFields} from "../fields/components/adaptiveFields";

export interface FilterItem {
    id: string;
    fieldId: string;
    value: null;
}

export const FilterRow: React.FC<{
    filter: FilterItem;
    onUpdate: (f: FilterItem) => void;
    onRemove: () => void;
}> = ({ filter, onUpdate, onRemove }) => {
    const handleTypeChange = (selected: any) => {
        onUpdate({ ...filter, fieldId: selected, value: null });
    };

    const handleValueChange = (val: any) => {
        onUpdate({ ...filter, value: val });
    };

    const fieldOptions = FILTER_FIELDS.map(f => ({
        name: f.name,
        id: f.id,
    }));

    const selectedOption = fieldOptions.find(o => o.id === filter.fieldId);

    return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <SearchableSelect
                value={selectedOption?.id || ""}
                onChange={handleTypeChange}
                options={fieldOptions}
            />
            <AdaptiveFields id={filter.fieldId} value={filter.value} onChange={handleValueChange} />
            <button className="btn btn-outline-danger" onClick={onRemove}>✕</button>
        </div>
    );
};
