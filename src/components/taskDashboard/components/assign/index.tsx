import SearchableSelect from "../../../callControlPanel/components/select";
import React, {FC, useEffect, useMemo, useState} from "react";
import {useSelector} from "react-redux";
import {RootState, store} from "../../../../redux/store";
import {ActionOption, ApiRow} from "../../index";


interface Props {
    row?: any
    rows?: any
    opt: any
    processRows: (rows: ApiRow[], opt: ActionOption, operator?: string, allCount?: number, count?: number) => void
}
export const AssignComp:FC<Props> = ({
                                         rows,
                                         row,
                                         opt,
                                         processRows
                                     }) => {
    const { monitorUsers } = useSelector(
        (state: RootState) => state.operator.monitorData
    );

    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;

    console.log("row: ", row)
    const parsedRows: { id_list: number[] }[] = rows instanceof Set
        ? Array.from(rows).map((rowStr: string) => ({
            id_list: rowStr.split(',').map(id => Number(id))
        }))
        : [];
    if (rows) {
        console.log("parsedRows: ", parsedRows)

    }

    const operatorOptions = useMemo(() => {
        const entries = Object.entries(monitorUsers || {})
            .filter(([_, data]) => data.post_obrabotka === true);

        // Разделяем текущего оператора и остальных
        const currentOperatorEntry = entries.find(([login]) => login === sipLogin);
        const otherEntries = entries.filter(([login]) => login !== sipLogin);

        const currentOption = currentOperatorEntry
            ? {
                id: currentOperatorEntry[0],
                name: `${currentOperatorEntry[1].name}` || currentOperatorEntry[0]
            }
            : null;

        const otherOptions = otherEntries.map(([login, data]) => ({
            id: login,
            name: `${data.name}` || login
        }));

        return currentOption ? [currentOption, ...otherOptions] : otherOptions;
    }, [monitorUsers, sipLogin]);

    const [operValue, setOperValue] = useState<string>("")

    return(
        <div

            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1,
                borderColor: "#e6e6e6",
                borderStyle: "solid",
                padding: "0.7rem 0.7rem",
                borderRadius: "0.75rem",
                // backgroundColor: "#e6e6e6"
            }}

        >
            <SearchableSelect
                value={operValue}
                onChange={setOperValue}
                options={operatorOptions}
                placeholder="Оператор..."
                augmentSaved={false}
            />
            <button
                className="btn btn-outline-light text-dark"
                onClick={() => {
                    if (row) {
                        processRows([row], opt, operValue)
                    } else if (parsedRows.length) {
                        parsedRows.forEach((list, i) => {
                            processRows([list as ApiRow], opt, operValue, parsedRows.length, i + 1);
                        });
                    }
                }}
            >
                Назначить
            </button>
        </div>
    )
}
