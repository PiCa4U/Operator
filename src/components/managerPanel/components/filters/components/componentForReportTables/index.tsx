import React, { FC, useEffect, useRef, useState, useMemo } from "react";
import SearchableSelect from "../../../../../callControlPanel/components/select";
import ChartContainer from "../charts";
import { ChartConfig, MyChartData } from "../../index";
import { ChartDataTable } from "../table";

export const intervalOptions = [
    { id: "minute", name: "Минута" },
    { id: "hour", name: "Час" },
    { id: "day", name: "День" },
    { id: "week", name: "Неделя" },
    { id: "month", name: "Месяц" },
];

export const dataOptions = [
    { id: "arrived", name: "Поступило вызовов" },
    { id: "accepted", name: "Принято вызовов" },
    { id: "lost", name: "Пропущено вызовов" },

    // ✅ по доке
    { id: "outbound_attempts", name: "Исходящие попытки" },
    { id: "outbound_calls", name: "Исходящие соединения" },

    { id: "lost_rate", name: "Процент пропущенных" },

    { id: "wait", name: "Ожидание на линии (wait)" },
    { id: "ASA", name: "ASA (Среднее время ответа)" },

    { id: "talk", name: "AHT (Среднее время разговора)" },
    { id: "service_levels", name: "SL (Разбивка по сервисным уровням)" },
    { id: "operator_speed", name: "Скорость работы операторов" },

    { id: "post_time", name: "Время постобработки (post_time)" },
];

export const modifyOptions = [
    { id: "average", name: "Среднее" },
    { id: "sum", name: "Сумма" },
    { id: "none", name: "Без преобразования" },
];

export const lineOptions = [
    { id: "Линия", name: "Линия" },
    { id: "Гистограмма", name: "Гистограмма" },
];

// ✅ modify-объект с range разрешён только для этих графиков (по доке)
const RANGE_ALLOWED_CHARTS = new Set(["arrived", "accepted", "outbound_attempts", "outbound_calls", "lost"]);

// ✅ при week/month доступны только эти графики (по доке)
const LONG_INTERVAL_ALLOWED = new Set(["arrived", "accepted", "outbound_attempts", "outbound_calls", "lost"]);

const WEEKDAYS = [
    { id: "Monday", name: "Пн" },
    { id: "Tuesday", name: "Вт" },
    { id: "Wednesday", name: "Ср" },
    { id: "Thursday", name: "Чт" },
    { id: "Friday", name: "Пт" },
    { id: "Saturday", name: "Сб" },
    { id: "Sunday", name: "Вс" },
];

type ModifyMode = "string" | "object";
type InnerInterval = "minute" | "hour" | "day";

type TemplateOption = {
    id: string;
    name: string;
};

type Props = {
    table: boolean;
    setTable: (table: boolean) => void;

    interval: string;
    setinterval: (interval: string) => void;

    data: string;
    setData: (data: string) => void;

    line: string;
    setLine: (line: string) => void;

    // строковый modify (sum/average/none)
    modify: string;
    setModify: (modify: string) => void;

    color: string;
    setColor: (color: string) => void;

    getInfo: () => void;

    charts: MyChartData[];
    setCharts: (charts: MyChartData[]) => void;

    chartConfigs: ChartConfig[];
    setChartConfig: (chartConfigs: ChartConfig[]) => void;

    // ✅ новые состояния для modify-объекта
    modifyMode: ModifyMode;
    setModifyMode: (v: ModifyMode) => void;

    modifyObjInner: InnerInterval;
    setModifyObjInner: (v: InnerInterval) => void;

    modifyObjRange: string[];
    setModifyObjRange: (v: string[]) => void;

    // ✅ текущее сообщение валидации (по доке) — показываем до запроса
    validationError: string | null;

    // ✅ удобство: если нужно строго 1 dates — показываем кнопку автофикса
    showFixDatesButton: boolean;
    onFixDatesToSingle: () => void;

    // ✅ последнее “человеческое” сообщение по графикам
    chartErrorText: string;

    // ✅ удалить конфиг (и все его серии)
    onDeleteChartConfig: (configId: string) => void;

    // ✅ ШАБЛОНЫ ГРАФИКОВ (GET /report_templates)
    templateOptions: TemplateOption[];
    selectedTemplateId: string;
    onSelectTemplate: (templateId: string) => void;
    onReloadTemplates: () => void;
    templatesLoading: boolean;
    templatesError: string;
};

