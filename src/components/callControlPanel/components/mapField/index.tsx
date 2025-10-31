import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    MapContainer,
    TileLayer,
    Marker,
    useMapEvents,
    AttributionControl,
    useMap,
} from "react-leaflet";
import L, { LatLngTuple, LeafletMouseEvent } from "leaflet";
import axios from "axios";
import { store } from "../../../../redux/store";
import "leaflet/dist/leaflet.css";

type Addr = Partial<{
    country: string;
    state: string;
    city: string;
    region: string;
    city_district: string;
    road: string;
    house_number: string;
    postcode: string;
}>;
type Item = {
    display_name?: string;
    lat?: number | string;
    lon?: number | string;
    address?: Addr;
};

export type MapFieldMapping = Partial<
    Record<
        | "lat"
        | "lon"
        | "country"
        | "state"
        | "city"
        | "city_district"
        | "road"
        | "house_number"
        | "postcode"
        | "q",
        string
    >
>;

type Props = {
    mapping: MapFieldMapping;
    initialValues?: Record<string, string>;
    onPatch: (patch: Record<string, string>) => void;
    readOnly?: boolean;
    compact?: boolean;
};

const START = { lat: 55.751244, lon: 37.618423 };

/** фиксим дефолтные иконки leaflet (пути к ассетам) */
const DefaultIcon = L.icon({
    iconUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl:
        "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
(L.Marker.prototype as any).options.icon = DefaultIcon;

/** Двигаем карту при смене center */
const ViewUpdater: React.FC<{
    center: LatLngTuple;
    zoom?: number;
    animate?: boolean;
}> = ({ center, zoom, animate }) => {
    const map = useMap();
    const first = useRef(true);
    useEffect(() => {
        const z = zoom ?? map.getZoom();
        if (first.current) {
            first.current = false;
            map.setView(center, z, { animate: false });
            return;
        }
        if (animate) map.flyTo(center, z, { duration: 0.7 });
        else map.setView(center, z);
    }, [center[0], center[1], zoom, animate, map]);
    return null;
};

/** Пересчёт размеров, если контейнер показывается/ресайзится */
const SizeFix: React.FC = () => {
    const map = useMap();
    useEffect(() => {
        const fix = () => map.invalidateSize();
        const ro = new ResizeObserver(fix);
        ro.observe(map.getContainer());
        fix();

        // если страница использует bootstrap/jQuery-аккордеоны/табы:
        const events = ["shown.bs.tab", "shown.bs.collapse"];
        events.forEach((ev) => document.addEventListener(ev, fix));
        window.addEventListener("resize", fix);

        return () => {
            ro.disconnect();
            events.forEach((ev) =>
                document.removeEventListener(ev, fix)
            );
            window.removeEventListener("resize", fix);
        };
    }, [map]);
    return null;
};

export default function MapField({
                                     mapping,
                                     initialValues = {},
                                     onPatch,
                                     readOnly,
                                     compact,
                                 }: Props) {
    const { glagolParent } = store.getState().credentials;

    const lat0 = useMemo(
        () => Number(initialValues[mapping.lat ?? ""]),
        [initialValues, mapping.lat]
    );
    const lon0 = useMemo(
        () => Number(initialValues[mapping.lon ?? ""]),
        [initialValues, mapping.lon]
    );

    const [center, setCenter] = useState<LatLngTuple>([
        Number.isFinite(lat0) ? lat0 : START.lat,
        Number.isFinite(lon0) ? lon0 : START.lon,
    ]);
    const [pos, setPos] = useState<LatLngTuple>([
        Number.isFinite(lat0) ? lat0 : START.lat,
        Number.isFinite(lon0) ? lon0 : START.lon,
    ]);

    const [q, setQ] = useState(() => (mapping.q && initialValues[mapping.q]) || "");
    const [status, setStatus] = useState("");

    const toNumber = (v: any) =>
        typeof v === "string" || typeof v === "number" ? Number(v) : NaN;

    const formatAddress = (src?: { address?: Addr } | Addr): string => {
        const a: Addr = (src && "address" in src ? (src as any).address : src) || {};
        return [
            a.country?.trim(),
            (a.state ?? a.region)?.trim(),
            a.city?.trim(),
            a.road?.trim(),
            a.house_number?.trim(),
        ].filter(Boolean).join(", ");
    };

    /** Втыкаем «антидот» стилей один раз в <head> */
    useEffect(() => {
        if (document.getElementById("leaflet-hotfix")) return;
        const style = document.createElement("style");
        style.id = "leaflet-hotfix";
        style.textContent = `
      .glMap .leaflet-container { overflow: hidden; }
      .glMap .leaflet-container .leaflet-marker-pane img,
      .glMap .leaflet-container .leaflet-shadow-pane img,
      .glMap .leaflet-container .leaflet-tile-pane img,
      .glMap .leaflet-container img.leaflet-image-layer,
      .glMap .leaflet-container .leaflet-tile {
        max-width: none !important;
        max-height: none !important;
        width: auto !important;
        height: auto !important;
        padding: 0 !important;
        border: 0 !important;
        box-sizing: content-box !important;
      }
      .glMap .leaflet-tile {
        width: 256px !important;
        height: 256px !important;
        position: absolute !important;
        left: 0; top: 0;
      }
      .glMap .leaflet-pane,
      .glMap .leaflet-tile-container,
      .glMap .leaflet-marker-icon,
      .glMap .leaflet-marker-shadow,
      .glMap .leaflet-pane > svg,
      .glMap .leaflet-pane > canvas,
      .glMap .leaflet-zoom-box,
      .glMap .leaflet-image-layer,
      .glMap .leaflet-layer {
        position: absolute !important; left: 0; top: 0;
      }
    `;
        document.head.appendChild(style);
    }, []);

    const apply = useCallback(
        (it: Item, saveQ?: string) => {
            const A: Addr = {
                ...((it as any)?.address || {}),
                ...(it as any)?.country ? { country: (it as any).country } : {},
                ...(it as any)?.state ? { state: (it as any).state } : {},
                ...(it as any)?.city ? { city: (it as any).city } : {},
                ...(it as any)?.city_district ? { city_district: (it as any).city_district } : {},
                ...(it as any)?.road ? { road: (it as any).road } : {},
                ...(it as any)?.house_number ? { house_number: (it as any).house_number } : {},
                ...(it as any)?.postcode ? { postcode: (it as any).postcode } : {},
            };
            const patch: Record<string, string> = {};
            if (mapping.lat) patch[mapping.lat] = it.lat != null ? String(it.lat) : "";
            if (mapping.lon) patch[mapping.lon] = it.lon != null ? String(it.lon) : "";
            if (mapping.country) patch[mapping.country] = A.country ?? "";
            if (mapping.state) patch[mapping.state] = (A.state ?? A.region) ?? "";
            if (mapping.city) patch[mapping.city] = A.city ?? "";
            if (mapping.city_district) patch[mapping.city_district] = A.city_district ?? "";
            if (mapping.road) patch[mapping.road] = A.road ?? "";
            if (mapping.house_number) patch[mapping.house_number] = A.house_number ?? "";
            if (mapping.postcode) patch[mapping.postcode] = A.postcode ?? "";
            if (mapping.q && saveQ != null) patch[mapping.q] = saveQ;
            onPatch(patch);
        },
        [mapping, onPatch]
    );

    const search = useCallback(
        async (query: string): Promise<Item[]> => {
            const { data } = await axios.get("/api/v1/location/search", {
                params: { glagol_parent: glagolParent, q: query },
            });
            let raw: any = data;
            if (raw && typeof raw === "object" && "data" in raw) raw = raw.data;
            let arr: any[] = [];
            if (Array.isArray(raw)) arr = raw;
            else if (Array.isArray(raw?.result)) arr = raw.result;
            else if (Array.isArray(data?.result)) arr = data.result;
            else if (raw && typeof raw === "object" && ("lat" in raw || "lon" in raw)) arr = [raw];
            else if (data && typeof data === "object" && ("lat" in data || "lon" in data)) arr = [data];

            return arr
                .map((x: any) => {
                    const lat = toNumber(x?.lat ?? x?.data?.lat);
                    const lon = toNumber(x?.lon ?? x?.data?.lon);
                    const display_name =
                        x?.display_name ?? x?.name ?? x?.formatted ?? x?.label ?? String(query);
                    const address: Addr | undefined = x?.address ?? x?.properties?.address;
                    return { lat, lon, display_name, address };
                })
                .filter(
                    (it) =>
                        Number.isFinite(Number(it.lat)) &&
                        Number.isFinite(Number(it.lon))
                );
        },
        [glagolParent]
    );

    const reverse = useCallback(
        async (lon: number, lat: number): Promise<Item> => {
            const { data } = await axios.get("/api/v1/location/reverse", {
                params: { glagol_parent: glagolParent, lon, lat },
            });
            const raw = data && typeof data === "object" && "data" in data ? data.data : data;

            let address: Addr | undefined = undefined;
            if (raw && typeof raw === "object") {
                if ("address" in raw) {
                    const a = (raw as any).address as Addr;
                    address = { ...a, state: a.state ?? a.region };
                } else {
                    const { country, state, region, city, city_district, road, house_number, postcode } = raw as any;
                    address = {
                        country,
                        region,
                        state: state ?? region, // NEW
                        city,
                        city_district,
                        road,
                        house_number,
                        postcode,
                    };
                }
            }
            return { lat, lon, address };
        },
        [glagolParent]
    );

    // значение q, пришедшее извне
    const propQ = useMemo(
        () => (mapping.q && initialValues[mapping.q]) || "",
        [initialValues, mapping.q]
    );

    // чтобы не крутиться по кругу
    const lastResolvedRef = useRef<string>("");
    const lastSearchedRef = useRef<string>("");

    // хелпер: поиск по произвольной строке (не из state q)
    const runSearchFor = useCallback(
        async (query: string) => {
            const qq = query.trim();
            if (!qq) return;
            setStatus("Поиск…");
            try {
                const [first] = await search(qq);
                if (!first) {
                    setStatus("Ничего не найдено");
                    return;
                }
                const lat = Number(first.lat),
                    lon = Number(first.lon);
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    setStatus("Ошибка координат");
                    return;
                }
                setPos([lat, lon]);
                setCenter([lat, lon]);
                try {
                    const info = await reverse(lon, lat);
                    const pretty = formatAddress(info) || first.display_name || qq;
                    setQ(pretty);
                    apply(info, pretty);
                } catch {
                    apply(first, qq);
                }
                setStatus("Готово");
            } catch {
                setStatus("Ошибка поиска");
            }
        },
        [apply, reverse, search]
    );

    // первичное заполнение из lat/lon
    useEffect(() => {
        if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
            (async () => {
                try {
                    const info = await reverse(lon0, lat0);
                    const pretty = formatAddress(info);
                    if (pretty) setQ(pretty);
                    apply(info, pretty || q);
                } catch {}
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        // 1) Приоритет: если есть валидные lat/lon
        if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
            const key = `${lon0},${lat0}`;
            setPos([lat0, lon0]);
            setCenter([lat0, lon0]);
            if (lastResolvedRef.current !== key) {
                lastResolvedRef.current = key;
                (async () => {
                    setStatus("Определяем адрес…");
                    try {
                        const info = await reverse(lon0, lat0);
                        const pretty = formatAddress(info);
                        setQ(pretty);
                        apply(info, pretty);
                        setStatus("Готово");
                    } catch {
                        apply({ lat: lat0, lon: lon0 }, undefined);
                        setStatus("");
                    }
                })();
            }
            return; // координаты важнее q
        }

        // 2) Иначе, если пришёл q → запускаем поиск (однократно на строку)
        const qq = (propQ || "").trim();
        if (qq && lastSearchedRef.current !== qq) {
            lastSearchedRef.current = qq;
            setQ(qq);
            runSearchFor(qq);
        }
    }, [lat0, lon0, propQ, apply, reverse, runSearchFor]);

    const runSearch = useCallback(async () => {
        const qq = q.trim();
        if (!qq) {
            setStatus("Введите адрес");
            return;
        }
        setStatus("Поиск…");
        try {
            const [first] = await search(qq);
            if (!first) {
                setStatus("Ничего не найдено");
                return;
            }
            const lat = Number(first.lat),
                lon = Number(first.lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                setStatus("Ошибка координат");
                return;
            }
            setPos([lat, lon]);
            setCenter([lat, lon]); // триггерим ViewUpdater
            try {
                const info = await reverse(lon, lat);
                const pretty = formatAddress(info) || first.display_name || qq;
                setQ(pretty);
                apply(info, pretty);
            } catch {
                apply(first, qq);
            }
            setStatus("Готово");
        } catch {
            setStatus("Ошибка поиска");
        }
    }, [apply, q, reverse, search]);

    // клик по карте → перенос маркера
    const ClickHandler: React.FC = () => {
        useMapEvents({
            click: async (e: LeafletMouseEvent) => {
                if (readOnly) return;
                const lat = e.latlng.lat,
                    lon = e.latlng.lng;
                setPos([lat, lon]);
                setCenter([lat, lon]); // триггерим ViewUpdater
                setStatus("Определяем адрес…");
                try {
                    const info = await reverse(lon, lat);
                    const pretty = formatAddress(info);
                    setQ(pretty);
                    apply(info, pretty);
                    setStatus("Готово");
                } catch {
                    apply({ lat, lon }, undefined);
                    setStatus("Готово");
                }
            },
        });
        return null;
    };

    return (
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 8 }}>
            {!readOnly && (
                <div
                    className="map-search-wrap"
                    // было: minWidth: 280, maxWidth: 520
                    style={{ position: "relative", width: "100%" }}
                >
                    {/* инпут тянется на 1fr, кнопка — по содержимому */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr auto",
                            gap: 8,
                            alignItems: "center",
                        }}
                    >
                        <input
                            className="form-control"
                            placeholder="Поиск адреса или места…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            autoComplete="off"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                    e.preventDefault();
                                    runSearch();
                                }
                            }}
                            // важно для корректного ужимания внутри grid/flex
                            style={{ width: "100%", minWidth: 0 }}
                            // покажет полный адрес по ховеру
                            title={q}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={runSearch}
                            disabled={!q.trim()}
                        >
                            Найти
                        </button>
                    </div>

                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                        {status}
                    </div>
                </div>
            )}

            <div
                className="glMap"
                style={{
                    height: compact ? 300 : 380,
                    border: "1px solid #e0e0e0",
                    borderRadius: 10,
                    overflow: "hidden",
                }}
            >
                <MapContainer
                    center={center}
                    zoom={Number.isFinite(lat0) && Number.isFinite(lon0) ? 14 : 5}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom={true}
                    attributionControl={false}
                >
                    {/* фикс размеров/скрытых вкладок */}
                    <SizeFix />

                    {/* убираем слово Leaflet, оставляем OSM */}
                    <AttributionControl position="bottomright" prefix={false} />

                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap contributors"
                    />

                    {/* Обновление вида при смене center */}
                    <ViewUpdater center={center} animate zoom={16} />

                    <ClickHandler />

                    <Marker
                        position={pos}
                        draggable={!readOnly}
                        eventHandlers={{
                            dragend: (e) => {
                                const ll = (e.target as L.Marker).getLatLng();
                                const lat = ll.lat,
                                    lon = ll.lng;
                                setPos([lat, lon]);
                                setCenter([lat, lon]); // тоже двигаем карту
                                setStatus("Определяем адрес…");
                                (async () => {
                                    try {
                                        const info = await reverse(lon, lat);
                                        const pretty = formatAddress(info);
                                        setQ(pretty);
                                        apply(info, pretty);
                                        setStatus("Готово");
                                    } catch {
                                        apply({ lat, lon }, undefined);
                                        setStatus("Готово");
                                    }
                                })();
                            },
                        }}
                    />
                </MapContainer>
            </div>
        </div>
    );
}
