import React from "react";
import "react-datepicker/dist/react-datepicker.css";
import {
    CommentField,
    DateField,
    DirectionField,
    DurationField,
    OperatorField,
    PhoneField,
    ProjectField
} from "./components";

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
            return <OperatorField value={value} onChange={onChange}/>

        case "date":
            return <DateField value={value} onChange={onChange}/>

        case "comment":
            return <CommentField value={value} onChange={onChange}/>;

        case "phoneNumber":
            return <PhoneField value={value} onChange={onChange}/>

        case "dialogDuration":
            return <DurationField value={value} onChange={onChange}/>

        case "callDirection":
            return <DirectionField value={value} onChange={onChange}/>;

        default:
            return null;
    }
};
