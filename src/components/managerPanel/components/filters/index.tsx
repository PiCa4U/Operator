import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { FilterFields } from "./components/fields";
import { FilterItem } from "./components/filterRow";
import Swal from "sweetalert2";
import { ReportList } from "./components/reportList";
import { ComponentForReportTables, dataOptions } from "./components/componentForReportTables";
import { ReportCard } from "./components/reportCard";
import { store } from "../../../../redux/store";

const parseFilterJsonToItems = (filterJson: any): FilterItem[] => {
    const items: FilterItem[] = [];

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

    if (Array.isArray(filterJson.users)) {
        items.push({
            id: crypto.randomUUID(),
            fieldId: "operator",
            value: filterJson.users,
        });
    }

    if (Array.isArray(filterJson.comments)) {
        for (const comment of filterJson.comments) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "comment",
                value: comment,
            });
        }
    }

    if (Array.isArray(filterJson.dates)) {
        for (const preset of filterJson.dates) {
            items.push({
                id: crypto.randomUUID(),
                fieldId: "date",
                value: { preset },
            });
        }
    }

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
    type: "line" | "bar";
    data: ChartPoint[];
    /** чтобы легенда/удаление работали по конфигу */
    configId?: string;
    /** ключ серии в мультисериальных ответах */
    seriesKey?: string;
}

type MainInterval = "minute" | "hour" | "day" | "week" | "month";
type InnerInterval = "minute" | "hour" | "day";

type ModifyObject = {
    type_: "average";
    interval: InnerInterval;
    range: string[];
};

type ModifyValue = "sum" | "average" | "none" | ModifyObject;
type ModifyMode = "string" | "object";

export interface ChartConfig {
    id: string;
    data: string;
    modify: ModifyValue;
    interval: MainInterval;
    line: string;
    color: string;
    /** человеко-понятный заголовок конфига (для легенды) */
    caption: string;
}

/** ===== RU helpers ===== */
const RU_MAIN_INTERVAL: Record<string, string> = {
    minute: "Минута",
    hour: "Час",
    day: "День",
    week: "Неделя",
    month: "Месяц",
};

const RU_INNER_INTERVAL: Record<string, string> = {
    minute: "по минутам",
    hour: "по часам",
    day: "по дням недели",
};

const q = (s: string) => `«${s}»`;
const mainRu = (i: string) => RU_MAIN_INTERVAL[i] ?? i;
const innerRu = (i: string) => RU_INNER_INTERVAL[i] ?? i;

const normalizeMsgRu = (msg: string) => {
    let s = String(msg ?? "");

    // поля/пути -> русские названия
    s = s.replaceAll("filter_dict.dates", "фильтр «Дата»");
    s = s.replaceAll("filter_dict.users", "фильтр «Операторы»");
    s = s.replaceAll("filter_dict.phones", "фильтр «Телефон»");
    s = s.replaceAll("filter_dict.length", "фильтр «Длительность»");
    s = s.replaceAll("filter_dict.comments", "фильтр «Комментарий»");
    s = s.replaceAll("filter_dict.projects", "фильтр «Проект»");
    s = s.replaceAll("filter_dict", "фильтры");

    // параметры -> русские названия
    s = s.replace(/\bmodify\b/g, "Преобразование");
    s = s.replace(/\brange\b/g, "диапазон значений");
    s = s.replace(/\btype_\b/g, "тип");
    s = s.replace(/\binterval\b/g, "интервал");

    // значения интервалов -> русские
    s = s.replace(/'minute'|"minute"|\bminute\b/g, "Минута");
    s = s.replace(/'hour'|"hour"|\bhour\b/g, "Час");
    s = s.replace(/'day'|"day"|\bday\b/g, "День");
    s = s.replace(/'week'|"week"|\bweek\b/g, "Неделя");
    s = s.replace(/'month'|"month"|\bmonth\b/g, "Месяц");

    return s;
};

/** ===== RU errors (axios) ===== */
const extractPydantic422Msg = (err: unknown): string | null => {
    if (!axios.isAxiosError(err)) return null;
    const status = err.response?.status;
    const data: any = err.response?.data;

    if (status === 422 && data?.detail) {
        if (Array.isArray(data.detail)) {
            const msgs = data.detail.map((d: any) => d?.msg).filter(Boolean).map(normalizeMsgRu);
            if (msgs.length) return msgs.join("\n");
        }
        if (typeof data.detail === "string") return normalizeMsgRu(data.detail);
    }
    return null;
};

const humanizeAxiosErrorRu = (err: unknown): string => {
    const pyd = extractPydantic422Msg(err);
    if (pyd) return pyd;

    if (axios.isAxiosError(err)) {
        const status = err.response?.status;

        if (!status) {
            return "Не удалось связаться с сервером. Проверьте интернет/VPN и повторите.";
        }
        if (status === 401) return "Сессия истекла или нет доступа (401). Перезайдите в систему.";
        if (status === 403) return "Недостаточно прав для выполнения операции (403).";
        if (status === 404) return "Запрошенный ресурс не найден (404).";
        if (status >= 500) return "Ошибка сервера. Попробуйте позже.";

        const data: any = err.response?.data;
        if (typeof data?.message === "string") return normalizeMsgRu(data.message);
        if (typeof data === "string") return normalizeMsgRu(data);
        if (typeof err.message === "string" && err.message) return `Ошибка запроса: ${normalizeMsgRu(err.message)}`;

        return `Ошибка запроса (HTTP ${status}).`;
    }

    if (err instanceof Error) return normalizeMsgRu(err.message);
    return "Неизвестная ошибка.";
};

