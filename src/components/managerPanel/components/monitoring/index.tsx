import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useSelector } from "react-redux";
import { store } from "../../../../redux/store";
import { makeSelectFullProjectPool } from "../../../../redux/operatorSlice";
import { FiltersBar } from "./components/FiltersBar";
import { ActiveDialogsTable, Row } from "./components/ActiveDialogsTable";
import { UsersResponse, UserInfo } from "./types";
import Swal from "sweetalert2";
import { socket } from "../../../../socket";

/** сериализация массивов без []: projects=a&projects=b */
const serializeRepeat = (params: Record<string, any>) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (Array.isArray(v)) v.forEach((item) => usp.append(k, String(item)));
        else if (v != null) usp.append(k, String(v));
    });
    return usp.toString();
};

/** как отображать имя проекта */
const pickProjectName = (p: any, idFallback: string) =>
    String(
        p?.glagol_name ??
        p?.header ??
        p?.display_name ??
        p?.name ??
        p?.title ??
        p?.description ??
        p?.project_name ??
        idFallback
    );

/** канонический id: предпочитаем slug (project_name), иначе числовой id */
const pickCanonicalId = (p: any) =>
    String(p?.project_name ?? p?.project ?? p?.id ?? "").trim();

type ProjectOption = { id: string; name: string };

/** Справочник проектов: canonical + alias */
function useProjectDirectory(glagolParent: string, sipLogin: string) {
    const projectPool = useSelector(
        useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin])
    );

    /** любой ключ (slug, numeric id) -> имя */
    const [projectMap, setProjectMap] = useState<Record<string, string>>({});
    /** только канонический id (slug/id) -> имя (для селекта, без дублей) */
    const [canonicalMap, setCanonicalMap] = useState<Record<string, string>>({});

    const mergeProjects = (arr: any[]) => {
        if (!arr?.length) return;
        const nextAny: Record<string, string> = {};
        const nextCanon: Record<string, string> = {};

        arr.forEach((p) => {
            const canon = pickCanonicalId(p);
            if (!canon) return;
            const name = pickProjectName(p, canon);

            nextCanon[canon] = name; // в селект
            nextAny[canon] = name; // основной ключ

            // алиас: числовой id тоже должен работать при поиске имени
            const numeric = p?.id != null ? String(p.id) : "";
            if (numeric && numeric !== canon) {
                nextAny[numeric] = name;
            }
        });

        setProjectMap((prev) => ({ ...prev, ...nextAny }));
        setCanonicalMap((prev) => ({ ...prev, ...nextCanon }));
    };

    // 1) заполняем из Redux
    useEffect(() => {
        mergeProjects(projectPool || []);
    }, [projectPool]);

    // 2) догружаем с бэка
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const resp = await axios.get("/api/v1/projects", {
                    params: { glagol_parent: glagolParent },
                });
                const arr: any[] =
                    resp.data?.projects ??
                    resp.data?.result ??
                    (Array.isArray(resp.data) ? resp.data : []);
                if (!cancelled) mergeProjects(arr);
            } catch {
                /* no-op */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [glagolParent]);

    const projectOptions: ProjectOption[] = useMemo(
        () =>
            Object.entries(canonicalMap)
                .map(([id, name]) => ({ id, name }))
                .sort((a, b) => a.name.localeCompare(b.name)),
        [canonicalMap]
    );

    return { projectMap, canonicalMap, projectOptions };
}

