import React from "react";
import MultiSelect from "../../../../callControlPanel/components/multiselect";

type ProjectOption = { id: string; name: string };

type Props = {
    projectOptions: ProjectOption[];       // <-- вместо allProjects:string[]
    selectedProjects: string[];            // значения = id
    onChangeProjects: (v: string[]) => void;

    departmentOptions: string[];
    selectedDepts: string[];
    onChangeDepts: (v: string[]) => void;

    userQuery: string;
    onChangeUserQuery: (v: string) => void;

    onRefresh: () => void;
    loading?: boolean;
};

export const FiltersBar: React.FC<Props> = ({
                                                projectOptions,
                                                selectedProjects,
                                                onChangeProjects,
                                                departmentOptions,
                                                selectedDepts,
                                                onChangeDepts,
                                                userQuery,
                                                onChangeUserQuery,
                                                onRefresh,
                                                loading,
                                            }) => {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns:
                    "minmax(300px, 1fr) minmax(240px, 1fr) minmax(240px, 1fr) auto",
                gap: 12,
                alignItems: "end",
            }}
        >
            {/* Проекты */}
            <div>
                <label className="form-label mb-1">Проекты</label>
                <MultiSelect
                    placeholder="Выберите проекты"
                    options={projectOptions}       // показываем имена, значения — id
                    value={selectedProjects}
                    onChange={onChangeProjects}
                />
            </div>

            {/* Отделы */}
            <div>
                <label className="form-label mb-1">Отделы</label>
                <MultiSelect
                    placeholder="Все отделы"
                    options={departmentOptions.map((d) => ({ id: d, name: d }))}
                    value={selectedDepts}
                    onChange={onChangeDepts}
                />
            </div>

            {/* Поиск по пользователю */}
            <div>
                <label className="form-label mb-1">Поиск по пользователю</label>
                <input
                    className="form-control"
                    placeholder="Логин или имя"
                    value={userQuery}
                    onChange={(e) => onChangeUserQuery(e.currentTarget.value)}
                />
            </div>

            {/* Обновить */}
            <div className="d-flex gap-2">
                <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onRefresh}
                    disabled={loading}
                >
                    {loading ? "Загружаю..." : "Обновить"}
                </button>
            </div>
        </div>
    );
};

export default FiltersBar;