/** ===== date utils ===== */
const pad2 = (n: number) => String(n).padStart(2, "0");
const formatLocalYMD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const PRESETS = new Set(["today", "yesterday", "this_week", "last_week", "this_month", "last_month"]);

const parseYMDLocal = (s: string): Date | null => {
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(y, mo - 1, d);
};

const startOfIsoWeekMonday = (date: Date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay(); // 0..6 (Sun..Sat)
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
};

const endOfPrevMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 0);

const daysInclusive = (start: Date, end: Date) => {
    const s = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
    const e = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
    return Math.floor((e - s) / 86400000) + 1;
};

const resolveDatePresetToRange = (preset: string): { start: Date; end: Date } | null => {
    const today = new Date();
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    switch (preset) {
        case "today":
            return { start: t, end: t };
        case "yesterday": {
            const y = new Date(t);
            y.setDate(y.getDate() - 1);
            return { start: y, end: y };
        }
        case "this_week": {
            const start = startOfIsoWeekMonday(t);
            return { start, end: t };
        }
        case "last_week": {
            const thisMon = startOfIsoWeekMonday(t);
            const start = new Date(thisMon);
            start.setDate(start.getDate() - 7);
            const end = new Date(start);
            end.setDate(end.getDate() + 6);
            return { start, end };
        }
        case "this_month": {
            const start = new Date(t.getFullYear(), t.getMonth(), 1);
            return { start, end: t };
        }
        case "last_month": {
            const end = endOfPrevMonth(t);
            const start = new Date(end.getFullYear(), end.getMonth(), 1);
            return { start, end };
        }
        default:
            return null;
    }
};

const parseDatesEntryToRange = (
    entry: string
): { start: Date; end: Date; kind: "range" | "single" | "preset" } | null => {
    const s = (entry || "").trim();

    // explicit range: "YYYY-MM-DD TO YYYY-MM-DD"
    if (s.includes(" TO ")) {
        const parts = s.split(" TO ").map((x) => x.trim());
        if (parts.length !== 2) return null;
        const a = parseYMDLocal(parts[0]);
        const b = parseYMDLocal(parts[1]);
        if (!a || !b) return null;
        return a <= b ? { start: a, end: b, kind: "range" } : { start: b, end: a, kind: "range" };
    }

    // single date
    const single = parseYMDLocal(s);
    if (single) return { start: single, end: single, kind: "single" };

    // preset
    if (PRESETS.has(s)) {
        const r = resolveDatePresetToRange(s);
        if (!r) return null;
        return { ...r, kind: "preset" };
    }

    return null;
};

/** ===== backend rules (по доке) ===== */
const RANGE_ALLOWED_CHARTS = new Set(["arrived", "accepted", "outbound_attempts", "outbound_calls", "lost"]);

const formatModifyLabel = (m: ModifyValue) => {
    if (typeof m === "string") {
        if (m === "sum") return "Сумма";
        if (m === "average") return "Среднее";
        return "Без преобразования";
    }

    const innerName =
        m.interval === "day" ? "по дням недели" :
            m.interval === "hour" ? "по часам" :
                "по минутам";

    const rangeHuman = formatInnerRangeHuman(m.interval, m.range);

    return `Среднее (внутри: ${innerName}, ${rangeHuman})`;
};

const WEEKDAY_RU: Record<string, string> = {
    Monday: "Пн",
    Tuesday: "Вт",
    Wednesday: "Ср",
    Thursday: "Чт",
    Friday: "Пт",
    Saturday: "Сб",
    Sunday: "Вс",
};

const groupConsecutive = (nums: number[]): Array<[number, number]> => {
    if (!nums.length) return [];
    const res: Array<[number, number]> = [];
    let start = nums[0], prev = nums[0];
    for (let i = 1; i < nums.length; i++) {
        const cur = nums[i];
        if (cur === prev + 1) { prev = cur; continue; }
        res.push([start, prev]);
        start = cur; prev = cur;
    }
    res.push([start, prev]);
    return res;
};

const formatInnerRangeHuman = (inner: InnerInterval, range: string[]) => {
    if (inner === "day") {
        const order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
        const idxs = Array.from(new Set(range.map((d) => order.indexOf(d)).filter((i) => i >= 0))).sort((a,b)=>a-b);
        if (!idxs.length) return "не выбрано";
        if (idxs.length === 7) return "все";
        const parts = groupConsecutive(idxs).map(([a,b]) => {
            const A = WEEKDAY_RU[order[a]] ?? order[a];
            const B = WEEKDAY_RU[order[b]] ?? order[b];
            return a === b ? A : `${A}–${B}`;
        });
        return parts.join(", ");
    }

    const max = inner === "hour" ? 23 : 59;
    const nums = Array.from(new Set(range.map((v)=>Number(v)).filter((n)=>Number.isInteger(n)&&n>=0&&n<=max))).sort((a,b)=>a-b);
    if (!nums.length) return "не выбрано";
    if (nums.length === max + 1) return "все";
    const parts = groupConsecutive(nums).map(([a,b]) => {
        const A = pad2(a);
        const B = pad2(b);
        return a === b ? A : `${A}–${B}`;
    });
    return parts.join(", ");
};

