import React from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {ProjectField} from "./components";

interface Props {
    id: string;
    value: any;
    onChange: (val: any) => void;
}

export const AdaptiveFields: React.FC<Props> = ({ id, value, onChange }) => {
    switch (id) {
        case "project":
            return <ProjectField value={value} onChange={onChange}/>

        case "operator":
            return (
                <button className="btn btn-outline-success">
                    Выберите пользователей 0
                </button>
            );

        case "date":
            return (
                <DatePicker
                    selected={value}
                    onChange={(date) => onChange(date)}
                    placeholderText="Выберите дату"
                    className="form-control"
                />
            );

        case "comment":
            return (
                <input
                    type="text"
                    className="form-control"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Комментарий"
                />
            );

        case "phoneNumber":
            return (
                <input
                    type="text"
                    className="form-control"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Номер телефона"
                />
            );

        case "dialogDuration":
            return (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                        className="form-control"
                        value={value?.comparison || "gt"}
                        onChange={(e) => onChange({ ...value, comparison: e.target.value })}
                    >
                        <option value="gt">Больше</option>
                        <option value="lt">Меньше</option>
                    </select>
                    <input
                        type="number"
                        className="form-control"
                        value={value?.seconds || 0}
                        onChange={(e) => onChange({ ...value, seconds: Number(e.target.value) })}
                    /> секунд
                </div>
            );

        case "callDirection":
            return (
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <select
                        className="form-control"
                        value={value || "in"}
                        onChange={(e) => onChange(e.target.value)}
                    >
                        <option value="in">Входящие</option>
                        <option value="out">Исходящие</option>
                    </select>
                    <button className="btn btn-outline-success">Выберите отметки 0</button>
                </div>
            );

        default:
            return null;
    }
};
