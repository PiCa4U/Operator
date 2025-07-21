import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import SearchableSelect from "../../../../../../../../../callControlPanel/components/select";
import MultiSelect from "../../../../../../../../../callControlPanel/components/multiselect";
import { makeSelectFullProjectPool } from "../../../../../../../../../../redux/operatorSlice";
import { useSelector } from "react-redux";
import { store } from "../../../../../../../../../../redux/store";

interface Props {
    value: {
        projectId?: string;
        reasons?: number[];  // ids
        results?: number[];
    };
    onChange: (val: Props["value"]) => void;
}

interface ReasonOrResult {
    id: number;
    name: string;
}

export const ProjectField: React.FC<Props> = ({ value, onChange }) => {
    const { sipLogin = '' } = store.getState().credentials;

    const selectFullProjectPool = useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]);
    const projectPool = useSelector(selectFullProjectPool) || [];

    const availableProjects = projectPool.map(proj => ({
        id: proj.project_name,
        name: proj.glagol_name,
    }));

    const selectedProjectId = value?.projectId || "";

    const [reasons, setReasons] = useState<ReasonOrResult[]>([]);
    const [results, setResults] = useState<ReasonOrResult[]>([]);

    // 🔄 Получение call_reasons и call_results при выборе проекта
    useEffect(() => {
        const fetchProjectSettings = async () => {
            if (!selectedProjectId) return;
            try {
                const res = await axios.get("/api/v1/project_settings", {
                    params: {
                        glagol_parent: "fs.at.akc24.ru",
                        project_name: selectedProjectId,
                        settings_types: ["call_reasons", "call_results"]
                    }
                });
                setReasons(res.data.call_reasons || []);
                setResults(res.data.call_results || []);
            } catch (err) {
                console.error("Ошибка загрузки project_settings:", err);
                setReasons([]);
                setResults([]);
            }
        };

        fetchProjectSettings();
    }, [selectedProjectId, sipLogin]);

    const handleProjectChange = (selected: string) => {
        onChange({
            projectId: selected,
            reasons: [],
            results: [],
        });
    };

    const handleReasonsChange = (selectedIds: string[]) => {
        onChange({
            ...value,
            reasons: selectedIds.map(id => Number(id)),
        });
    };

    const handleResultsChange = (selectedIds: string[]) => {
        onChange({
            ...value,
            results: selectedIds.map(id => Number(id)),
        });
    };

    const projectOptions = availableProjects.map(p => ({
        id: p.id,
        name: p.name,
    }));

    const reasonOptions = reasons.map(r => ({
        id: r.id,
        name: r.name,
    }));

    const resultOptions = results.map(r => ({
        id: r.id,
        name: r.name,
    }));

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
            <SearchableSelect
                value={projectOptions.find(p => p.id === selectedProjectId)?.id || ""}
                onChange={handleProjectChange}
                options={projectOptions}
                placeholder="Проект"
            />
            {selectedProjectId && (
                <div style={{ display: "flex", gap: 8,flex: 1 }}>
                    <MultiSelect
                        options={reasonOptions}
                        value={value?.reasons?.map(String) || []}
                        onChange={handleReasonsChange}
                        placeholder="Причины"
                    />
                    <MultiSelect
                        options={resultOptions}
                        value={value?.results?.map(String) || []}
                        onChange={handleResultsChange}
                        placeholder="Результаты"
                    />
                </div>
            )}
        </div>
    );
};
