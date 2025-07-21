import React from "react";

interface Props {
    value?: string;
    onChange: (val: string) => void;
}

export const PhoneField: React.FC<Props> = ({ value = "", onChange }) => {
    return (
        <input
            type="text"
            className="form-control"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Номер телефона"
        />
    );
};
