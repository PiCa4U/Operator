import React, { useEffect, useState } from "react";
import axios from "axios";
import {FilterFields} from "./components/fields";
import {FilterItem} from "./components/filterRow";
import Swal from "sweetalert2";
import {ReportList} from "./components/reportList";
import {ComponentForReportTables, dataOptions, modifyOptions} from "./components/componentForReportTables";
import {ReportCard} from "./components/reportCard";
import {store} from "../../../../redux/store";

const parseFilterJsonToItems = (filterJson: any): FilterItem[] => {
    const items: FilterItem[] = [];

    // Проекты
    if (Array.isArray(filterJson.projects)) {
        for (const proj of filterJson.projects) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "project",
                value: {
                    projectId: proj.project_name,
                    reasons: proj.reasons || [],
                    results: proj.results || [],
                },
            });
        }
    }

    // Операторы
    if (Array.isArray(filterJson.users)) {
        items.push({
            id: crypto.randomUUID(),
            fieldId: "operator",
            value: filterJson.users,
        });
    }

    // Комментарии
    if (Array.isArray(filterJson.comments)) {
        for (const comment of filterJson.comments) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "comment",
                value: comment,
            });
        }
    }

    // Даты
    if (Array.isArray(filterJson.dates)) {
        for (const preset of filterJson.dates) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "date",
                value: { preset },
            });
        }
    }

    // Длительность
    if (Array.isArray(filterJson.length)) {
        for (const [op, seconds] of filterJson.length) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "dialogDuration",
                value: {
                    comparison: op === ">" ? "gt" : "lt",
                    seconds,
                },
            });
        }
    }

    // Телефоны
    if (Array.isArray(filterJson.phones)) {
        for (const phone of filterJson.phones) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "phoneNumber",
                value: phone,
            });
        }
    }

    return items;
};

interface ChartPoint {
    x: string;
    y: number;
}

export interface MyChartData {
    label: string;
    color: string;
    type: 'line' | 'bar';
    data: ChartPoint[];
}
export interface ChartConfig {
    data: string;
    modify: string;
    interval: string;
    line: string;
    color: string;
}