const RU_MAIN: Record<string, string> = {
    minute: "Минута",
    hour: "Час",
    day: "День",
    week: "Неделя",
    month: "Месяц",
};

const RU_INNER: Record<string, string> = {
    minute: "по минутам",
    hour: "по часам",
    day: "по дням недели",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const buildMinuteOptions = () =>
    Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: pad2(i) }));

const buildHourOptions = () =>
    Array.from({ length: 24 }, (_, i) => ({ id: String(i), name: pad2(i) }));

const toggleInArray = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

const uniqueSortedNumericStrings = (arr: string[], max: number) => {
    const s = new Set<number>();
    for (const v of arr) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 0 && n <= max) s.add(n);
    }
    return Array.from(s).sort((a, b) => a - b).map(String);
};

const uniqueSortedWeekdays = (arr: string[]) => {
    const allowed = new Set(WEEKDAYS.map((w) => w.id));
    const res: string[] = [];
    for (const v of arr) if (allowed.has(v) && !res.includes(v)) res.push(v);
    return res;
};

const getFullRange = (inner: InnerInterval): string[] => {
    if (inner === "minute") return Array.from({ length: 60 }, (_, i) => String(i));
    if (inner === "hour") return Array.from({ length: 24 }, (_, i) => String(i));
    return WEEKDAYS.map((d) => d.id);
};

const Chip: React.FC<{
    active: boolean;
    label: string;
    onClick: () => void;
    title?: string;
}> = ({ active, label, onClick, title }) => (
    <button
        type="button"
        className={[
            "btn",
            "btn-sm",
            active ? "btn-primary" : "btn-outline-secondary",
            "rounded-pill",
            "px-3",
            "py-1",
        ].join(" ")}
        style={{
            lineHeight: "18px",
            fontWeight: 600,
            boxShadow: active ? "0 2px 10px rgba(13,110,253,.22)" : "none",
            transition: "transform .06s ease, box-shadow .12s ease",
        }}
        onClick={onClick}
        aria-pressed={active}
        title={title}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
        {label}
    </button>
);

const SoftBtn: React.FC<{
    label: string;
    onClick: () => void;
    variant?: "primary" | "danger" | "secondary";
}> = ({ label, onClick, variant = "secondary" }) => (
    <button
        type="button"
        className={`btn btn-sm btn-outline-${variant} rounded-pill px-3`}
        onClick={onClick}
        style={{ fontWeight: 600 }}
    >
        {label}
    </button>
);

