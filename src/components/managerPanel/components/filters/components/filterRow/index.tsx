import { FILTER_FIELDS } from "../fields";
import SearchableSelect from "../../../../../callControlPanel/components/select";
import {AdaptiveFields} from "../fields/components/adaptiveFields";

export type FilterItem =
    | { fieldId: "project"; id: string; value: { projectId: string; reasons?: number[]; results?: number[] } | null }
    | { fieldId: "operator"; id: string; value: string[] | null }
    | { fieldId: "date"; id: string; value: { preset: string; start?: Date; end?: Date } | null }
    | { fieldId: "comment"; id: string; value: string | null }
    | { fieldId: "phoneNumber"; id: string; value: string | null }
    | { fieldId: "dialogDuration"; id: string; value: { comparison: "gt" | "lt"; seconds: number } | null };

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
            <button className="btn btn-outline-danger" onClick={onRemove}>✕</button>
            <div style={{minWidth: 350}}>
                <SearchableSelect
                    value={selectedOption?.id || ""}
                    onChange={handleTypeChange}
                    options={fieldOptions}
                />
            </div>
            <AdaptiveFields id={filter.fieldId} value={filter.value} onChange={handleValueChange} />
        </div>
    );
};