const validateLongIntervalDates = (main: "week" | "month", entry: string): string | null => {
    const parsed = parseDatesEntryToRange(entry);
    if (!parsed) return "Неверный формат даты. Нужен пресет или диапазон вида: YYYY-MM-DD TO YYYY-MM-DD.";

    // особое правило из доки
    if (main === "week" && entry.trim() === "this_month") {
        const today = new Date();
        if (today.getDate() < 14) {
            return `Для основного интервала ${q("Неделя")} при пресете «Этот месяц» должно пройти не менее 14 дней (не менее 2 недель).`;
        }
    }

    const len = daysInclusive(parsed.start, parsed.end);

    if (main === "week") {
        if (len < 14) {
            return `Для основного интервала ${q("Неделя")} и внутренних интервалов ${q("по дням недели")} или ${q("по часам")} диапазон дат должен быть не меньше 14 дней.`;
        }
        if (parsed.kind === "range" && parsed.start.getDay() !== 1) {
            return `Для основного интервала ${q("Неделя")} дата начала диапазона должна быть понедельником.`;
        }
    }

    if (main === "month") {
        if (len < 59) {
            return `Для основного интервала ${q("Месяц")} и внутренних интервалов ${q("по дням недели")} или ${q("по часам")} диапазон дат должен быть не меньше 59 дней (примерно 2 месяца).`;
        }
        if (parsed.kind === "range" && parsed.start.getDate() !== 1) {
            return `Для основного интервала ${q("Месяц")} дата начала диапазона должна быть первым днём месяца.`;
        }
    }

    return null;
};

const validateModifyObject = (main: MainInterval, modify: ModifyObject): string | null => {
    if (modify.type_ !== "average") return "В объекте «Преобразование» тип может быть только «среднее».";
    if (!Array.isArray(modify.range) || modify.range.length === 0) return "В объекте «Преобразование» диапазон значений не может быть пустым.";

    // правила основного/внутреннего интервала (по доке)
    if (main === "hour" && modify.interval !== "minute") {
        return `Для основного интервала ${q("Час")} расчёт идёт только по среднеминутным значениям → внутренний интервал может быть только ${q("по минутам")}.`;
    }
    if (main === "day" && modify.interval !== "hour") {
        return `Для основного интервала ${q("День")} расчёт идёт только по среднечасовым значениям → внутренний интервал может быть только ${q("по часам")}.`;
    }
    if (main === "week" && !(modify.interval === "day" || modify.interval === "hour")) {
        return `Для основного интервала ${q("Неделя")} внутренний интервал может быть только ${q("по дням недели")} или ${q("по часам")}.`;
    }
    if (main === "month" && !(modify.interval === "day" || modify.interval === "hour")) {
        return `Для основного интервала ${q("Месяц")} внутренний интервал может быть только ${q("по дням недели")} или ${q("по часам")}.`;
    }

    // range values validation
    if (modify.interval === "minute") {
        const ok = modify.range.every((v) => {
            const n = Number(v);
            return Number.isInteger(n) && n >= 0 && n <= 59;
        });
        if (!ok) return "Для внутреннего интервала «по минутам» значения должны быть от 0 до 59.";
    }

    if (modify.interval === "hour") {
        const ok = modify.range.every((v) => {
            const n = Number(v);
            return Number.isInteger(n) && n >= 0 && n <= 23;
        });
        if (!ok) return "Для внутреннего интервала «по часам» значения должны быть от 0 до 23.";
    }

    if (modify.interval === "day") {
        const ok = modify.range.every((v) => (WEEKDAYS as readonly string[]).includes(v as any));
        if (!ok) return "Для внутреннего интервала «по дням недели» нужно выбрать дни недели (Пн–Вс).";
    }

    return null;
};