const RangePicker: FC<{
    inner: InnerInterval;
    value: string[];
    onChange: (v: string[]) => void;
}> = ({ inner, value, onChange }) => {
    const options = useMemo(() => {
        if (inner === "minute") return buildMinuteOptions(); // {id:'0', name:'00'} ...
        if (inner === "hour") return buildHourOptions(); // {id:'0', name:'00'} ...
        return WEEKDAYS; // {id:'Monday', name:'Пн'}
    }, [inner]);

    const full = useMemo(() => getFullRange(inner), [inner]);

    const setPreset = (preset: string[]) => onChange(preset);

    const invert = () => {
        const s = new Set(value);
        onChange(full.filter((x) => !s.has(x)));
    };

    const cols =
        inner === "minute"
            ? "repeat(12, minmax(0, 1fr))"
            : inner === "hour"
                ? "repeat(8,  minmax(0, 1fr))"
                : "repeat(7,  minmax(0, 1fr))";

    const title = inner === "minute" ? "Минуты" : inner === "hour" ? "Часы" : "Дни недели";

    const badge = useMemo(() => formatSelectionBadge(inner, value), [inner, value]);

    return (
        <div
            style={{
                border: "1px solid #e9ecef",
                borderRadius: 12,
                padding: 12,
                background: "linear-gradient(180deg, #ffffff, #fbfcff)",
                boxShadow: "0 8px 22px rgba(0,0,0,.05)",
            }}
        >
            {/* header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    justifyContent: "space-between",
                    marginBottom: 10,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 800 }}>{title}</div>
                    <span
                        className="badge bg-light text-dark"
                        style={{ border: "1px solid #e9ecef", maxWidth: 420 }}
                        title={badge.full}
                    >
                        <span style={{ opacity: 0.8 }}>
                            {inner === "day" ? "Дни: " : inner === "hour" ? "Часы: " : "Минуты: "}
                        </span>
                        <b style={{ whiteSpace: "nowrap" }}>{badge.short}</b>
                    </span>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "flex-end" }}>
                    <SoftBtn label="Выбрать все" variant="primary" onClick={() => onChange(full)} />
                    <SoftBtn label="Сбросить" variant="danger" onClick={() => onChange([])} />
                    <SoftBtn label="Инвертировать" onClick={invert} />

                    {inner === "day" && (
                        <>
                            <SoftBtn
                                label="Будни"
                                onClick={() =>
                                    setPreset(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
                                }
                            />
                            <SoftBtn label="Выходные" onClick={() => setPreset(["Saturday", "Sunday"])} />
                        </>
                    )}

                    {inner === "hour" && (
                        <>
                            <SoftBtn
                                label="9–18"
                                onClick={() => setPreset(Array.from({ length: 10 }, (_, i) => String(i + 9)))}
                            />
                            <SoftBtn label="0–5" onClick={() => setPreset(["0", "1", "2", "3", "4", "5"])} />
                        </>
                    )}

                    {inner === "minute" && (
                        <>
                            <SoftBtn label="0/15/30/45" onClick={() => setPreset(["0", "15", "30", "45"])} />
                            <SoftBtn label="только 00" onClick={() => setPreset(["0"])} />
                        </>
                    )}
                </div>
            </div>

            {/* grid */}
            <div
                style={{
                    border: "1px solid #eef1f6",
                    borderRadius: 12,
                    padding: 10,
                    background: "#fff",
                }}
            >
                <div style={{ display: "grid", gridTemplateColumns: cols, gap: 8 }}>
                    {options.map((o) => {
                        const active = value.includes(o.id);
                        return (
                            <Chip
                                key={o.id}
                                active={active}
                                label={o.name}
                                onClick={() => onChange(toggleInArray(value, o.id))}
                                title={o.id}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

const WEEKDAY_INDEX = new Map(WEEKDAYS.map((d, i) => [d.id, i] as const));

const groupConsecutive = (nums: number[]): Array<[number, number]> => {
    if (!nums.length) return [];
    const res: Array<[number, number]> = [];
    let start = nums[0];
    let prev = nums[0];

    for (let i = 1; i < nums.length; i++) {
        const cur = nums[i];
        if (cur === prev + 1) {
            prev = cur;
            continue;
        }
        res.push([start, prev]);
        start = cur;
        prev = cur;
    }
    res.push([start, prev]);
    return res;
};

const shortenParts = (full: string, maxParts = 6) => {
    const parts = full.split(", ").filter(Boolean);
    if (parts.length <= maxParts) return full;
    const rest = parts.length - maxParts;
    return `${parts.slice(0, maxParts).join(", ")} … +${rest}`;
};

const formatNumericSelection = (value: string[], max: number) => {
    const nums = Array.from(
        new Set(
            value
                .map((v) => Number(v))
                .filter((n) => Number.isInteger(n) && n >= 0 && n <= max)
        )
    ).sort((a, b) => a - b);

    if (!nums.length) return { full: "Не выбрано", short: "Не выбрано" };
    if (nums.length === max + 1) return { full: "Все", short: "Все" };

    const ranges = groupConsecutive(nums).map(([a, b]) => {
        const A = pad2(a);
        const B = pad2(b);
        return a === b ? A : `${A}–${B}`;
    });

    const full = ranges.join(", ");
    return { full, short: shortenParts(full, 6) };
};

const formatWeekdaySelection = (value: string[]) => {
    const idxs = Array.from(
        new Set(
            value
                .map((v) => WEEKDAY_INDEX.get(v))
                .filter((x): x is number => typeof x === "number")
        )
    ).sort((a, b) => a - b);

    if (!idxs.length) return { full: "Не выбрано", short: "Не выбрано" };
    if (idxs.length === WEEKDAYS.length) return { full: "Все", short: "Все" };

    const ranges = groupConsecutive(idxs).map(([a, b]) => {
        const A = WEEKDAYS[a]?.name ?? String(a);
        const B = WEEKDAYS[b]?.name ?? String(b);
        return a === b ? A : `${A}–${B}`;
    });

    const full = ranges.join(", ");
    return { full, short: shortenParts(full, 6) };
};

const formatSelectionBadge = (inner: InnerInterval, value: string[]) => {
    if (inner === "minute") return formatNumericSelection(value, 59);
    if (inner === "hour") return formatNumericSelection(value, 23);
    return formatWeekdaySelection(value);
};

export const ComponentForReportTables: FC<Props> = ({
                                                        table,
                                                        setTable,
                                                        interval,
                                                        setinterval,
                                                        data,
                                                        setData,
                                                        line,
                                                        setLine,
                                                        modify,
                                                        setModify,
                                                        color,
                                                        setColor,
                                                        getInfo,
                                                        charts,
                                                        setCharts,
                                                        chartConfigs,

                                                        modifyMode,
                                                        setModifyMode,
                                                        modifyObjInner,
                                                        setModifyObjInner,
                                                        modifyObjRange,
                                                        setModifyObjRange,

                                                        validationError,
                                                        showFixDatesButton,
                                                        onFixDatesToSingle,
                                                        chartErrorText,

                                                        onDeleteChartConfig,

                                                        templateOptions,
                                                        selectedTemplateId,
                                                        onSelectTemplate,
                                                        onReloadTemplates,
                                                        templatesLoading,
                                                        templatesError,
                                                    }) => {
    const [showValues, setShowValues] = useState(false);

    const isLongInterval = interval === "week" || interval === "month";
    const canUseObjectModify = !!data && RANGE_ALLOWED_CHARTS.has(data) && interval !== "minute";
    const objectForced = isLongInterval;

    // ✅ автоприведение режима modify к доке
    useEffect(() => {
        if (objectForced && modifyMode !== "object") {
            setModifyMode("object");
        }
        if (!objectForced && !canUseObjectModify && modifyMode === "object") {
            setModifyMode("string");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [objectForced, canUseObjectModify, data, interval]);

    // ✅ фильтрация графиков для Недели/Месяца (по доке)
    const filteredDataOptions = useMemo(() => {
        if (!isLongInterval) return dataOptions;
        return dataOptions.filter((o) => LONG_INTERVAL_ALLOWED.has(o.id));
    }, [isLongInterval]);

    // ✅ если юзер выбрал Неделю/Месяц и data не подходит — сбрасываем
    useEffect(() => {
        if (!isLongInterval) return;
        if (data && !LONG_INTERVAL_ALLOWED.has(data)) setData("");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLongInterval, data]);

    // ✅ правила доки по внутреннему интервалу для modify-объекта
    const lockedInner: InnerInterval | null = useMemo(() => {
        if (modifyMode !== "object") return null;
        if (interval === "hour") return "minute";
        if (interval === "day") return "hour";
        if (interval === "week" || interval === "month") return null; // day/hour выбирает юзер
        return null;
    }, [modifyMode, interval]);

    // ✅ при входе в object-mode приводим inner+range к валидным по доке
    useEffect(() => {
        if (modifyMode !== "object") return;

        const targetInner: InnerInterval =
            lockedInner ??
            (isLongInterval ? (modifyObjInner === "minute" ? "day" : modifyObjInner) : modifyObjInner);

        if (targetInner !== modifyObjInner) {
            setModifyObjInner(targetInner);
        }

        // приводим range
        let nextRange = modifyObjRange;
        if (targetInner === "minute") nextRange = uniqueSortedNumericStrings(modifyObjRange, 59);
        if (targetInner === "hour") nextRange = uniqueSortedNumericStrings(modifyObjRange, 23);
        if (targetInner === "day") nextRange = uniqueSortedWeekdays(modifyObjRange);

        // если пусто — по умолчанию “все” (range по доке не должен быть пустым)
        if (!nextRange.length) nextRange = getFullRange(targetInner);

        // если изменилось — обновляем
        const same =
            nextRange.length === modifyObjRange.length && nextRange.every((v, i) => v === modifyObjRange[i]);
        if (!same) setModifyObjRange(nextRange);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modifyMode, interval, lockedInner]);

    const timeoutRef = useRef<number | null>(null);
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newColor = e.target.value;
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setColor(newColor), 200);
    };

    const renderButtons = () => (
        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
            <button
                className="btn btn-outline-success"
                style={table ? { backgroundColor: "#0BB918", color: "white" } : {}}
                onClick={() => setTable(true)}
            >
                Таблица
            </button>
            <button
                className="btn btn-outline-success"
                style={!table ? { backgroundColor: "#0BB918", color: "white" } : {}}
                onClick={() => setTable(false)}
            >
                График
            </button>
        </div>
    );

    const groupedLegend = useMemo(() => {
        const map = new Map<string, { cfg: ChartConfig; series: MyChartData[] }>();
        for (const cfg of chartConfigs) map.set(cfg.id, { cfg, series: [] });

        const orphan: MyChartData[] = [];

        for (const ch of charts) {
            if (ch.configId && map.has(ch.configId)) {
                map.get(ch.configId)!.series.push(ch);
            } else {
                orphan.push(ch);
            }
        }

        const res = Array.from(map.values());
        if (orphan.length) {
            res.push({
                cfg: {
                    id: "__orphan__",
                    data: "",
                    modify: "none" as any,
                    interval: "hour" as any,
                    line: "Линия",
                    color: "#999999",
                    caption: "Прочие серии",
                } as any,
                series: orphan,
            });
        }

        return res;
    }, [chartConfigs, charts]);

    const renderChartLegend = () => (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {groupedLegend.map((g) => (
                <div
                    key={g.cfg.id}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        border: "1px solid #ccc",
                        borderRadius: 6,
                        padding: "6px 10px",
                        backgroundColor: "#f9f9f9",
                        gap: 10,
                        flexWrap: "wrap",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {g.series.slice(0, 6).map((s, idx) => (
                            <div
                                key={(s.label || "s") + idx}
                                style={{ width: 12, height: 12, backgroundColor: s.color, borderRadius: 2 }}
                                title={s.seriesKey ? String(s.seriesKey) : s.label}
                            />
                        ))}
                        {g.series.length > 6 && (
                            <span style={{ fontSize: 12, color: "#666" }}>+{g.series.length - 6}</span>
                        )}
                    </div>

                    <div style={{ flex: 1, minWidth: 240 }}>
                        <div style={{ fontWeight: 600 }}>{g.cfg.caption}</div>
                        <div style={{ fontSize: 12, color: "#666" }}>
                            Серий: <b>{g.series.length}</b>
                        </div>
                    </div>

                    {g.cfg.id !== "__orphan__" && (
                        <button
                            className="btn btn-sm btn-outline-danger"
                            style={{ padding: "2px 10px", fontSize: 12, whiteSpace: "nowrap" }}
                            onClick={() => onDeleteChartConfig(g.cfg.id)}
                        >
                            Удалить
                        </button>
                    )}
                </div>
            ))}
        </div>
    );

    const renderChartControls = () => (
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn btn-outline-secondary" onClick={() => setShowValues((v) => !v)}>
                {showValues ? "Скрыть значения" : "Показать значения"}
            </button>
        </div>
    );

    const baseH = 400;
    const extraTop = showValues ? 62 : 0;

    const showModifyModeSelect = !objectForced && canUseObjectModify;

    const innerForUi: InnerInterval = lockedInner ?? modifyObjInner;

    const innerOptionsForWeekMonth = [
        { id: "day", name: "Внутри: по дням недели" },
        { id: "hour", name: "Внутри: по часам" },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* ✅ Шаблоны графиков */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ width: 440 }}>
                    <SearchableSelect
                        value={selectedTemplateId}
                        onChange={(v: any) => onSelectTemplate(String(v))}
                        options={[{ id: "", name: "— Выберите шаблон графиков —" }, ...templateOptions]}
                        isSearchable={false}
                    />
                    {!!templatesError && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#a00" }}>{templatesError}</div>
                    )}
                </div>
            </div>

            {renderButtons()}

            {/* interval */}
            <div style={{ width: 340 }}>
                <SearchableSelect
                    value={interval}
                    onChange={setinterval}
                    options={intervalOptions}
                    isSearchable={false}
                />
                <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                    {isLongInterval ? (
                        <>
                            Для <b>Недели</b> нужен диапазон минимум <b>14 дней</b>, для <b>Месяца</b> — минимум{" "}
                            <b>59 дней</b>. При <b>Неделе/Месяце</b> «Преобразование» всегда в режиме{" "}
                            <b>«Среднее по подинтервалам»</b>, а в фильтре <b>«Дата»</b> должен быть ровно{" "}
                            <b>один</b> период.
                        </>
                    ) : (
                        <>
                            При <b>Минуте/Часе/Дне</b> можно использовать преобразование как «Сумма/Среднее/Без».
                            Для некоторых графиков доступен режим <b>«Среднее по подинтервалам»</b>.
                        </>
                    )}
                </div>
            </div>

            {/* data */}
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <div style={{ flex: 1 }}>
                    <SearchableSelect value={data} onChange={setData} options={filteredDataOptions} isSearchable={false} />
                    {data && !RANGE_ALLOWED_CHARTS.has(data) && (isLongInterval || modifyMode === "object") && (
                        <div style={{ fontSize: 12, color: "#a00", marginTop: 6 }}>
                            Для этого графика режим «Среднее по подинтервалам» не поддерживается. Доступны: Поступило,
                            Принято, Исходящие попытки, Исходящие соединения, Пропущено.
                        </div>
                    )}
                </div>

                {data && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 3 }}>
                        <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                                <SearchableSelect value={line} onChange={setLine} options={lineOptions} isSearchable={false} />
                            </div>

                            {/* modify mode selector (optional) */}
                            <div style={{ flex: 1 }}>
                                {showModifyModeSelect ? (
                                    <SearchableSelect
                                        value={modifyMode}
                                        onChange={(v: any) => setModifyMode(v)}
                                        options={[
                                            { id: "string", name: "Обычное (Сумма/Среднее/Без)" },
                                            { id: "object", name: "Среднее по подинтервалам" },
                                        ]}
                                        isSearchable={false}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            height: 38,
                                            display: "flex",
                                            alignItems: "center",
                                            padding: "0 12px",
                                            border: "1px solid #ced4da",
                                            borderRadius: 4,
                                            background: "#f8f9fa",
                                            color: "#333",
                                        }}
                                        title={
                                            objectForced
                                                ? "Для Недели/Месяца режим только «Среднее по подинтервалам»"
                                                : !canUseObjectModify
                                                    ? "Для этого графика или интервала режим «Среднее по подинтервалам» недоступен"
                                                    : ""
                                        }
                                    >
                                        {objectForced ? "Среднее по подинтервалам" : "Обычное"}
                                    </div>
                                )}
                            </div>

                            {/* modify value / object label */}
                            <div style={{ flex: 1 }}>
                                {modifyMode === "string" ? (
                                    <SearchableSelect value={modify} onChange={setModify} options={modifyOptions} isSearchable={false} />
                                ) : (
                                    <div
                                        style={{
                                            height: 38,
                                            display: "flex",
                                            alignItems: "center",
                                            padding: "0 12px",
                                            border: "1px solid #ced4da",
                                            borderRadius: 4,
                                            background: "#f8f9fa",
                                            color: "#333",
                                        }}
                                        title="Среднее по выбранным подинтервалам (внутренний интервал + диапазон)"
                                    >
                                        Среднее (подинтервалы)
                                    </div>
                                )}
                            </div>

                            <input
                                type="color"
                                value={color}
                                className="form-control"
                                onChange={handleChange}
                                style={{ flex: "0 0 150px" }}
                            />

                            <button
                                className="btn btn-outline-light text text-dark"
                                style={{ whiteSpace: "nowrap" }}
                                onClick={getInfo}
                                disabled={!!validationError}
                                title={validationError || "Добавить график"}
                            >
                                Добавить
                            </button>
                        </div>

                        {/* object inner interval + range */}
                        {modifyMode === "object" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <div style={{ width: 340 }}>
                                        {lockedInner ? (
                                            <div
                                                style={{
                                                    height: 38,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    padding: "0 12px",
                                                    border: "1px solid #ced4da",
                                                    borderRadius: 4,
                                                    background: "#f8f9fa",
                                                    color: "#333",
                                                }}
                                                title="Bнутренний интервал фиксирован для выбранного основного интервала"
                                            >
                                                Внутренний интервал:{" "}
                                                <b style={{ marginLeft: 6 }}>{RU_INNER[lockedInner] ?? lockedInner}</b>
                                            </div>
                                        ) : (
                                            <SearchableSelect
                                                value={modifyObjInner}
                                                onChange={(v: any) => setModifyObjInner(v)}
                                                options={innerOptionsForWeekMonth}
                                                isSearchable={false}
                                            />
                                        )}
                                        <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                                            {interval === "hour" && (
                                                <>
                                                    При основном интервале <b>Час</b> внутренний интервал должен быть{" "}
                                                    <b>по минутам</b>.
                                                </>
                                            )}
                                            {interval === "day" && (
                                                <>
                                                    При основном интервале <b>День</b> внутренний интервал должен быть{" "}
                                                    <b>по часам</b>.
                                                </>
                                            )}
                                            {(interval === "week" || interval === "month") && (
                                                <>
                                                    При <b>{RU_MAIN[interval] ?? interval}</b> внутренний интервал может быть{" "}
                                                    <b>по дням недели</b> или <b>по часам</b>.
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <RangePicker inner={innerForUi} value={modifyObjRange} onChange={setModifyObjRange} />
                            </div>
                        )}

                        {/* friendly validation */}
                        {validationError && (
                            <div
                                style={{
                                    background: "#fff3cd",
                                    border: "1px solid #ffeeba",
                                    color: "#856404",
                                    padding: 10,
                                    borderRadius: 6,
                                }}
                            >
                                <b>Проверь параметры:</b>
                                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{validationError}</div>
                                {showFixDatesButton && (
                                    <div style={{ marginTop: 8 }}>
                                        <button className="btn btn-sm btn-outline-dark" onClick={onFixDatesToSingle}>
                                            Оставить только один период в датах
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* last chart error */}
                        {chartErrorText && !validationError && (
                            <div
                                style={{
                                    background: "#f8d7da",
                                    border: "1px solid #f5c6cb",
                                    color: "#721c24",
                                    padding: 10,
                                    borderRadius: 6,
                                }}
                            >
                                <b>Не удалось обновить некоторые графики:</b>
                                <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{chartErrorText}</div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {!table && charts.length > 0 && (
                <>
                    {renderChartLegend()}
                    {renderChartControls()}
                    <div style={{ width: "100%", height: baseH + extraTop }}>
                        <ChartContainer charts={charts} showValues={showValues} />
                    </div>
                </>
            )}

            {table && charts.length > 0 && <ChartDataTable charts={charts} />}
        </div>
    );
};
