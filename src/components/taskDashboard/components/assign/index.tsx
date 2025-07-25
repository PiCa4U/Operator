import SearchableSelect from "../../../callControlPanel/components/select";
import React, {FC, useEffect, useState} from "react";
import {useSelector} from "react-redux";
import {RootState} from "../../../../redux/store";
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
    console.log("row: ", row)
    const parsedRows: { id_list: number[] }[] = rows instanceof Set
        ? Array.from(rows).map((rowStr: string) => ({
            id_list: rowStr.split(',').map(id => Number(id))
        }))
        : [];
    if (rows) {
        console.log("parsedRows: ", parsedRows)

    }
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
                options={Object.entries(monitorUsers)
                    .filter(([_, u]) => u.type === "operator")
                    .map(([_, u]) => ({
                        id: u.login,
                        name: u.name || u.login
                    }))
                }
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
