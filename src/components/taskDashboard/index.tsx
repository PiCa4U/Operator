import React, {useState, useEffect, useMemo, useRef} from 'react';
import Select, { SingleValue } from 'react-select';
import SearchableSelect from '../callControlPanel/components/select/index';
import styles from "./components/checkbox.module.css"
import { makeSelectFullProjectPool } from "../../redux/operatorSlice";
import {useDispatch, useSelector} from "react-redux";
import GroupActionModal from "./components/index";
import { useItsmNavigation } from "../../utils/useItsmNavigation";

import Swal from "sweetalert2";
import {socket} from "../../socket";
import {RootState, store} from "../../redux/store";
import {ExpressState} from "../callControlPanel";
import axios from "axios";
import DatePicker from "react-datepicker";
import { format } from 'date-fns';
import {AssignComp} from "./components/assign";

// --- Типы данных ---
interface ColumnCell {
    name: string;
    value: any[];
}
export interface ApiRow {
    id_list: number[];
    [columnKey: string]: ColumnCell | number[];
}
interface Action {
    action_name: string;
    action_type: string;
    code_filename: string;
}
export interface Preset {
    id: number;
    preset_name: string;
    group_table: string;
    structure: Record<string, { name: string; default: string; render_template: string }>;
    actions: Action[];
    group_by: string[];
    projects: string[];
}
export interface OptionType {
    value: number;
    label: string;
    preset: Preset;
}
// Опции для селекта действий
export interface ActionOption {
    value: string;
    label: string;
    action: Action;
}

export interface ModuleType {
    id:            number;
    project:       string;
    filename:      string;
    common_code:   boolean;
    created_dt:    string;
    [key: string]: any;
}

type Props = {
    openedGroup: any[]
    setOpenedGroup: (openedGroup: any[]) => void
    phonesData: any
    setPhonesData: (phonesData: any) => void
    setGroupIDs: (groupIDs: any[]) => void
    selectedPreset: OptionType | null
    setSelectedPreset: (selectedPreset: OptionType | null) => void
    role: string
    currentPage: number
    setCurrentPage: (currentPage: number) => void
    startDate: Date | null
    setStartDate: (startDate: Date | null) => void
    endDate: Date | null
    setEndDate: (endDate: Date| null) => void
    selectedStatus: string | null
    setSelectedStatus: (selectedStatus: string | null) => void
}
const ROWS_PER_PAGE = 10;