const validateChartRequest = (args: {
    mainInterval: MainInterval;
    chart: string;
    modify: ModifyValue;
    filter_dict: any;
}): string | null => {
    const { mainInterval, chart, modify, filter_dict } = args;

    if (!chart) return "Выберите тип графика.";

    // Валидация дат (форматы из доки)
    const datesAny = filter_dict?.dates;
    if (Array.isArray(datesAny)) {
        const bad = datesAny.find((d) => !parseDatesEntryToRange(String(d)));
        if (bad) {
            return "Неверный формат даты. Допустимые пресеты: today/yesterday/this_week/last_week/this_month/last_month или диапазон: YYYY-MM-DD TO YYYY-MM-DD.";
        }
    }

    // operator_speed требует операторов (по доке)
    if (chart === "operator_speed") {
        const ops = filter_dict?.users;
        if (!Array.isArray(ops) || ops.length === 0) {
            return "Для графика «Скорость работы операторов» нужно выбрать операторов в фильтре «Операторы».";
        }
    }

    // Для Недели/Месяца преобразование должно быть объектом (по доке)
    if (typeof modify === "string") {
        if (mainInterval === "week" || mainInterval === "month") {
            return `Для основного интервала ${q(mainRu(mainInterval))} «Преобразование» должно быть в режиме «Среднее по подинтервалам» (объект).`;
        }
        return null;
    }

    // modify объект — только для нужных графиков
    if (!RANGE_ALLOWED_CHARTS.has(chart)) {
        return "Режим «Среднее по подинтервалам» доступен только для графиков: Поступило, Принято, Исходящие попытки, Исходящие соединения, Пропущено.";
    }

    // dates строго 1 строка, если modify — объект
    const dates = filter_dict?.dates;
    if (!Array.isArray(dates) || dates.length !== 1) {
        return "Если выбрано «Среднее по подинтервалам», в фильтре «Дата» должен быть строго один период (один пресет или один диапазон).";
    }

    // validate modify object itself
    const errMod = validateModifyObject(mainInterval, modify);
    if (errMod) return errMod;

    // week/month доп правила дат
    if (mainInterval === "week" || mainInterval === "month") {
        const errDates = validateLongIntervalDates(mainInterval, String(dates[0]));
        if (errDates) return errDates;
    }

    return null;
};

/** ===== charts: normalize + naming ===== */
const isPlainObject = (v: any): v is Record<string, any> =>
    typeof v === "object" && v !== null && !Array.isArray(v);

const isMainInterval = (v: any): v is MainInterval =>
    ["minute", "hour", "day", "week", "month"].includes(String(v));

const fullRangeForInner = (inner: InnerInterval): string[] => {
    if (inner === "minute") return Array.from({ length: 60 }, (_, i) => String(i));
    if (inner === "hour") return Array.from({ length: 24 }, (_, i) => String(i));
    return ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
};

const normalizeTemplateModify = (main: MainInterval, raw: any): ModifyValue => {
    // строка
    if (raw === "sum" || raw === "average" || raw === "none") {
        // week/month по доке требуют объект
        if (main === "week" || main === "month") {
            return { type_: "average", interval: "hour", range: fullRangeForInner("hour") };
        }
        return raw;
    }

    // объект
    if (isPlainObject(raw)) {
        let inner: InnerInterval = raw.interval;
        if (inner !== "minute" && inner !== "hour" && inner !== "day") {
            inner = main === "hour" ? "minute" : main === "day" ? "hour" : "hour";
        }

        // фикс по доке
        if (main === "hour") inner = "minute";
        if (main === "day") inner = "hour";
        if ((main === "week" || main === "month") && inner === "minute") inner = "hour";

        const rangeRaw = Array.isArray(raw.range) ? raw.range.map(String) : [];
        const range = rangeRaw.length ? rangeRaw : fullRangeForInner(inner);

        return { type_: "average", interval: inner, range };
    }

    // если вообще нет modify
    if (main === "week" || main === "month") {
        return { type_: "average", interval: "hour", range: fullRangeForInner("hour") };
    }
    return "none";
};

const templateToChartConfigs = (tpl: ReportTemplate): ChartConfig[] => {
    const interval: MainInterval = isMainInterval(tpl.default_interval) ? tpl.default_interval : "hour";
    const chartsObj = isPlainObject(tpl.charts) ? tpl.charts : {};

    return Object.entries(chartsObj).map(([chartId, cfgAny], idx) => {
        const cfg = isPlainObject(cfgAny) ? cfgAny : {};

        const line = String(cfg.line || cfg.type || cfg.chart_type || "Линия");
        const color = String(cfg.color || DEFAULT_SERIES_COLORS[idx % DEFAULT_SERIES_COLORS.length]);

        const modify = normalizeTemplateModify(interval, cfg.modify);

        const baseName = dataOptions.find((i) => i.id === chartId)?.name ?? chartId;
        const caption = String(cfg.caption || cfg.name || `${baseName} (${formatModifyLabel(modify)})`);

        return {
            id: crypto.randomUUID(),
            data: chartId,
            modify,
            interval,
            line,
            color,
            caption,
        };
    });
};

const toNumberSafe = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

type NormalizedSeries = {
    seriesKey: string;
    labels: Array<string | number>;
    values: number[];
};