export const MonitoringTab: React.FC = () => {
    // креды
    const {
        sipLogin = "",
        glagolParent = "",
        worker = "",
        sessionKey = "",
    } = (store.getState() as any).credentials || {};

    // справочник
    const { projectMap, canonicalMap, projectOptions } = useProjectDirectory(
        glagolParent,
        sipLogin
    );

    // фильтры
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [userQuery, setUserQuery] = useState("");

    // по умолчанию — все (канонические) проекты
    useEffect(() => {
        if (!selectedProjects.length && projectOptions.length) {
            setSelectedProjects(projectOptions.map((o) => o.id));
        }
    }, [projectOptions]); // eslint-disable-line react-hooks/exhaustive-deps

    // состояние
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [users, setUsers] = useState<Record<string, UserInfo>>({});

    // пер-кнопочная блокировка (uuid -> pending)
    const [pending, setPending] = useState<Record<string, boolean>>({});

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
                    projects: selectedProjects, // канонические id
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

    // первичная загрузка + при смене фильтра
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

    // набор выбранных имён (для фильтрации по имени, а не по id)
    const selectedNames = useMemo(() => {
        const set = new Set<string>();
        selectedProjects.forEach((id) => {
            set.add(canonicalMap[id] ?? projectMap[id] ?? id);
        });
        return set;
    }, [selectedProjects, canonicalMap, projectMap]);

    // опции отделов
    const departmentOptions = useMemo(() => {
        const set = new Set<string>();
        Object.values(users || {}).forEach((u) => {
            const dep = (u?.department || "") as string;
            if (dep && dep.trim()) set.add(dep.trim());
        });
        return Array.from(set).sort((a, b) => a.localeCompare(b));
    }, [users]);

    // строки таблицы
    const rows: Row[] = useMemo(() => {
        const q = userQuery.trim().toLowerCase();
        const out: Row[] = [];

        Object.entries(users).forEach(([login, u]) => {
            const talk: any = u?.talk || {};
            const phone = talk?.phone;
            const projectId = talk?.project != null ? String(talk.project) : "";
            if (!phone) return;

            // имя проекта (по любому ключу)
            const projectName: string = (projectMap[projectId] ?? projectId) || "—";

            // фильтр по проектам: сравниваем по имени
            if (selectedNames.size && projectName !== "—" && !selectedNames.has(projectName)) {
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
                project: projectName,
                operator: login,
                name: u?.name || undefined,
                department: dep,
                phone: String(phone),
                duration: talk?.duration,
                uuid: talk?.uuid ?? null,     // добавлено
                b_uuid: talk?.b_uuid ?? null, // добавлено
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
    }, [users, selectedDepts, userQuery, projectMap, selectedNames]);

    // ---- ДЕЙСТВИЯ ПО ЗВОНКУ ----

    const markPending = (uuid: string, v: boolean) =>
        setPending((p) => ({ ...p, [uuid]: v }));

    /** hold_toggle по uuid (или b_uuid), без sip_login */
    const handleHold = (uuid: string) => {
        if (!uuid || !worker || !sessionKey) return;
        markPending(uuid, true);
        socket.emit("sofia_operations", {
            worker,
            session_key: sessionKey,
            uuid,
            action: "hold_toggle",
        });
        // снимем блокировку через короткую паузу; UI всё равно обновится поллингом
        setTimeout(() => markPending(uuid, false), 800);
    };

    /** uuid_break по uuid (или b_uuid), требует sip_login и idle_set:true */
    const handleHangup = (uuid: string) => {
        if (!uuid || !worker || !sessionKey || !sipLogin) return;

        (async () => {
            const res = await Swal.fire({
                title: "Сбросить звонок?",
                text: "Действие прервёт текущий разговор.",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Сбросить",
                cancelButtonText: "Отмена",
                reverseButtons: true,
                focusCancel: true,
            });

            if (!res.isConfirmed) return;

            markPending(uuid, true);
            socket.emit("sofia_operations", {
                worker,
                sip_login: sipLogin,
                session_key: sessionKey,
                uuid,
                action: "uuid_break",
                idle_set: true,
            });

            // UI разморозим чуть позже; состояние всё равно подтянется поллингом
            setTimeout(() => markPending(uuid, false), 800);
        })();
    };

    return (
        <div className="d-flex flex-column gap-3">
            <FiltersBar
                projectOptions={projectOptions}
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

            <ActiveDialogsTable
                loading={loading}
                rows={rows}
                onHold={(uuid) => handleHold(uuid)}
                onHangup={(uuid) => handleHangup(uuid)}
                pending={pending}
            />
        </div>
    );
};
