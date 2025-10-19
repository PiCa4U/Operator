import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { store } from "../../../../redux/store";
import { makeSelectFullProjectPool } from "../../../../redux/operatorSlice";
import { FiltersBar } from "./components/FiltersBar";
import { ActiveDialogsTable, Row } from "./components/ActiveDialogsTable";
import { UsersResponse, UserInfo } from "./types";

/** сериализация массивов без []: projects=a&projects=b */
const serializeRepeat = (params: Record<string, any>) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
        else if (v != null) usp.append(k, String(v));
    });
    return usp.toString();
};

export const MonitoringTab: React.FC = () => {
    // проекты оператора (по текущему sipLogin)
    const { sipLogin = "", glagolParent = "" } =
    (store.getState() as any).credentials || {};
    const projectPool = useSelector(
        useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin])
    );
    const allProjects = projectPool.map((p: any) => p.project_name);

    // фильтры
    const [selectedProjects, setSelectedProjects] = useState<string[]>(
        () => allProjects
    );
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [userQuery, setUserQuery] = useState("");

    // состояние
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [users, setUsers] = useState<Record<string, UserInfo>>({});

    // загрузка данных
    const fetchData = async (showSpinner = false) => {
        if (!selectedProjects?.length) {
            setUsers({});
            return;
        }
        if (showSpinner) setLoading(true);
        setError(null);
        try {
            const resp = await axios.get<UsersResponse>("/api/v1/users", {
                params: {
                    glagol_parent: glagolParent,
                    projects: selectedProjects,
                },
                paramsSerializer: serializeRepeat,
            });
            setUsers(resp.data?.users || {});
        } catch (e: any) {
            setError(e?.message || "Ошибка загрузки");
        } finally {
            if (showSpinner) setLoading(false);
        }
    };

    // первичная загрузка
    useEffect(() => {
        fetchData(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjects.join("|"), glagolParent]);

    // автообновление каждые 3 сек
    const pollId = useRef<number | null>(null);
    useEffect(() => {
        pollId.current && clearInterval(pollId.current);
        pollId.current = window.setInterval(() => fetchData(false), 3000);
        return () => {
            if (pollId.current) clearInterval(pollId.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProjects.join("|"), glagolParent]);

    // опции отделов
    const departmentOptions = useMemo(() => {
        const set = new Set<string>();
        Object.values(users || {}).forEach((u) => {
            const dep = (u?.department || "") as string;
            if (dep && dep.trim()) set.add(dep.trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [users]);

    // строки таблицы: только у кого есть talk.phone, с фильтрами
    const rows: Row[] = useMemo(() => {
        const q = userQuery.trim().toLowerCase();
        const out: Row[] = [];

        Object.entries(users).forEach(([login, u]) => {
            const talk: any = u?.talk || {};
            const phone = talk?.phone;
            const project = talk?.project;
            if (!phone) return;

            // фильтр по проектам
            if (
                project &&
                selectedProjects.length &&
                !selectedProjects.includes(String(project))
            ) {
                return;
            }

            // фильтр по отделам
            const dep = (u?.department || null) as string | null;
            if (selectedDepts.length) {
                if (!dep || !selectedDepts.includes(dep)) return;
            }

            // поиск по пользователю (логин/имя)
            const name = u?.name || "";
            const loginLC = login.toLowerCase();
            const nameLC = String(name).toLowerCase();
            if (q && !(loginLC.includes(q) || nameLC.includes(q))) return;

            out.push({
                project: String(project || "—"),
                operator: login,
                name: u?.name || undefined,
                department: dep,
                phone: String(phone),
                duration: talk?.duration,
            });
        });

        // сортировка: проект → отдел → логин
        out.sort(
            (a, b) =>
                a.project.localeCompare(b.project) ||
                String(a.department || "").localeCompare(String(b.department || "")) ||
                a.operator.localeCompare(b.operator)
        );
        return out;
    }, [users, selectedProjects, selectedDepts, userQuery]);

    return (
        <div className="d-flex flex-column gap-3">
            <FiltersBar
                allProjects={allProjects}
                selectedProjects={selectedProjects}
                onChangeProjects={setSelectedProjects}
                departmentOptions={departmentOptions}
                selectedDepts={selectedDepts}
                onChangeDepts={setSelectedDepts}
                userQuery={userQuery}
                onChangeUserQuery={setUserQuery}
                onRefresh={() => fetchData(true)}
                loading={loading}
            />

            {error && <div className="alert alert-danger">{error}</div>}

            <ActiveDialogsTable loading={loading} rows={rows} />
        </div>
    );
};
