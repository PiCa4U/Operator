import { useEffect, useState } from "react";
import axios from "axios";
import {FilterFields} from "./components/fields";

export const Filters = () => {
    const [filters, setFilters] = useState<any[]>([]);

    useEffect(() => {
        async function fetchFilters() {
            try {
                const response = await axios.get("/api/v1/communications/filters");
                console.log("data:", response.data.filters);
                setFilters(response.data.filters);
            } catch (err) {
                console.error(err);
            }
        }
        fetchFilters();

    }, []);

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 16}}>
            <div style={{display: "flex", flexDirection: "row", gap: 8}}>
                <button className="btn btn-outline-info">
                    Новый фильтр
                </button>
                {filters.map(f => (
                    <button key={f.id} className="btn btn-outline-info">
                        {f.name}
                    </button>
                ))}
            </div>
            <FilterFields/>
        </div>
    );
};