const normalizeChartToSeries = (chart: any): NormalizedSeries[] => {
    const labels = chart?.labels;
    const data = chart?.data;

    // 1) обычный вариант: labels[] + data[]
    if (Array.isArray(labels) && Array.isArray(data)) {
        return [{ seriesKey: "", labels, values: data.map(toNumberSafe) }];
    }

    // 2) labels object + data object (мультисериально)
    if (isPlainObject(labels) && isPlainObject(data)) {
        const keys = Array.from(new Set([...Object.keys(labels), ...Object.keys(data)]));

        return keys.map((k) => {
            const l = Array.isArray(labels[k]) ? labels[k] : [];
            const d = Array.isArray(data[k]) ? data[k] : [];
            const min = Math.min(l.length, d.length);
            return {
                seriesKey: k,
                labels: l.slice(0, min),
                values: d.slice(0, min).map(toNumberSafe),
            };
        });
    }

    // 3) labels[] + data object => общие X для всех серий
    if (Array.isArray(labels) && isPlainObject(data)) {
        const keys = Object.keys(data);
        return keys.map((k) => {
            const d = Array.isArray(data[k]) ? data[k] : [];
            const min = Math.min(labels.length, d.length);
            return {
                seriesKey: k,
                labels: labels.slice(0, min),
                values: d.slice(0, min).map(toNumberSafe),
            };
        });
    }

    // 4) labels object + data[] (редко) => берём первую метку
    if (isPlainObject(labels) && Array.isArray(data)) {
        const firstKey = Object.keys(labels)[0] ?? "";
        const l = Array.isArray(labels[firstKey]) ? labels[firstKey] : [];
        const min = Math.min(l.length, data.length);
        return [{ seriesKey: firstKey, labels: l.slice(0, min), values: data.slice(0, min).map(toNumberSafe) }];
    }

    return [];
};

const formatServiceLevelKeyRu = (k: string) => {
    // "0_10" => "0–10 сек", "60_" => "60+ сек"
    const m = String(k).match(/^(\d+)_+(\d+)?$/);
    if (m) {
        const a = m[1];
        const b = m[2];
        if (b) return `${a}–${b} сек`;
        return `${a}+ сек`;
    }
    return String(k);
};

const seriesNameRu = (chartId: string, seriesKey: string) => {
    const key = String(seriesKey ?? "").trim();
    if (!key) return "";

    if (chartId === "operator_speed") return `Оператор ${key}`;
    if (chartId === "service_levels") return formatServiceLevelKeyRu(key);

    return key;
};

const DEFAULT_SERIES_COLORS = [
    "#e66464",
    "#6f95ff",
    "#2dbf6a",
    "#f5a623",
    "#bd10e0",
    "#50e3c2",
    "#b8e986",
    "#7ed321",
];

const pickSeriesColor = (base: string, idx: number, total: number) => {
    if (total <= 1) return base || "#e66464";
    const baseNorm = (base || "").toLowerCase();
    const pool = [base || "#e66464", ...DEFAULT_SERIES_COLORS.filter((c) => c.toLowerCase() !== baseNorm)];
    return pool[idx % pool.length];
};

type ReportTemplate = {
    id: number;
    glagol_parent: string;
    project?: string | null;
    name: string;
    description?: string | null;
    charts: Record<string, any>;
    default_interval: MainInterval;
    created_dt?: string;
    modified_dt?: string;
};

