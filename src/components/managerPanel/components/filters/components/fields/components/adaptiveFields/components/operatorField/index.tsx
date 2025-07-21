import React, { useEffect, useState } from "react";
import axios from "axios";
import MultiSelect from "../../../../../../../../../callControlPanel/components/multiselect";
import { store } from "../../../../../../../../../../redux/store";

interface Agent {
    id: number;
    login: string;       // это и есть SIP
    name: string;
    is_deleted: boolean;
}

interface Props {
    value: string[];
    onChange: (val: string[]) => void;
}

export const OperatorField: React.FC<Props> = ({ value, onChange }) => {
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => console.log("agents: ", agents),[agents])
    useEffect(() => {
        const fetchAgents = async () => {
            setIsLoading(true);
            try {
                const res = await axios.get("/api/v1/agents", {
                    params: {
                        glagol_parent: "fs.at.akc24.ru"
                    }
                });
                setAgents(res.data.result || []);
            } catch (err) {
                console.error("Ошибка загрузки агентов:", err);
                setAgents([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAgents();
    }, []);

    const operatorOptions = agents
        .map(agent => ({
            id: agent.login,
            name: `${agent.name} (${agent.login})`
        }));

    return (
        <div style={{ width: 400 }}>
            <MultiSelect
                options={operatorOptions}
                value={value}
                onChange={onChange}
                placeholder={isLoading ? "Загрузка..." : "Выберите операторов..."}
            />
        </div>
    );
};