export const Filters = () => {
    const [filters, setFilters] = useState<any[]>([]);
    const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
    useEffect(() => console.log("activeFilters: ", activeFilters),[activeFilters])
    const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
    const [reportList, setReportList] = useState<any[]>([])
    const [selectedReport, setSelectedReport] = useState<any>(null)

    useEffect(() => console.log("selectedReport: ", selectedReport),[selectedReport])
    const [projectPool, setProjectPool] = useState<any[]>([])

    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    const [fieldsData, setFieldsData] = useState(null)
    const [reports, setReports] = useState([])

    const [selectedType,setSelectedType] = useState("Список вызовов")
    const [table, setTable] = useState<boolean>(false)
    const [interval, setinterval] = useState<string>("hour")
    const [data, setData] = useState<string>("")
    const [line, setLine] = useState<string>("Линия")
    const [modify, setModify] = useState<string>("none")
    const [color, setColor] = useState("#e66464");
    const [charts, setCharts] = useState<MyChartData[]>([]);
    const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([]);

    useEffect(() => console.log("chartConfigs: ", chartConfigs),[chartConfigs])
    const {
        sipLogin   = '',
        worker     = '',
        glagolParent      = ''
    } = store.getState().credentials;

    const rebuildCharts = async () => {
        const filter_dict = buildFilterJson(activeFilters);
        const newCharts: MyChartData[] = [];

        const timezone_offset = -new Date().getTimezoneOffset() / 60;

        for (const config of chartConfigs) {
            try {
                const res = await axios.post("/api/v1/communications/charts", {
                    filter_dict: filter_dict,
                    interval: config.interval,
                    modify: config.modify,
                    chart: config.data,
                    timezone_offset
                });

                const chartLabels = `${dataOptions.find(item => item.id === config.data)?.name} (${modifyOptions.find(item => item.id === config.modify)?.name})`;

                const labels: string[] = res.data.chart.labels;
                const values: number[] = res.data.chart.data;

                newCharts.push({
                    label: chartLabels,
                    color: config.color,
                    type: config.line === 'Гистограмма' ? 'bar' : 'line',
                    data: labels.map((x, i) => ({ x, y: values[i] })),
                });
            } catch (e) {
                console.error("Ошибка при обновлении графика", e);
            }
        }

        setCharts(newCharts);
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedReport) return;

            const glagol_parent = glagolParent;

            const projects = selectedReport.project_names.map((projname: any) => (
                projectPool.find(proj => proj.glagol_name === projname).project_name
            ))
            console.log("projects: ", projects)
            const callId = selectedReport.id;

            try {
                // Параллельные запросы
                const [projectFieldsRes, relatedCallsRes] = await Promise.all([
                    axios.get("/api/v1/project_fields", {
                        params: {
                            glagol_parent,
                            projects,
                        },
                        paramsSerializer: (params) => {
                            const searchParams = new URLSearchParams();
                            searchParams.append("glagol_parent", params.glagol_parent);
                            params.projects.forEach((p: string) => {
                                searchParams.append("projects", p);
                            });
                            return searchParams.toString();
                        }
                    }),
                    axios.get(`/api/v1/communications/list/${callId}`),
                ]);

                const { reasons, results, base_fields, group_instructions } = projectFieldsRes.data;
                setFieldsData(projectFieldsRes.data)
                const relatedCalls = relatedCallsRes.data.communications;
                setReports(relatedCalls)
                // console.log("📥 reasons:", reasons);
                // console.log("📥 results:", results);
                // console.log("📥 base_fields:", base_fields);
                // console.log("📥 group_instructions:", group_instructions);
                // console.log("📞 relatedCalls:", relatedCalls);

                // Тут можно всё сохранить в состояние
            } catch (err) {
                setSelectedReport(null)
                console.error("Ошибка при загрузке данных по selectedReport:", err);
            }
        };

        fetchData();
    }, [selectedReport]);

    function buildFilterJson(filters: FilterItem[]) {
        const result: any = {};

        for (const filter of filters) {
            const { fieldId, value } = filter;

            if (!value) continue;

            switch (fieldId) {
                case "project": {
                    const project = {
                        project_name: value.projectId,
                        reasons: value.reasons || [],
                        results: value.results || [],
                    };
                    if (!result.projects) result.projects = [];
                    result.projects.push(project);
                    break;
                }

                case "operator":
                    if (value.length) {
                        if (!result.users) result.users = [];
                        result.users.push(...value);
                    }
                    break;

                case "date":
                    if (value.preset === "custom" && value.start && value.end) {
                        const startStr = value.start.toISOString().split("T")[0];
                        const endStr = value.end.toISOString().split("T")[0];
                        if (!result.dates) result.dates = [];
                        result.dates.push(`${startStr} TO ${endStr}`);
                    } else if (value.preset) {
                        if (!result.dates) result.dates = [];
                        result.dates.push(value.preset);
                    }
                    break;

                case "comment":
                    if (value) {
                        if (!result.comments) result.comments = [];
                        result.comments.push(value);
                    }
                    break;

                case "phoneNumber":
                    if (value) {
                        if (!result.phones) result.phones = [];
                        result.phones.push(value);
                    }
                    break;

                case "dialogDuration":
                    if (value && value.comparison && value.seconds >= 0) {
                        const op = value.comparison === "gt" ? ">" : "<";
                        if (!result.length) result.length = [];
                        result.length.push([op, value.seconds]);
                    }
                    break;

                default:
                    break;
            }
        }

        return result;
    }


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

    const saveFilter = async () => {
        const filter_json = buildFilterJson(activeFilters);

        if (!selectedFilterId) {
            const { value: name } = await Swal.fire({
                title: "Введите имя фильтра",
                input: "text",
                inputLabel: "Имя фильтра",
                showCancelButton: true,
                inputValidator: (value) => {
                    if (!value) return "Имя не может быть пустым!";
                    if (filters.some(f => f.name === value)) return "Фильтр с таким именем уже существует";
                    return null;
                },
            });

            if (!name) return;

            try {
                const response = await axios.post("/api/v1/communications/filters/create", {
                    name,
                    glagol_parent: glagolParent,
                    filter_json,
                });
                console.log("Создан новый фильтр", response.data);
            } catch (err) {
                console.error("Ошибка при создании фильтра:", err);
            }
        } else {
            try {
                const response = await axios.put("/api/v1/communications/filters/update", {
                    id: selectedFilterId,
                    name: filters.find(f => f.id === selectedFilterId)?.name || "Без имени",
                    glagol_parent: glagolParent,
                    filter_json,
                });
                console.log("Фильтр обновлён", response.data);
            } catch (err) {
                console.error("Ошибка при обновлении фильтра:", err);
            }
        }
    };

    const deleteFilter = async () => {
        if (!selectedFilterId) return;

        const filterToDelete = filters.find(f => f.id === selectedFilterId);
        if (!filterToDelete) return;

        const confirm = await Swal.fire({
            title: `Удалить фильтр "${filterToDelete.name}"?`,
            text: "Это действие необратимо",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Удалить",
            cancelButtonText: "Отмена",
        });

        if (confirm.isConfirmed) {
            try {
                await axios.delete("/api/v1/communications/filters/delete", {
                    data: {
                        filter_id: selectedFilterId,
                        glagol_parent: glagolParent,
                    },
                });

                Swal.fire("Удалено", "Фильтр удалён", "success");

                // Удаляем из локального состояния
                setFilters(prev => prev.filter(f => f.id !== selectedFilterId));
                setSelectedFilterId(null);
                setActiveFilters([]);
            } catch (err) {
                console.error("Ошибка при удалении фильтра:", err);
                Swal.fire("Ошибка", "Не удалось удалить фильтр", "error");
            }
        }
    };

    const fetchReport = async (pageNumber = 1) => {
        const filter_dict = buildFilterJson(activeFilters);
        const offset = (pageNumber - 1) * limit;

        try {
            const response = await axios.post("/api/v1/communications/report", {
                glagol_parent: glagolParent,
                filter_dict,
                limit,
                offset,
                get_excel: false,
            });

            const report = response.data?.report || [];
            const projectsPool = response.data.projects
            setProjectPool(projectsPool)
            setReportList([report]);
            setPage(pageNumber);
            await rebuildCharts();

            if (response.data.total_count) {
                setTotalCount(response.data.total_count);
            }
            setSelectedReport(null)
        } catch (error) {
            console.error("Ошибка при применении фильтра:", error);
            Swal.fire("Ошибка", "Не удалось получить отчет по фильтру", "error");
        }
    };
    const downloadXLSX = async () => {
        const filter_dict = buildFilterJson(activeFilters);

        try {
            const response = await axios.post(
                "/api/v1/communications/report",
                {
                    glagol_parent: glagolParent,
                    filter_dict,
                    get_excel: true,
                    limit: totalCount,
                },
                { responseType: "blob" }
            );

            const blob = new Blob([response.data], { type: "application/zip" }); // <-- это ZIP
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "report.zip";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Ошибка при скачивании .xlsx:", error);
            Swal.fire("Ошибка", "Не удалось скачать отчёт", "error");
        }
    };


    const downloadMP3 = async () => {
        const filter_dict = buildFilterJson(activeFilters);

        try {
            const response = await axios.post(
                "/api/v1/communications/report/audio",
                {
                    glagol_parent: glagolParent,
                    filter_dict,
                    limit: totalCount,
                    // offset: (page - 1) * limit,
                },
                {
                    responseType: "blob",
                }
            );

            const blob = new Blob([response.data], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "calls_audio.zip";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error("Ошибка при скачивании mp3 архива:", error);
            Swal.fire("Ошибка", "Не удалось скачать архив с mp3", "error");
        }
    };

    const getIntervalReports = () => {
        setSelectedType("Интервальные отчёты")
    }

    const getTableReports = () => {
        setSelectedType("Список вызовов")
    }

    const getInfo = async () => {
        const filter_dict = buildFilterJson(activeFilters);
        const timezone_offset = -new Date().getTimezoneOffset() / 60;
        try {
            const response = await axios.post("/api/v1/communications/charts", {
                filter_dict,
                interval,
                modify,
                chart: data,
                timezone_offset
            });
            const chartLabels = `${dataOptions.find(item => item.id === data)?.name} (${modifyOptions.find(item => item.id === modify)?.name})`
            const labels: string[] = response.data.chart.labels;
            const values: number[] = response.data.chart.data;
            console.log("datap: ", data)
            const newChart: MyChartData = {
                label: chartLabels, // подпись линии
                color: color,
                type: line === 'Гистограмма' ? 'bar' : 'line',
                data: labels.map((x, i) => ({ x, y: values[i] })),
            };
            const newConfig: ChartConfig = { data, modify, interval, line, color };
            setChartConfigs(prev => [...prev, newConfig]);

            setCharts(prev => [...prev, newChart]);
        } catch (err) {
            console.error("Ошибка при получении графиков:", err);
            Swal.fire("Ошибка", "Не удалось получить данные графика", "error");
        }
    };


    const renderDownloadButtons = () => {
        return (
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button className="btn btn-outline-success" onClick={downloadXLSX}>
                    Скачать xlsx (rar)
                </button>
                <button className="btn btn-outline-success" onClick={downloadMP3}>
                    Скачать mp3 (rar)
                </button>
                <button className="btn btn-outline-success" style={selectedType === "Интервальные отчёты" ? {backgroundColor: "#0BB918", color: "white"} : {}} onClick={getIntervalReports}>
                    Интервальные отчёты
                </button>
                <button className="btn btn-outline-success" style={selectedType === "Список вызовов" ? {backgroundColor: "#0BB918", color: "white"} : {}} onClick={getTableReports}>
                    Список вызовов
                </button>
            </div>
        );
    }
    const renderButtons = () => {
        return (
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button className="btn btn-outline-info" onClick={saveFilter}>
                    сохранить
                </button>
                <button className="btn btn-outline-info" onClick={() => fetchReport(1)}>
                    применить
                </button>
                {selectedFilterId && (
                    <button className="btn btn-outline-danger" onClick={deleteFilter}>
                        удалить
                    </button>
                )}
            </div>
        );
    };

    return (
        <div style={{display: "flex", flexDirection: "column", gap: 16}}>
            <div style={{display: "flex", flexDirection: "row", gap: 8}}>
                <button
                    className={`btn btn-outline-info ${selectedFilterId === null ? "active" : ""}`}
                    onClick={() => {
                        setActiveFilters([]);
                        setSelectedFilterId(null);
                    }}
                >
                    Новый фильтр
                </button>
                {filters.map(f => (
                    <button
                        key={f.id}
                        className={`btn btn-outline-info ${selectedFilterId === f.id ? "active" : ""}`}
                        onClick={() => {
                            const parsed = parseFilterJsonToItems(f.filter);
                            setActiveFilters(parsed);
                            setSelectedFilterId(f.id);
                        }}
                    >
                        {f.name}
                    </button>
                ))}
            </div>
            <FilterFields activeFilters={activeFilters} setActiveFilters={setActiveFilters}/>
            {renderButtons()}
            <div
                style={{
                    borderTop: '1px solid #dee2e6',
                    width: '100%',
                }}
            />
            {reportList.length !== 0 && <div style={{display: "flex", flexDirection:"column", gap:16}}>
                {renderDownloadButtons()}
                {selectedType === "Список вызовов" ? <div>
                    <div className="row mb-2">
                        <div className="col d-flex justify-content-center align-items-center">
                            <button
                                className="btn btn-light mr-3"
                                disabled={page === 1}
                                onClick={() => fetchReport(page - 1)}
                            >
                                &lt;
                            </button>
                            <span style={{minWidth: '90px', textAlign: 'center'}}>
                                {page} из {Math.ceil(totalCount / limit)}
                            </span>
                            <button
                                className="btn btn-light ml-3"
                                disabled={totalCount ? page >= Math.ceil(totalCount / limit) : true}
                                onClick={() => fetchReport(page + 1)}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                    <div style={{display: "flex", flexDirection:"row", gap: 16}}>
                        <div style={{flex: 6}}>
                            <ReportList reportList={reportList[0]} setSelectedReport={setSelectedReport}/>
                        </div>
                        {selectedReport && <div style={{flex: 3}}>
                            <ReportCard selectedReport={selectedReport} fieldsData={fieldsData} reports={reports}/>
                        </div>}
                    </div>
                </div> : (
                    <ComponentForReportTables
                        table={table}
                        setTable={setTable}
                        interval={interval}
                        setinterval={setinterval}
                        data={data}
                        setData={setData}
                        line={line}
                        setLine={setLine}
                        modify={modify}
                        setModify={setModify}
                        color={color}
                        setColor={setColor}
                        getInfo={getInfo}
                        charts={charts}
                        setCharts={setCharts}
                        chartConfigs={chartConfigs}
                        setChartConfig={setChartConfigs}
                    />
                    )}
            </div>}
        </div>
    );
};