export const Filters = () => {
    const [filters, setFilters] = useState<any[]>([]);
    const [activeFilters, setActiveFilters] = useState<FilterItem[]>([]);
    const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
    const [reportList, setReportList] = useState<any[]>([]);
    const [selectedReport, setSelectedReport] = useState<any>(null);

    const [projectPool, setProjectPool] = useState<any[]>([]);
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [totalCount, setTotalCount] = useState(0);

    const [fieldsData, setFieldsData] = useState(null);
    const [reports, setReports] = useState([]);

    const [selectedType, setSelectedType] = useState("Список вызовов");
    const [table, setTable] = useState<boolean>(false);

    const [interval, setinterval] = useState<string>("hour");
    const [data, setData] = useState<string>("");
    const [line, setLine] = useState<string>("Линия");

    // строковый modify
    const [modify, setModify] = useState<string>("none");

    const [color, setColor] = useState("#e66464");

    // ✅ новые: режим и параметры modify-объекта
    const [modifyMode, setModifyMode] = useState<ModifyMode>("string");
    const [modifyObjInner, setModifyObjInner] = useState<InnerInterval>("hour");
    const [modifyObjRange, setModifyObjRange] = useState<string[]>([]);

    const [charts, setCharts] = useState<MyChartData[]>([]);
    const [chartConfigs, setChartConfigs] = useState<ChartConfig[]>([]);

    // ✅ сюда складываем понятные сообщения, если какие-то графики не обновились
    const [chartErrorText, setChartErrorText] = useState("");

    // ✅ templates
    const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState("");
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

    const { glagolParent = "" } = store.getState().credentials;

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

                case "date": {
                    if (value.preset === "custom" && value.start && value.end) {
                        let startStr = formatLocalYMD(value.start);
                        let endStr = formatLocalYMD(value.end);
                        if (startStr > endStr) {
                            const tmp = startStr;
                            startStr = endStr;
                            endStr = tmp;
                        }
                        if (!result.dates) result.dates = [];
                        if (startStr === endStr) result.dates.push(startStr);
                        else result.dates.push(`${startStr} TO ${endStr}`);
                    } else if (value.preset) {
                        if (!result.dates) result.dates = [];
                        result.dates.push(value.preset);
                    }
                    break;
                }

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

    const filter_dict = useMemo(() => buildFilterJson(activeFilters), [activeFilters]);

    const singleProjectForTemplates = useMemo(() => {
        const projs = filter_dict?.projects;
        if (!Array.isArray(projs) || projs.length !== 1) return "";
        const p = projs[0];
        return typeof p?.project_name === "string" ? p.project_name : "";
    }, [filter_dict]);

    const applyTemplateById = async (templateId: string) => {
        setSelectedTemplateId(templateId);

        if (!templateId) {
            // очистка
            setChartConfigs([]);
            setCharts([]);
            setChartErrorText("");
            return;
        }

        const tpl = reportTemplates.find((t) => String(t.id) === String(templateId));
        if (!tpl) return;

        // выставим интервал из шаблона (по доке default_interval)
        setinterval(tpl.default_interval);

        const nextConfigs = templateToChartConfigs(tpl);

        setChartConfigs(nextConfigs);
        setCharts([]);
        setChartErrorText("");

        await rebuildCharts(nextConfigs);
    };

    const templateOptions = useMemo(
        () => reportTemplates.map((t) => ({ id: String(t.id), name: t.name })),
        [reportTemplates]
    );

    const fetchTemplates = async () => {
        setTemplatesLoading(true);
        setTemplatesError("");

        try {
            const params: any = { glagol_parent: glagolParent };
            if (singleProjectForTemplates) params.project = singleProjectForTemplates;

            const res = await axios.get("/api/v1/communications/report_templates/", { params });
            setReportTemplates(Array.isArray(res.data) ? res.data : []);
        } catch (e) {
            setReportTemplates([]);
            setTemplatesError(humanizeAxiosErrorRu(e));
        } finally {
            setTemplatesLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [glagolParent, singleProjectForTemplates]);

    const fixDatesToSingle = () => {
        const dateFilters = activeFilters.filter((f) => f.fieldId === "date");
        if (dateFilters.length <= 1) return;
        const first = dateFilters[0];
        const withoutDates = activeFilters.filter((f) => f.fieldId !== "date");
        setActiveFilters([...withoutDates, first]);
    };

    const buildModifyForReq = (mainInterval: MainInterval): ModifyValue => {
        // week/month — modify строго объект (по доке)
        if (mainInterval === "week" || mainInterval === "month") {
            const inner: InnerInterval = modifyObjInner === "minute" ? "day" : modifyObjInner; // минуту не даём при week/month
            return {
                type_: "average",
                interval: inner,
                range: modifyObjRange,
            };
        }

        // minute — только строка
        if (mainInterval === "minute") {
            return (modify as "sum" | "average" | "none") || "none";
        }

        // hour/day — либо строка, либо объект
        if (modifyMode === "object") {
            const inner: InnerInterval = mainInterval === "hour" ? "minute" : "hour";
            return {
                type_: "average",
                interval: inner,
                range: modifyObjRange,
            };
        }

        return (modify as "sum" | "average" | "none") || "none";
    };

    // ✅ авто-приведение состояний к доке
    useEffect(() => {
        const main = interval as MainInterval;

        // Неделя/Месяц => object-mode
        if (main === "week" || main === "month") {
            if (modifyMode !== "object") setModifyMode("object");
            if (modifyObjInner === "minute") setModifyObjInner("day");
            return;
        }

        // Минута => string-mode
        if (main === "minute") {
            if (modifyMode !== "string") setModifyMode("string");
            return;
        }

        // если график не поддерживает object-mode и это не week/month — выключаем object
        if (modifyMode === "object" && data && !RANGE_ALLOWED_CHARTS.has(data)) {
            setModifyMode("string");
        }

        // для hour/day — фиксируем inner по доке
        if (modifyMode === "object") {
            if (main === "hour" && modifyObjInner !== "minute") setModifyObjInner("minute");
            if (main === "day" && modifyObjInner !== "hour") setModifyObjInner("hour");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [interval, data, modifyMode]);

    const currentModifyForReq = useMemo(() => buildModifyForReq(interval as MainInterval), [
        interval,
        modifyMode,
        modify,
        modifyObjInner,
        modifyObjRange,
    ]);

    const currentValidationError = useMemo(() => {
        if (!data) return null;
        return validateChartRequest({
            mainInterval: interval as MainInterval,
            chart: data,
            modify: currentModifyForReq,
            filter_dict,
        });
    }, [interval, data, currentModifyForReq, filter_dict]);

    const showFixDatesButton = useMemo(() => {
        // по доке: если modify объект — dates строго одна строка
        const needStrict = typeof currentModifyForReq !== "string";
        const dates = filter_dict?.dates;
        return needStrict && Array.isArray(dates) && dates.length > 1;
    }, [currentModifyForReq, filter_dict]);

    const buildRequestPayload = (cfg: ChartConfig, timezone_offset: number) => {
        const req: any = {
            filter_dict,
            interval: cfg.interval,
            modify: cfg.modify,
            chart: cfg.data,
            timezone_offset,
        };

        // по доке: operator_speed требует operators
        if (cfg.data === "operator_speed" && Array.isArray(filter_dict?.users)) {
            req.operators = filter_dict.users;
        }

        return req;
    };

    const rebuildCharts = async (configsOverride?: ChartConfig[]) => {
        const timezone_offset = -new Date().getTimezoneOffset() / 60;
        const cfgs = configsOverride ?? chartConfigs;

        const newCharts: MyChartData[] = [];
        const problems: string[] = [];

        for (const cfg of cfgs) {
            try {
                const err = validateChartRequest({
                    mainInterval: cfg.interval,
                    chart: cfg.data,
                    modify: cfg.modify,
                    filter_dict,
                });

                if (err) {
                    problems.push(`${cfg.caption}: ${err}`);
                    continue;
                }

                const req = buildRequestPayload(cfg, timezone_offset);
                const res = await axios.post("/api/v1/communications/charts", req);

                const baseName = dataOptions.find((i) => i.id === cfg.data)?.name ?? cfg.data;
                const seriesList = normalizeChartToSeries(res.data?.chart);

                if (!seriesList.length) {
                    problems.push(`${cfg.caption}: Сервер вернул данные в неожиданном формате.`);
                    continue;
                }

                seriesList.forEach((s, idx) => {
                    const suffix = seriesNameRu(cfg.data, s.seriesKey);
                    const label = `${baseName}${suffix ? ` — ${suffix}` : ""} (${formatModifyLabel(cfg.modify)})`;

                    const seriesColor = pickSeriesColor(cfg.color, idx, seriesList.length);

                    newCharts.push({
                        label,
                        color: seriesColor,
                        type: cfg.line === "Гистограмма" ? "bar" : "line",
                        data: s.labels.map((x, i) => ({ x: String(x), y: toNumberSafe(s.values[i]) })),
                        configId: cfg.id,
                        seriesKey: s.seriesKey,
                    });
                });
            } catch (e) {
                problems.push(`${cfg.caption}: ${humanizeAxiosErrorRu(e)}`);
            }
        }

        setCharts(newCharts);

        if (problems.length) {
            const head = problems.slice(0, 3).join("\n");
            const tail = problems.length > 3 ? `\n…и ещё ${problems.length - 3}` : "";
            setChartErrorText(head + tail);
        } else {
            setChartErrorText("");
        }
    };

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedReport) return;

            const glagol_parent = glagolParent;
            const sysProjects: string[] = Array.isArray(selectedReport.project_names)
                ? selectedReport.project_names
                    .map((glagolName: string) => projectPool.find((p: any) => p.glagol_name === glagolName)?.project_name)
                    .filter(Boolean)
                : [];

            const callId = selectedReport.id;

            try {
                const projectFieldsPromise = sysProjects.length
                    ? axios.get("/api/v1/project_fields", {
                        params: { glagol_parent, projects: sysProjects },
                        paramsSerializer: (params) => {
                            const searchParams = new URLSearchParams();
                            searchParams.append("glagol_parent", params.glagol_parent);
                            params.projects.forEach((p: string) => searchParams.append("projects", p));
                            return searchParams.toString();
                        },
                    })
                    : Promise.resolve({ data: null });

                const relatedCallsPromise = axios.get(`/api/v1/communications/list/${callId}`);

                const [projectFieldsRes, relatedCallsRes] = await Promise.all([projectFieldsPromise, relatedCallsPromise]);

                setFieldsData(projectFieldsRes.data || null);
                setReports(relatedCallsRes.data?.communications || []);
            } catch (err) {
                setSelectedReport(null);
                console.error("Ошибка при загрузке данных по selectedReport:", err);
            }
        };

        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedReport]);

    useEffect(() => {
        async function fetchFilters() {
            try {
                const response = await axios.get("/api/v1/communications/filters");
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
                    if (filters.some((f) => f.name === value)) return "Фильтр с таким именем уже существует";
                    return null;
                },
            });

            if (!name) return;

            try {
                await axios.post("/api/v1/communications/filters/create", {
                    name,
                    glagol_parent: glagolParent,
                    filter_json,
                });
            } catch (err) {
                Swal.fire("Ошибка", humanizeAxiosErrorRu(err), "error");
            }
        } else {
            try {
                await axios.put("/api/v1/communications/filters/update", {
                    id: selectedFilterId,
                    name: filters.find((f) => f.id === selectedFilterId)?.name || "Без имени",
                    glagol_parent: glagolParent,
                    filter_json,
                });
            } catch (err) {
                Swal.fire("Ошибка", humanizeAxiosErrorRu(err), "error");
            }
        }
    };

    const deleteFilter = async () => {
        if (!selectedFilterId) return;

        const filterToDelete = filters.find((f) => f.id === selectedFilterId);
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

                setFilters((prev) => prev.filter((f) => f.id !== selectedFilterId));
                setSelectedFilterId(null);
                setActiveFilters([]);
            } catch (err) {
                Swal.fire("Ошибка", humanizeAxiosErrorRu(err), "error");
            }
        }
    };

    const fetchReport = async (pageNumber = 1) => {
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
            const projectsPool = response.data.projects;
            setProjectPool(projectsPool);
            setReportList([report]);
            setPage(pageNumber);

            await rebuildCharts();

            if (response.data.total_count) {
                setTotalCount(response.data.total_count);
            }
            setSelectedReport(null);
        } catch (error) {
            Swal.fire("Ошибка", humanizeAxiosErrorRu(error), "error");
        }
    };

    const downloadXLSX = async () => {
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

            const blob = new Blob([response.data], { type: "application/zip" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "report.zip";
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            Swal.fire("Ошибка", humanizeAxiosErrorRu(error), "error");
        }
    };

    const downloadMP3 = async () => {
        try {
            const response = await axios.post(
                "/api/v1/communications/report/audio",
                {
                    glagol_parent: glagolParent,
                    filter_dict,
                    limit: totalCount,
                },
                { responseType: "blob" }
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
            Swal.fire("Ошибка", humanizeAxiosErrorRu(error), "error");
        }
    };

    const getIntervalReports = () => setSelectedType("Интервальные отчёты");
    const getTableReports = () => setSelectedType("Список вызовов");

    const getInfo = async () => {
        const timezone_offset = -new Date().getTimezoneOffset() / 60;
        const mainInterval = interval as MainInterval;

        const modifyForReq = buildModifyForReq(mainInterval);

        const err = validateChartRequest({
            mainInterval,
            chart: data,
            modify: modifyForReq,
            filter_dict,
        });

        if (err) {
            Swal.fire("Ошибка", err, "error");
            return;
        }

        try {
            const req: any = {
                filter_dict,
                interval: mainInterval,
                modify: modifyForReq,
                chart: data,
                timezone_offset,
            };

            if (data === "operator_speed" && Array.isArray(filter_dict?.users)) {
                req.operators = filter_dict.users;
            }

            // делаем запрос один раз — проверка/ошибка сразу, а потом добавляем конфиг
            await axios.post("/api/v1/communications/charts", req);

            const dataName = dataOptions.find((i) => i.id === data)?.name ?? data;

            const newConfig: ChartConfig = {
                id: crypto.randomUUID(),
                data,
                modify: modifyForReq,
                interval: mainInterval,
                line,
                color,
                caption: `${dataName} (${formatModifyLabel(modifyForReq)})`,
            };

            // ✅ если добавляем другой interval — старые выкидываем (как у тебя было по логике)
            const kept = chartConfigs.filter((cfg) => cfg.interval === mainInterval);
            const nextConfigs = [...kept, newConfig];

            setChartConfigs(nextConfigs);
            setChartErrorText("");

            await rebuildCharts(nextConfigs);
        } catch (err2) {
            Swal.fire("Ошибка", humanizeAxiosErrorRu(err2), "error");
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
                <button
                    className="btn btn-outline-success"
                    style={selectedType === "Интервальные отчёты" ? { backgroundColor: "#0BB918", color: "white" } : {}}
                    onClick={getIntervalReports}
                >
                    Интервальные отчёты
                </button>
                <button
                    className="btn btn-outline-success"
                    style={selectedType === "Список вызовов" ? { backgroundColor: "#0BB918", color: "white" } : {}}
                    onClick={getTableReports}
                >
                    Список вызовов
                </button>
            </div>
        );
    };

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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
                <button
                    className={`btn btn-outline-info ${selectedFilterId === null ? "active" : ""}`}
                    onClick={() => {
                        setActiveFilters([]);
                        setSelectedFilterId(null);
                    }}
                >
                    Новый фильтр
                </button>
                {filters.map((f) => (
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

            <FilterFields activeFilters={activeFilters} setActiveFilters={setActiveFilters} />
            {renderButtons()}

            <div style={{ borderTop: "1px solid #dee2e6", width: "100%" }} />

            {reportList.length !== 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {renderDownloadButtons()}

                    {selectedType === "Список вызовов" ? (
                        <div>
                            <div className="row mb-2">
                                <div className="col d-flex justify-content-center align-items-center">
                                    <button className="btn btn-light mr-3" disabled={page === 1} onClick={() => fetchReport(page - 1)}>
                                        &lt;
                                    </button>
                                    <span style={{ minWidth: "90px", textAlign: "center" }}>
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

                            <div style={{ display: "flex", flexDirection: "row", gap: 16 }}>
                                <div style={{ flex: 6 }}>
                                    <ReportList reportList={reportList[0]} setSelectedReport={setSelectedReport} />
                                </div>
                                {selectedReport && (
                                    <div style={{ flex: 3 }}>
                                        <ReportCard selectedReport={selectedReport} fieldsData={fieldsData} reports={reports} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
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
                            modifyMode={modifyMode}
                            setModifyMode={setModifyMode}
                            modifyObjInner={modifyObjInner}
                            setModifyObjInner={setModifyObjInner}
                            modifyObjRange={modifyObjRange}
                            setModifyObjRange={setModifyObjRange}
                            validationError={data ? currentValidationError : null}
                            showFixDatesButton={showFixDatesButton}
                            onFixDatesToSingle={fixDatesToSingle}
                            chartErrorText={chartErrorText}
                            onDeleteChartConfig={async (configId: string) => {
                                const next = chartConfigs.filter((c) => c.id !== configId);
                                setChartConfigs(next);
                                setCharts((prev) => prev.filter((ch) => ch.configId !== configId));
                                await rebuildCharts(next);
                            }}
                            templateOptions={templateOptions}
                            selectedTemplateId={selectedTemplateId}
                            onSelectTemplate={applyTemplateById}
                            onReloadTemplates={fetchTemplates}
                            templatesLoading={templatesLoading}
                            templatesError={templatesError}
                        />
                    )}
                </div>
            )}
        </div>
    );
};