const PresetSelectorTable: React.FC<Props> = ({
                                                  openedGroup,
                                                  setOpenedGroup,
                                                  setPhonesData,
                                                  phonesData,
                                                  setGroupIDs,
                                                  selectedPreset,
                                                  setSelectedPreset,
                                                  role,
                                                  currentPage,
                                                  setCurrentPage,
                                                  startDate,
                                                  setStartDate,
                                                  endDate,
                                                  setEndDate,
                                                  selectedStatus,
                                                  setSelectedStatus
                                              }) => {

    const { monitorUsers } = useSelector(
        (state: RootState) => state.operator.monitorData
    );
    const {
        sipLogin   = '',
        worker     = '',
    } = store.getState().credentials;
    const dispatch = useDispatch();
    const { goToItsm, openItsmNewTab } = useItsmNavigation();

    const [presets, setPresets] = useState<OptionType[]>([]);
    const [selectedActionOption, setSelectedActionOption] = useState<ActionOption | null>(null);
    const [tableData, setTableData] = useState<ApiRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [idProjectMap, setIdProjectMap] = useState<{ id: number; project_name: string }[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc'|'desc' }|null>(null);
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    const [selectedOperator, setSelectedOperator] = useState<string | null>(null);

    const [flatPhones, setFlatPhones] = useState<any[]>([])
    const [expressStates, setExpressStates] = useState<Record<string, ExpressState>>({});
    const [expressConfig, setExpressConfig] = useState<Record<string, any>>({});
    console.log("presets: ", presets)
    const operatorOptions = useMemo(() => {
        const entries = Object.entries(monitorUsers || {})
            .filter(([_, data]) => data.post_obrabotka === true);

        // Разделяем текущего оператора и остальных
        const currentOperatorEntry = entries.find(([login]) => login === sipLogin);
        const otherEntries = entries.filter(([login]) => login !== sipLogin);

        const currentOption = currentOperatorEntry
            ? {
                id: currentOperatorEntry[0],
                name: `${currentOperatorEntry[1].name} (${currentOperatorEntry[1].login})` || currentOperatorEntry[0]
            }
            : null;

        const otherOptions = otherEntries.map(([login, data]) => ({
            id: login,
            name: `${data.name} (${data.login})` || login
        }));

        return currentOption ? [currentOption, ...otherOptions] : otherOptions;
    }, [monitorUsers, sipLogin]);

    const [modulesInFlight, setModulesInFlight] = useState(0);
    const modulesCompletedRef = useRef(0);
    const moduleStartTableRef = useRef(false)

    const [modalOpen, setModalOpen] = useState(false);
    const [modalIds, setModalIds] = useState<number[]>([]);
    const [modalAction, setModalAction] = useState<Action | null>(null);

    const [statusOptions, setStatusOptions] = useState<string[]>([])
    const [modules, setModules] = useState<ModuleType[]>([]);


    useEffect(() => {
        if (!selectedPreset || !selectedPreset.preset?.id) return;

        const freshPreset = presets.find(p => p.preset.id === selectedPreset.preset.id);

        if (!freshPreset) {
            // Пресета больше нет в списке — удалить
            localStorage.removeItem('tasksSelectedPreset');
            return;
        }

        const isDifferent = JSON.stringify(freshPreset) !== JSON.stringify(selectedPreset);

        if (isDifferent) {
            // Если пресет обновился в списке — заменить
            setSelectedPreset(freshPreset);
            localStorage.setItem('tasksSelectedPreset', JSON.stringify(freshPreset));
        } else {
            // Если тот же, но обновился selectedPreset — записать в localStorage
            localStorage.setItem('tasksSelectedPreset', JSON.stringify(selectedPreset));
        }
    }, [selectedPreset, presets]);



    const glagolParent = "fs.at.glagol.ai";

    const defaultStatusToState = useRef<boolean>(false)

    const projectPool = useSelector(useMemo(() => makeSelectFullProjectPool(sipLogin), [sipLogin]));
    const projectNames = useMemo(() => projectPool.map(p => p.project_name), [projectPool]);

    const { sessionKey } = store.getState().operator
    useEffect(() => {
        const list = tableData.map( group => group.id_list )
        setGroupIDs(list)
    },[tableData])

    useEffect(() => {
        defaultStatusToState.current = false
    },[selectedPreset])
    useEffect(() => {
        const handler = (payload: Record<string, ModuleType[]>) => {
            // Собираем модули в flat-массив
            const allModules = Object.values(payload).flat();

            // Уникализируем по filename (можно по id, если гарантированно одинаков)
            const uniqueMap = new Map<string, ModuleType>();
            allModules.forEach(mod => {
                if (!uniqueMap.has(mod.filename)) {
                    uniqueMap.set(mod.filename, mod);
                }
            });

            setModules(Array.from(uniqueMap.values()));
        };

        socket.on('get_modules', handler);

        if (projectNames.length) {
            socket.emit('get_modules', {
                projects: projectNames,
                session_key: sessionKey,
                worker,
            });
        }

        return () => {
            socket.off('get_modules', handler);
        };
    }, [projectNames, sessionKey, worker]);

    console.log("projectNames: ", projectNames)
    useEffect(()=> console.log("selectedRows: ", selectedRows))

    useEffect(() => {
        if (selectedPreset) {
            const projects = selectedPreset.preset.projects;

            Promise
                .allSettled(
                    projects.map(projectName =>
                        axios
                            .get<any>('/api/v1/express_configs', {
                                params: {
                                    glagol_parent: 'fs.at.akc24.ru',
                                    project_name: projectName
                                },
                                headers: { Accept: 'application/json' }
                            })
                            .then(response => ({
                                projectName,
                                config: response.data
                            }))
                    )
                )
                .then(results => {
                    const configMap: Record<string, any> = {};
                    results.forEach(result => {
                        if (result.status === 'fulfilled') {
                            configMap[result.value.projectName] = result.value.config;
                        } else {
                            console.warn('Failed to load config for project:', result.reason);
                        }
                    });
                    setExpressConfig(configMap);
                    console.log('expressConfig:', configMap);
                });
        }
    }, [role, selectedPreset]);

    // 1) загрузка пресетов
    useEffect(() => {
        if (!role || projectNames.length === 0) return;

        (async () => {
            const response = await axios.post<Preset[]>('/api/v1/get_preset_list', {
                glagol_parent: glagolParent,
                worker,
                projects: projectNames,
                role
            });
            const data: Preset[] = response.data;
            const presetOptions = data.map(p => ({ value: p.id, label: p.preset_name, preset: p }));
            setPresets(presetOptions);

            // --- Синхронизация с localStorage ---
            const savedRaw = localStorage.getItem('tasksSelectedPreset');
            if (savedRaw) {
                try {
                    const saved = JSON.parse(savedRaw) as OptionType;
                    const matched = presetOptions.find(p => p.preset.id === saved.preset.id);

                    if (matched) {
                        const oldStructure = JSON.stringify(saved.preset.structure);
                        const newStructure = JSON.stringify(matched.preset.structure);

                        if (oldStructure !== newStructure) {
                            console.warn("Структура пресета обновилась — обновляем selectedPreset");
                            setSelectedPreset(matched);
                            localStorage.setItem('tasksSelectedPreset', JSON.stringify(matched));
                        } else {
                            setSelectedPreset(saved);
                        }
                    } else {
                        // Не найден — обнуляем
                        setSelectedPreset(null);
                        localStorage.removeItem('tasksSelectedPreset');
                    }
                } catch (err) {
                    console.error("Ошибка разбора сохраненного пресета", err);
                    localStorage.removeItem('tasksSelectedPreset');
                }
            }
        })();
    }, [glagolParent, worker, role, projectNames]);


    function formatWithTimezone(date: Date, timePart: 'start' | 'end'): string {
        const offsetMinutes = date.getTimezoneOffset();
        const sign = offsetMinutes > 0 ? '-' : '+';
        const absOffset = Math.abs(offsetMinutes);
        const hours = String(Math.floor(absOffset / 60)).padStart(2, '0');
        const minutes = String(absOffset % 60).padStart(2, '0');
        const tz = `${sign}${hours}:${minutes}`;

        const base = format(date, 'yyyy-MM-dd');
        const time = timePart === 'start' ? 'T00:00:00' : 'T23:59:59';

        return `${base}${time}${tz}`;
    }

    useEffect(() => {
        // 1. Смотрим, что в LS
        const saved = localStorage.getItem('selectedStatus');
        if (saved === null) {
            // если ничего нет — ничего не делаем, дальше
            return;
        }

        console.log("statusOptions: ", statusOptions)
        if (statusOptions.length && !statusOptions.includes(saved)) {
            setSelectedStatus(null);
        } else {
            setSelectedStatus(saved);
        }
    }, [statusOptions]);

    const loadGroupedPhones = async () => {
        if (!selectedPreset) {
            setTableData([]);
            setSelectedActionOption(null);
            return;
        }

        const { preset } = selectedPreset;

        const filterBy: any = {
            project: ['IN', preset.projects],
        };

        const filterByForSelect: any = {
            project: ['IN', preset.projects],
        };

        if (startDate && endDate) {
            const from = formatWithTimezone(startDate, 'start');
            const to = formatWithTimezone(endDate, 'end');
            filterBy.created_dt = ['BETWEEN', [from, to]];
            filterByForSelect.created_dt = ['BETWEEN', [from, to]];
        }

        if (selectedStatus) {
            filterBy.status = ['IN', [selectedStatus]];
        }
        if (selectedOperator) {
            filterBy.manager = ['IN', [selectedOperator]];
            filterByForSelect.manager = ['IN', [selectedOperator]];
        }

        setLoading(true);
        try {
            const response1 = await axios.post<ApiRow[]>('/api/v1/get_grouped_phones', {
                glagol_parent: glagolParent,
                group_table: preset.group_table,
                filter_by: filterBy,
                preset_id: preset.id,
                role
            });

            const response2 = await axios.post<Record<string, {
                status: any; id: number
            }[]>>('/api/v1/get_grouped_phones', {
                glagol_parent: glagolParent,
                group_by: ['project'],
                group_table: preset.group_table,
                filter_by: filterBy,
                role
            });

            const response3 = await axios.post<Record<string, {
                status: any; id: number
            }[]>>('/api/v1/get_grouped_phones', {
                glagol_parent: glagolParent,
                group_by: ['project'],
                group_table: preset.group_table,
                filter_by: filterByForSelect,
                role
            });

            const statusOptions = Object.values(response3.data).flat().map(phone => phone.status);
            const uniqueStatusOptions = statusOptions.filter((s, i, arr) => arr.indexOf(s) === i);
            setStatusOptions(uniqueStatusOptions);

            const projectIdData = response2.data;
            const flatPhones = Object.values(projectIdData).flat();
            setPhonesData(flatPhones);

            const flat = Object.entries(projectIdData).flatMap(([project_name, list]) =>
                list.map(item => ({ id: item.id, project_name }))
            );
            setFlatPhones(flatPhones)
            console.log("flatPhones: ", flatPhones)

            setIdProjectMap(flat);

            setTableData(response1.data);
            setSelectedActionOption(null);
            if (response1.data.length < 11) {
                setCurrentPage(1);
            }
            setSearchTerm('');
            setSortConfig(null);
            setSelectedRows(new Set());
        } catch (error) {
            console.error("Ошибка загрузки данных:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGroupedPhones();
    }, [
        selectedPreset,
        startDate,
        endDate,
        selectedStatus,
        selectedOperator
    ]);

    // Опции для выпадающего списка действий в шапке
    const actionOptions: ActionOption[] = useMemo(() => {
        if (!selectedPreset) return [];
        return selectedPreset.preset.actions.map(act => ({
            value: act.action_name,
            label: act.action_name,
            action: act
        }));
    }, [selectedPreset]);
    const isReloadingRef = useRef(false);

    const triggerGroupedPhonesReload = () => {
        if (isReloadingRef.current) return;

        isReloadingRef.current = true;
        loadGroupedPhones();

        setTimeout(() => {
            isReloadingRef.current = false;
        }, 2000);
    };

    useEffect(() => {
        if (modalOpen || modulesInFlight === 0 || !moduleStartTableRef.current) return
        const handleComplete = () => {
            modulesCompletedRef.current += 1;
            // console.log("modulesCompletedRef.current: ", modulesCompletedRef.current)
            if (modulesCompletedRef.current >= modulesInFlight) {

                Swal.fire("Готово", "Все модули завершены", "success");
                moduleStartTableRef.current = false
                modulesCompletedRef.current = 0
                loadGroupedPhones();

            }
        };

        const onRunModuleSuccess = (data: any) => {
            console.log("✅ run_module_success:", data);
            handleComplete();
        };

        const onRunModuleError = (data: any) => {
            console.warn("❌ run_module_error:", data);
            handleComplete();
        };

        socket.on("run_module", onRunModuleSuccess);
        socket.on("error", onRunModuleError);

        return () => {
            socket.off("run_module", onRunModuleSuccess);
            socket.off("error", onRunModuleError);
        };
    }, [modulesInFlight]);

    useEffect(() => console.log("actionOptions: ", actionOptions),[actionOptions])
    // Внутри PresetSelectorTable:
    const processRows = (rows: ApiRow[], opt: ActionOption, operator?: string, allCount?: number, count?: number) => {
        const act = opt.action;

        // Собираем все ID и группируем по проектам
        const allIds = rows.flatMap(r => r.id_list);
        const idToProject = idProjectMap.reduce<Record<number,string>>((acc, {id, project_name}) => {
            acc[id] = project_name;
            return acc;
        }, {});
        const groups = allIds.reduce<Record<string, number[]>>((acc, id) => {
            const proj = idToProject[id] || "unknown";
            if (!acc[proj]) acc[proj] = [];
            acc[proj].push(id);
            return acc;
        }, {});

        if (act.action_type === 'code') {
            const targetName = act.code_filename.replace(/\.py$/, '');
            const foundModule = modules.find(m => m.filename.replace(/\.py$/, '') === targetName);
            if (!foundModule) {
                return Swal.fire('Ошибка', `Модуль "${act.code_filename}" не найден.`, 'error');
            }

            type KwargDef = { source: string; default?: string };
            const argDefs = Object.values(foundModule.kwargs || {}) as KwargDef[];
            let pendingCount = 0;
            // groups: Record<project_name, number[]>
            Object.entries(groups).forEach(([project_name, ids]) => {
                const idToContact = ids.map(id => {
                    const contact = phonesData.find((p: any) => p.id === id);
                    return { id, contactInfo: contact?.contact_info ?? {} };
                });

                const groupedByContactInfo = new Map<string, { ids: number[]; kwargs: Record<string, string> }>();

                idToContact.forEach(({ id, contactInfo }) => {
                    // Фильтруем только нужные поля и подставляем default
                    const kwargs: Record<string, string> = {};
                    argDefs.forEach(({ source, default: def }) => {
                        if (!source) return;
                        const value = contactInfo[source];
                        kwargs[source] = (value !== undefined && value !== null && value !== '') ? value : (def ?? '');
                    });

                    const hashKey = JSON.stringify(kwargs);
                    if (!groupedByContactInfo.has(hashKey)) {
                        groupedByContactInfo.set(hashKey, { ids: [], kwargs });
                    }
                    groupedByContactInfo.get(hashKey)!.ids.push(id);
                });


                groupedByContactInfo.forEach(({ ids: groupedIds, kwargs }) => {
                    pendingCount += 1;
                    socket.emit('run_module', {
                        uuid: "",
                        b_uuid: "",
                        worker,
                        session_key: sessionKey,
                        projects: { [project_name]: kwargs },
                        filename: targetName,
                        common_code: foundModule.common_code,
                    });

                    console.log(`[run_module] project=${project_name}, ids=[${groupedIds.join(', ')}], kwargs=`, kwargs);
                });


            });
            // loadGroupedPhones()
            if (pendingCount > 0) {
                moduleStartTableRef.current = true
                setModulesInFlight(pendingCount);
                modulesCompletedRef.current = 0;
            }

        } else if (act.action_type === 'assign') {
        Object.entries(groups).forEach(([project_name, ids]) => {
            if (!selectedPreset?.preset.group_by) return;

            const filter_by: Record<string, string> = {};

            selectedPreset.preset.group_by.forEach(groupField => {
                const sample = flatPhones.find(p => p.id === ids[0]);
                if (sample && groupField in sample) {
                    filter_by[groupField] = sample[groupField];
                }
            });
            if (operator) {
                axios.put('/api/v1/phones/update', {
                    glagol_parent: "fs.at.akc24.ru",
                    project_name,
                    filter_by,
                    update: {
                        manager: operator
                    }
                }).catch(err => {
                    console.error('Ошибка обновления контакта', err);
                });
            }

        });
        if (allCount === count) {
            Swal.fire("Готово", "Операторы назначены", "success");
            loadGroupedPhones()
        }
    }
    else if (act.action_type === "delete") {
            Object.entries(groups).forEach(([project_name, ids]) => {
                socket.emit("delete_phone", {
                    worker, session_key: sessionKey, project_name, ids
                });
            });
            loadGroupedPhones()
            Swal.fire("Готово", "Контакты удалены успешно", "success");
        }


        // loadGroupedPhones()
    };


// Переписанная handleBulkProcess:
    const handleBulkProcess = (
        rows: ApiRow[],
        actionOpt?: ActionOption,
        isRowClick: boolean = false
    ) => {
        // выбираем источник опции: либо переданная, либо из шапки
        const opt = actionOpt ?? selectedActionOption;

        // 1) Если не row-click и нет опции — требуем выбор в шапке
        if (!opt && !isRowClick) {
            return Swal.fire("Ошибка", "Выберите действие в шапке", "error");
        }

        // 2) Нет строк — ничего делать
        if (rows.length === 0) {
            return Swal.fire("Нечего обрабатывать", "Отметьте хотя бы одну строку", "info");
        }

        // if (actionOpt?.action.action_type === "assign") {
        //
        // }
        // 3) Если клик из строки и ровно один ID в одной строке — мгновенно обрабатываем
        if (isRowClick && rows.length === 1 && rows[0].id_list.length === 1) {
            return processRows(rows, opt!);
        }

        // 4) Если одна строка, но несколько ID — открываем модалку
        if (rows.length === 1 && rows[0].id_list.length > 1 && actionOpt?.action.action_type !== "assign") {
            setModalIds(rows[0].id_list);
            setModalAction(opt!.action);
            setModalOpen(true);
            return;
        }


        processRows(rows, opt!);
    };


    // --- 3) поиск + сортировка + пагинация вычисляются мемоизированно ---
    const processedRows = useMemo(() => {
        if (!selectedPreset) return [];

        const term = searchTerm.toLowerCase();

        let result = tableData.filter(row => {
            return Object.keys(selectedPreset.preset.structure).some(colKey => {
                const cell = row[colKey] as ColumnCell | undefined;
                if (!cell || !cell.value) return false;
                return cell.value.join(' ').toLowerCase().includes(term);
            });
        });

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                const aCell = a[sortConfig.key] as ColumnCell | undefined;
                const bCell = b[sortConfig.key] as ColumnCell | undefined;
                const aStr = aCell?.value?.join(' ') ?? '';
                const bStr = bCell?.value?.join(' ') ?? '';

                if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [tableData, searchTerm, sortConfig, selectedPreset]);

    useEffect( () => console.log("processedRows: ",processedRows),[processedRows] )
    // 3.3 разбиваем на страницы
    const totalPages = Math.max(1, Math.ceil(processedRows.length / ROWS_PER_PAGE));
    const paginatedRows = processedRows.slice(
        (currentPage-1)*ROWS_PER_PAGE,
        currentPage*ROWS_PER_PAGE
    );
    useEffect(() => console.log("selected: ", selectedPreset),[selectedPreset])
    // --- обработчики ---
    const toggleSort = (colKey: string) => {
        setSortConfig(prev => {
            if (!prev || prev.key !== colKey) return { key: colKey, direction: 'asc' };
            // если тот же столбец, инвертируем
            return { key: colKey, direction: prev.direction==='asc' ? 'desc' : 'asc' };
        });
    };

    const toggleSelectAll = () => {
        const allKeys = paginatedRows.map(r => r.id_list.join(','));
        const newSet = new Set(selectedRows);
        const allSelected = allKeys.every(k => newSet.has(k));
        if (allSelected) {
            // снять всё на этой странице
            allKeys.forEach(k => newSet.delete(k));
        } else {
            // отметить всё
            allKeys.forEach(k => newSet.add(k));
        }
        setSelectedRows(newSet);
    };

    const toggleRow = (rowKey: string) => {
        const newSet = new Set(selectedRows);
        if (newSet.has(rowKey)) newSet.delete(rowKey);
        else newSet.add(rowKey);
        setSelectedRows(newSet);
    };

    const findNameProject = (projectName: string)=> {
        if (!projectName) return "";
        const found = projectPool.find(
            (proj) => proj.project_name === projectName
        );
        return found ? found.glagol_name : projectName;
    }

    const fetchStatuses = async () => {
        const result: Record<string, ExpressState> = {};

        const configEntries = Object.entries(expressConfig);
        if (configEntries.length === 0) return;

        const ids = configEntries.map(([_, cfg]) => cfg.express_config.id);

        try {
            const response = await axios.get('/api/v1/express_agents_statuses', {
                params: { ids },
                paramsSerializer: params =>
                    params.ids.map((id: number) => `ids=${id}`).join('&')
            });

            const {
                operators = {},
                statuses = {}
            }: {
                operators: Record<string, string[]>,
                statuses: Record<string, { active: boolean, active_calls: number }>
            } = response.data;

            for (const [project, cfg] of configEntries) {
                const express_id = cfg.express_config.id;
                const idStr = String(express_id);

                const status = statuses[idStr];
                const agents = operators[idStr];

                if (!status) continue;

                result[project] = {
                    project,
                    express_id,
                    active: status.active,
                    calls: status.active_calls,
                    agents: agents || []
                };
            }

            setExpressStates(result);
        } catch (err) {
            console.error("Ошибка при получении express_agents_statuses:", err);
        }
    };


    const handleStartExpress = async (project: string) => {
        await axios.post('/api/v1/start_express', {
            glagol_parent: 'fs.at.akc24.ru',
            project_name: project
        });
        await fetchStatuses();
    };

    const handleStopExpress = async (project: string, express_id: number) => {
        await axios.post('/api/v1/stop_express', {
            glagol_parent: 'fs.at.akc24.ru',
            project_name: project
        });
        await fetchStatuses();
    };


    useEffect(() => {
        if (!Object.keys(expressConfig).length) return;

        // Сразу получаем первый раз
        fetchStatuses();

        // Запускаем интервал опроса каждые 15 секунд
        const intervalId = setInterval(() => {
            fetchStatuses();
        }, 5000);

        // Чистим интервал при размонтировании или изменении expressConfig/role
        return () => clearInterval(intervalId);
    }, [expressConfig, role]);

    const renderExpressCards = () => {
        const entries = Object.entries(expressStates)
            .filter(([_, state]) => role === "manager" || state.active); // ← фильтруем только активные для операторов

        return (
            <div
                style={{
                    marginLeft: 30,
                    display: "flex",
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 20
                }}
            >
                {entries.map(([project, state]) => (
                    <div
                        key={project}
                        className="card"
                        style={{
                            minWidth: '220px',
                            padding: 16,
                            borderRadius: 8,
                            flex: '0 1 auto'
                        }}
                    >
                        {(role === "manager" ? [
                            { label: "Проект:", value: findNameProject(project) },
                            { label: "Express активен:", value: state.active ? "Да" : "Нет" },
                            { label: "Операторов в ожидании:", value: state.agents.length },
                            { label: "Активных вызовов:", value: state.calls },
                        ] : [
                            { label: "Проект:", value: findNameProject(project) },
                            { label: "Express активен:", value: state.active ? "Да" : "Нет" },
                        ]).map((item, idx) => (
                            <div key={idx}>
                                <strong>{item.label}</strong>{" "}
                                <span
                                    style={
                                        item.label === "Express активен:"
                                            ? {
                                                color: item.value === "Да" ? "#0BB918" : "#f33333",
                                                fontWeight: 500
                                            }
                                            : {}
                                    }
                                >
                                {item.value}
                            </span>
                            </div>
                        ))}

                        {role === "manager" && (
                            <div className="mt-2 d-flex gap-2">
                                {state.active ? (
                                    <button
                                        className="btn btn-outline-danger"
                                        onClick={() => handleStopExpress(project, state.express_id)}
                                    >
                                        Остановить
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-outline-success"
                                        onClick={() => handleStartExpress(project)}
                                    >
                                        Запустить
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };


    const  mockDataForStatus = []
    const handleDateChange = (dates: [Date | null, Date | null]) => {
        const [start, end] = dates;
        console.log("dates: ", dates)
        setStartDate(start);
        setEndDate(end);
    };

    const statusLabels: Record<string, string> = {
        to_call: "Необработано",
        add: "Доп. контакт",
        schedule: "Отложенный",
        finished: "Завершен"
    };
    useEffect(() => {
        console.log("selectedRows: ", selectedRows)
    },[selectedRows])
    return (
        <div>
            {renderExpressCards()}
            <div className="card p-4 ml-4">
                <div
                    style={{
                        display: 'grid',
                        gap: 16,
                        marginBottom: 8,
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        alignItems: 'end',
                    }}
                >
                {/* Пресеты */}

                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 16,
                            marginBottom: 8,
                            alignItems: 'flex-end',
                        }}
                    >
                        {/* Пресет */}
                        <div style={{ flex: '0 0 250px' }}>
                            <SearchableSelect
                                value={selectedPreset ? selectedPreset.preset.id : ''}
                                isSearchable
                                onChange={val => {
                                    if (selectedPreset && String(selectedPreset.preset.id) === val) return;
                                    const p = presets.find(x => String(x.preset.id) === val);
                                    if (p) {
                                        setTableData([]);
                                        setSelectedPreset(p);
                                    }
                                }}
                                options={presets.map(p => ({
                                    id: p.value,
                                    name: p.label,
                                }))}
                                placeholder="Выберите пресет..."
                            />
                        </div>

                        {/* Поиск */}
                        <div style={{ flex: '0 0 250px' }}>
                            <input
                                type="text"
                                placeholder="Поиск..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="form-control"
                            />
                        </div>

                        {/* Статус */}
                        <div style={{ flex: '0 0 250px' }}>
                            <SearchableSelect
                                value={selectedStatus ?? ''}
                                onChange={(val: string) => setSelectedStatus(val)}
                                isSearchable
                                options={statusOptions.map(s => ({
                                    id: s,
                                    name: statusLabels[s] || s
                                }))}
                                placeholder="Выберите статус..."
                            />
                        </div>

                        {/* Дата */}
                        <div style={{ flex: '0 0 250px' }}>
                            <DatePicker
                                selected={startDate}
                                onChange={handleDateChange}
                                startDate={startDate}
                                endDate={endDate}
                                selectsRange
                                placeholderText="Выберите период"
                                className="form-control"
                                dateFormat="dd.MM.yyyy"
                            />
                        </div>

                        {/* Оператор */}
                        <div style={{ flex: '0 0 250px' }}>
                            <SearchableSelect
                                value={selectedOperator ?? ''}
                                onChange={(val: string) => setSelectedOperator(val)}
                                isSearchable
                                options={operatorOptions}
                                placeholder="Выберите оператора..."
                            />
                        </div>

                        {/* Действие */}
                        <div style={{ flex: '0 0 250px' }}>
                            <SearchableSelect
                                value={selectedActionOption ? selectedActionOption.value : ''}
                                onChange={(val: string) => {
                                    const found = actionOptions.find(opt => opt.value === val) ?? null;
                                    setSelectedActionOption(found);
                                }}
                                isSearchable={false}
                                options={actionOptions.map(a => ({
                                    id: a.value,
                                    name: a.label
                                }))}
                                placeholder="Выберите действие..."
                            />
                        </div>

                        {/* AssignComp или кнопка */}
                        {selectedActionOption?.action.action_type === "assign" ? (
                            <div
                                style={{
                                    flex: '0 0 auto',
                                    minWidth: 400,
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                }}
                            >
                                <AssignComp
                                    opt={selectedActionOption}
                                    rows={selectedRows}
                                    processRows={processRows}
                                />
                            </div>
                        ) : (
                            <div style={{ flex: '0 0 auto' }}>
                                <button
                                    onClick={() => {
                                        const keys = Array.from(selectedRows);
                                        const rows = processedRows.filter(r =>
                                            keys.includes(r.id_list.join(','))
                                        );
                                        handleBulkProcess(rows);
                                    }}
                                    className="btn btn-outline-light text text-dark mx-1 ml-2"
                                >
                                    Обработать
                                </button>
                            </div>
                        )}
                    </div>

                </div>

                {loading && <div>Загрузка данных...</div>}

                {selectedPreset && !loading && (
                    <div >
                    <div style={{ height: '70vh', overflowY: 'auto' }}>
                        {/*<div className="overflow-y-auto" style={{height: "60vh"}}>*/}
                            <table className="w-100 table-auto border-collapse">
                                <thead>
                                <tr>
                                    <th className="border p-2 text-center">
                                        <input
                                            type="checkbox"
                                            className={styles.customCheckbox}
                                            checked={
                                                paginatedRows.length > 0 &&
                                                paginatedRows.every(r => selectedRows.has(r.id_list.join(',')))
                                            }
                                            style={{cursor: "pointer"}}
                                            onChange={toggleSelectAll}
                                        />
                                    </th>
                                    {Object.entries(selectedPreset.preset.structure)
                                        .sort(([a], [b]) => Number(a) - Number(b))
                                        .map(([colKey, cfg]) => (
                                            <th
                                                key={colKey}
                                                className="border p-2 cursor-pointer select-none"
                                                onClick={() => toggleSort(colKey)}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                {cfg.name}
                                                {sortConfig?.key === colKey && (
                                                    <span className="material-icons ml-1" style={{ fontSize: '18px' }}>
                                                        {sortConfig.direction === 'asc'
                                                            ? 'keyboard_arrow_up'
                                                            : 'keyboard_arrow_down'}
                                                    </span>
                                                )}
                                            </th>
                                        ))}
                                    <th className="border p-2">Действия</th>
                                </tr>
                                </thead>
                                <tbody>
                                {paginatedRows.map(row => {
                                    const key = row.id_list.join(',');
                                    return (
                                        <tr key={key}>
                                            {/* Чекбокс */}
                                            <td className="border p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    className={styles.customCheckbox}
                                                    checked={selectedRows.has(key)}
                                                    onChange={() => toggleRow(key)}
                                                    style={{ cursor: "pointer" }}
                                                />
                                            </td>

                                            {/* Данные по колонкам */}
                                            {Object.keys(selectedPreset.preset.structure)
                                                .sort((a, b) => Number(a) - Number(b))
                                                .map(colKey => {
                                                    // Попытка безопасно достать ячейку
                                                    const maybeCell = row[colKey] as ColumnCell | undefined;
                                                    const def = selectedPreset.preset.structure[colKey].default;

                                                    // Если ячейка или её value отсутствует — рендерим default
                                                    if (!maybeCell || !Array.isArray(maybeCell.value)) {
                                                        return (
                                                            <td key={colKey} className="border p-2 align-top">
                                                                {def}
                                                            </td>
                                                        );
                                                    }

                                                    // Иначе — отобразим все элементы массива или default, если он пуст
                                                    return (
                                                        <td key={colKey} className="border p-2 align-top">
                                                            {maybeCell.value.length > 0
                                                                ? maybeCell.value.map((item, idx) => (
                                                                    <div key={idx}>{item}</div>
                                                                ))
                                                                : def
                                                            }
                                                        </td>
                                                    );
                                                })}

                                            {/* Колонка с кнопками действий */}
                                            <td className="border p-2">
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                                    <button
                                                        className="btn btn-outline-light text-dark"
                                                        onClick={() => setOpenedGroup(row.id_list)}
                                                    >
                                                        Открыть
                                                    </button>
                                                    <button
                                                        className="btn btn-outline-primary"
                                                        onClick={() => goToItsm("0198cc9a-951d-7190-968b-2e5e1ae6a143", { worker: sipLogin, role: "operator", name: worker })}
                                                    >
                                                        ITSM (здесь)
                                                    </button>

                                                    {actionOptions.map(opt => {
                                                        if (opt.action?.action_type === "assign") {
                                                            return (
                                                                <AssignComp opt={opt} row={row} processRows={processRows}/>
                                                            );
                                                        }

                                                        return (
                                                            <button
                                                                key={opt.label}
                                                                className="btn btn-outline-light text-dark"
                                                                onClick={() => handleBulkProcess([row], opt, true)}
                                                            >
                                                                {opt.label}
                                                            </button>

                                                        );
                                                    })}
                                                </div>
                                            </td>

                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        {/*</div>*/}
                    </div>
                {/* Пагинация */}
                    <div className="mt-4 flex justify-center items-center space-x-2 my-2" style={{position:"absolute", right:"48%", bottom: -50, zIndex: 10}}>
                        <button
                            onClick={() => {
                                const prevPage = Math.max(1, currentPage - 1);
                                setCurrentPage(prevPage);
                            }}
                            disabled={currentPage === 1}
                            className="btn btn-outline-light text text-dark mx-1 ml-2"
                            style={{padding: 0}}
                        >
                            <span className="material-icons text-base text-gray-600">keyboard_arrow_left</span>
                        </button>
                        <span className="text-sm text-gray-700 font-weight-bold" style={{fontSize: 16}}>
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => {
                                const nextPage = Math.min(totalPages, currentPage + 1);
                                setCurrentPage(nextPage);
                            }}
                            disabled={currentPage === totalPages}
                            className="btn btn-outline-light text text-dark mx-1 "
                            style={{padding: 0}}
                        >
                            <span className="material-icons text-base text-gray-600">keyboard_arrow_right</span>
                        </button>


                    </div>
                    </div>
                )}

                {!selectedPreset && !loading && <div>Пожалуйста, выберите пресет.</div>}
                {selectedPreset && !loading && processedRows.length === 0 && (
                    <div>Нет данных для выбранного пресета.</div>
                )}
                <GroupActionModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    preset={selectedPreset?.preset ?? null}
                    action={modalAction!}
                    ids={modalIds}
                    idProjectMap={idProjectMap}
                    glagolParent={glagolParent}
                    role={role}
                    modules={modules}
                    onAfterAction={loadGroupedPhones}
                />
            </div>
        </div>
    );
};

export default PresetSelectorTable;
