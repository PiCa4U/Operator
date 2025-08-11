import { useEffect, useState } from "react";
import axios from "axios";

interface Operator {
    id: number;
    name: string;
    login: string;
    status: string;
}

const OperatorsManagment = () => {
    const [operators, setOperators] = useState<Operator[]>([]);

    const getOperators = async () => {
        try {
            const resp = await axios.get("/api/v1/users", {
                params: {glagol_parent: "fs.at.akc24.ru"}
            });
            console.log("operators: ", resp.data);
            setOperators(resp.data.users);
        } catch (error) {
            console.error("Ошибка получения операторов", error);
        }
    };

    useEffect(() => {
        // useEffect сам по себе не может быть async
        (async () => {
            await getOperators();
        })();
    }, []);

    return (
        <div>
            <h3>Мониторинг операторов</h3>
            <ul>
                {operators.map((op) => (
                    <li key={op.id}>
                        {op.name}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default OperatorsManagment;
