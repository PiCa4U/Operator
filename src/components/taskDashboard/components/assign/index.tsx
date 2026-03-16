import SearchableSelect from "../../../callControlPanel/components/select";
import React, { FC, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { RootState } from "../../../../redux/store";
import { ActionOption, ApiRow } from "../../index";
import Swal from "sweetalert2";

export const CLEAR_ASSIGNEE_TOKEN = "__CLEAR_ASSIGNEE__";
const CLEAR_ASSIGNEE_LABEL = "Снять ответственного";

interface Props {
    row?: ApiRow;
    rows?: Set<string>;
    opt: ActionOption;
    processRows: (
        rows: ApiRow[],
        opt: ActionOption,
        operator?: string,
        allCount?: number,
        count?: number
    ) => void;
}

export const AssignComp: FC<Props> = ({
                                          rows,
                                          row,
                                          opt,
                                          processRows,
                                      }) => {
    const { monitorUsers } = useSelector(
        (state: RootState) => state.operator.monitorData
    );

    const { sipLogin = "" } = useSelector((state: RootState) => state.credentials);

    const parsedRows: ApiRow[] = rows instanceof Set
        ? Array.from(rows).map((rowStr: string) => ({
            id_list: rowStr.split(",").map((id) => Number(id)),
        }))
        : [];

    const operatorOptions = useMemo(() => {
        const entries = Object.entries(monitorUsers || {})
            .filter(([_, data]) => data.post_obrabotka === true);

        const currentOperatorEntry = entries.find(([login]) => login === sipLogin);
        const otherEntries = entries.filter(([login]) => login !== sipLogin);

        const currentOption = currentOperatorEntry
            ? {
                id: currentOperatorEntry[0],
                name: `${currentOperatorEntry[1].name}` || currentOperatorEntry[0],
            }
            : null;

        const otherOptions = otherEntries.map(([login, data]) => ({
            id: login,
            name: `${data.name}` || login,
        }));

        const baseOptions = currentOption
            ? [currentOption, ...otherOptions]
            : otherOptions;

        return [
            { id: CLEAR_ASSIGNEE_TOKEN, name: CLEAR_ASSIGNEE_LABEL },
            ...baseOptions,
        ];
    }, [monitorUsers, sipLogin]);

    const [operValue, setOperValue] = useState<string>("");

    const isClearMode = operValue === CLEAR_ASSIGNEE_TOKEN;

    const handleSubmit = () => {
        if (!operValue) {
            Swal.fire({
                icon: "warning",
                title: "Не выбран ответственный",
                text: "Выберите оператора или пункт «Снять ответственного».",
            });
            return;
        }

        if (row) {
            processRows([row], opt, operValue);
            return;
        }

        if (parsedRows.length) {
            parsedRows.forEach((list, i) => {
                processRows([list], opt, operValue, parsedRows.length, i + 1);
            });
            return;
        }

        Swal.fire({
            icon: "warning",
            title: "Не выбрано ни одной строки",
            text: "Пожалуйста, выберите хотя бы одну строку для назначения.",
        });
    };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                borderWidth: 1,
                borderColor: "#e6e6e6",
                borderStyle: "solid",
                padding: "0.7rem 0.7rem",
                borderRadius: "0.75rem",
            }}
        >
            <div style={{ maxWidth: 250, width: "100%" }}>
                <SearchableSelect
                    value={operValue}
                    onChange={setOperValue}
                    options={operatorOptions}
                    placeholder="Ответственный..."
                    augmentSaved={false}
                />
            </div>

            <button
                className="btn btn-outline-light text-dark"
                onClick={handleSubmit}
            >
                {isClearMode ? "Снять" : "Назначить"}
            </button>
        </div>
    );
};