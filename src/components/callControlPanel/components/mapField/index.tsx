import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    AttributionControl,
    GeoJSON,
    MapContainer,
    Marker,
    Pane,
    TileLayer,
    useMap,
    useMapEvents,
} from "react-leaflet";
import L, { LatLngTuple, LeafletMouseEvent } from "leaflet";
import axios from "axios";
import { store } from "../../../../redux/store";
import "leaflet/dist/leaflet.css";
import { loadOverlayAsGeoJson } from "../mapOverlayParser";

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
    fitKmlBounds?: boolean;
    overlayUrl?: string;
};

const START = { lat: 55.751244, lon: 37.618423 };
const EPS = 1e-9;

function samePoint(a: LatLngTuple, b: LatLngTuple) {
    return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

function parseYandexColor(raw?: string): { color: string; opacity: number } {
    const value = String(raw || "").replace(/^#/, "").trim();

    if (!/^[0-9a-fA-F]{8}$/.test(value)) {
        return {
            color: "#2563eb",
            opacity: 1,
        };
    }

    const rgb = value.slice(0, 6);
    const alphaHex = value.slice(6, 8);

    return {
        color: `#${rgb}`,
        opacity: Math.max(0, Math.min(1, parseInt(alphaHex, 16) / 255)),
    };
}

const SmallMarkerIcon = L.divIcon({
    className: "gl-small-marker",
    html: `
      <img
        src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
        alt=""
      />
    `,
    iconSize: [14, 23],
    iconAnchor: [7, 23],
    popupAnchor: [0, -18],
});

function useLeafletCssFix() {
    useEffect(() => {
        if (document.getElementById("leaflet-hotfix-lite")) return;

        const style = document.createElement("style");
        style.id = "leaflet-hotfix-lite";
        style.textContent = `
          .glMap {
            position: relative;
            isolation: isolate;
            contain: layout paint;
            z-index: 0;
          }
        
          .glMap .leaflet-container {
            overflow: hidden;
            transform: translateZ(0);
            backface-visibility: hidden;
            will-change: transform;
          }
        
          .glMap .leaflet-pane,
          .glMap .leaflet-map-pane,
          .glMap .leaflet-tile-pane,
          .glMap .leaflet-overlay-pane,
          .glMap .leaflet-marker-pane,
          .glMap .leaflet-shadow-pane {
            backface-visibility: hidden;
            transform: translateZ(0);
          }
        
          .glMap .leaflet-container img.leaflet-tile,
          .glMap .leaflet-container img.leaflet-marker-icon,
          .glMap .leaflet-container img.leaflet-marker-shadow,
          .glMap .leaflet-container img.leaflet-image-layer {
            max-width: none !important;
            max-height: none !important;
          }
        
          .glMap .leaflet-interactive,
          .glMap .leaflet-interactive:focus,
          .glMap svg:focus,
          .glMap path:focus {
            outline: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
        `;
        document.head.appendChild(style);
    }, []);
}

const KmlBoundsUpdater: React.FC<{
    bounds: L.LatLngBounds | null;
    enabled?: boolean;
    onDone?: () => void;
}> = ({ bounds, enabled, onDone }) => {
    const map = useMap();
    const lastKeyRef = useRef("");

    useEffect(() => {
        if (!enabled || !bounds || !bounds.isValid()) return;

        const nextKey = bounds.toBBoxString();
        if (lastKeyRef.current === nextKey) return;
        lastKeyRef.current = nextKey;

        map.invalidateSize(false);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                map.fitBounds(bounds, { padding: [24, 24] });
                onDone?.();
            });
        });
    }, [bounds, enabled, map, onDone]);

    return null;
};

const ViewUpdater: React.FC<{
    center: LatLngTuple;
    zoom: number;
    animate?: boolean;
}> = ({ center, zoom, animate }) => {
    const map = useMap();
    const first = useRef(true);

    useEffect(() => {
        if (first.current) {
            first.current = false;
            map.setView(center, zoom, { animate: false });
            return;
        }

        if (animate) {
            map.flyTo(center, zoom, { duration: 0.5 });
        } else {
            map.setView(center, zoom, { animate: false });
        }
    }, [center, zoom, animate, map]);

    return null;
};

const SizeFix: React.FC = () => {
    const map = useMap();

    useEffect(() => {
        let raf = 0;

        const fix = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
                map.invalidateSize(false);
            });
        };

        const container = map.getContainer();
        const ro = new ResizeObserver(fix);
        ro.observe(container);

        fix();
        window.addEventListener("resize", fix);

        return () => {
            cancelAnimationFrame(raf);
            ro.disconnect();
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
                                     fitKmlBounds = false,
                                     overlayUrl,
                                 }: Props) {
    useLeafletCssFix();

    const { glagolParent } = store.getState().credentials;

    const toNumber = (v: unknown) => {
        if (typeof v === "number") return v;
        if (typeof v === "string" && v.trim() !== "") return Number(v);
        return NaN;
    };

    const formatAddress = (src?: { address?: Addr } | Addr): string => {
        const a: Addr = (src && "address" in src ? (src as any).address : src) || {};
        return [
            a.country?.trim(),
            (a.state ?? a.region)?.trim(),
            a.city?.trim(),
            a.road?.trim(),
            a.house_number?.trim(),
        ]
            .filter(Boolean)
            .join(", ");
    };

    const lat0 = toNumber(initialValues[mapping.lat ?? ""]);
    const lon0 = toNumber(initialValues[mapping.lon ?? ""]);

    const [center, setCenter] = useState<LatLngTuple>([
        Number.isFinite(lat0) ? lat0 : START.lat,
        Number.isFinite(lon0) ? lon0 : START.lon,
    ]);

    const [pos, setPos] = useState<LatLngTuple>([
        Number.isFinite(lat0) ? lat0 : START.lat,
        Number.isFinite(lon0) ? lon0 : START.lon,
    ]);

    const [zoom, setZoom] = useState<number>(
        Number.isFinite(lat0) && Number.isFinite(lon0) ? 14 : 5
    );

    const [kmlGeoJson, setKmlGeoJson] = useState<GeoJSON.FeatureCollection | null>(null);
    const [kmlBounds, setKmlBounds] = useState<L.LatLngBounds | null>(null);
    const [overlayStatus, setOverlayStatus] = useState("");

    const [overlayFitted, setOverlayFitted] = useState(false);

    const [q, setQ] = useState(() => (mapping.q && initialValues[mapping.q]) || "");
    const [status, setStatus] = useState("");

    const lastResolvedRef = useRef("");
    const lastSearchedRef = useRef("");

    const setPointState = useCallback(
        (lat: number, lon: number, nextZoom?: number) => {
            const next: LatLngTuple = [lat, lon];

            setPos((prev) => (samePoint(prev, next) ? prev : next));
            setCenter((prev) => (samePoint(prev, next) ? prev : next));

            if (typeof nextZoom === "number") {
                setZoom((prev) => (prev === nextZoom ? prev : nextZoom));
            }
        },
        []
    );

    const apply = useCallback(
        (it: Item, saveQ?: string) => {
            const A: Addr = {
                ...((it as any)?.address || {}),
                ...(it as any)?.country ? { country: (it as any).country } : {},
                ...(it as any)?.state ? { state: (it as any).state } : {},
                ...(it as any)?.city ? { city: (it as any).city } : {},
                ...(it as any)?.city_district
                    ? { city_district: (it as any).city_district }
                    : {},
                ...(it as any)?.road ? { road: (it as any).road } : {},
                ...(it as any)?.house_number
                    ? { house_number: (it as any).house_number }
                    : {},
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

    const applyRef = useRef(apply);
    useEffect(() => {
        applyRef.current = apply;
    }, [apply]);

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
                    const {
                        country,
                        state,
                        region,
                        city,
                        city_district,
                        road,
                        house_number,
                        postcode,
                    } = raw as any;

                    address = {
                        country,
                        region,
                        state: state ?? region,
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

    const reverseRef = useRef(reverse);
    useEffect(() => {
        reverseRef.current = reverse;
    }, [reverse]);

    const runSearchFor = useCallback(
        async (query: string) => {
            const qq = query.trim();
            if (!qq) return;

            setStatus("Поиск…");
            lastSearchedRef.current = qq;

            try {
                const [first] = await search(qq);

                if (!first) {
                    setStatus("Ничего не найдено");
                    return;
                }

                const lat = Number(first.lat);
                const lon = Number(first.lon);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                    setStatus("Ошибка координат");
                    return;
                }

                lastResolvedRef.current = `${lat},${lon}`;
                setPointState(lat, lon, 16);

                try {
                    const info = await reverse(lon, lat);
                    const pretty = formatAddress(info) || first.display_name || qq;

                    setQ((prev) => (prev === pretty ? prev : pretty));
                    apply({ ...info, lat, lon }, pretty);
                } catch {
                    apply(first, qq);
                }

                setStatus("Готово");
            } catch {
                setStatus("Ошибка поиска");
            }
        },
        [apply, reverse, search, setPointState]
    );

    const runSearchForRef = useRef(runSearchFor);
    useEffect(() => {
        runSearchForRef.current = runSearchFor;
    }, [runSearchFor]);

    const propQ = (mapping.q && initialValues[mapping.q]) || "";

    useEffect(() => {
        setOverlayFitted(false);
    }, [overlayUrl]);

    useEffect(() => {
        const url = String(overlayUrl || "").trim();

        if (!url) {
            setKmlGeoJson(null);
            setKmlBounds(null);
            setOverlayStatus("");
            setOverlayFitted(false);
            return;
        }

        let cancelled = false;

        const loadOverlay = async () => {
            setOverlayFitted(false);
            setOverlayStatus("Загружаем разметку...");

            try {
                const geojson = await loadOverlayAsGeoJson(url);
                if (cancelled) return;

                setKmlGeoJson(geojson);

                const tmpLayer = L.geoJSON(geojson as any);
                const bounds = tmpLayer.getBounds();

                setKmlBounds(bounds.isValid() ? bounds : null);
                setOverlayStatus("Разметка загружена");
            } catch (error) {
                if (cancelled) return;

                console.error("Ошибка загрузки разметки:", error);
                setKmlGeoJson(null);
                setKmlBounds(null);
                setOverlayStatus("Ошибка загрузки разметки");
                setOverlayFitted(false);
            }
        };

        void loadOverlay();

        return () => {
            cancelled = true;
        };
    }, [overlayUrl]);

    useEffect(() => {
        if (Number.isFinite(lat0) && Number.isFinite(lon0)) {
            const key = `${lat0},${lon0}`;

            setPointState(lat0, lon0, 14);

            if (lastResolvedRef.current === key) return;
            lastResolvedRef.current = key;

            let cancelled = false;

            (async () => {
                setStatus("Определяем адрес…");

                try {
                    const info = await reverseRef.current(lon0, lat0);
                    if (cancelled) return;

                    const pretty = formatAddress(info);

                    if (pretty) {
                        setQ((prev) => (prev === pretty ? prev : pretty));
                    }

                    applyRef.current({ ...info, lat: lat0, lon: lon0 }, pretty || undefined);
                    setStatus("Готово");
                } catch {
                    if (cancelled) return;

                    applyRef.current({ lat: lat0, lon: lon0 }, undefined);
                    setStatus("");
                }
            })();

            return () => {
                cancelled = true;
            };
        }

        const qq = String(propQ || "").trim();
        if (!qq) return;

        if (lastSearchedRef.current === qq) {
            setQ((prev) => (prev === qq ? prev : qq));
            return;
        }

        setQ((prev) => (prev === qq ? prev : qq));
        void runSearchForRef.current(qq);
    }, [lat0, lon0, propQ, setPointState]);

    const commitPoint = useCallback(
        async (lat: number, lon: number) => {
            lastResolvedRef.current = `${lat},${lon}`;
            setPointState(lat, lon, 16);
            setStatus("Определяем адрес…");

            try {
                const info = await reverse(lon, lat);
                const pretty = formatAddress(info);

                if (pretty) {
                    setQ((prev) => (prev === pretty ? prev : pretty));
                }

                apply({ ...info, lat, lon }, pretty);
                setStatus("Готово");
            } catch {
                apply({ lat, lon }, undefined);
                setStatus("Готово");
            }
        },
        [apply, reverse, setPointState]
    );

    const runSearch = useCallback(async () => {
        const qq = q.trim();

        if (!qq) {
            setStatus("Введите адрес");
            return;
        }

        await runSearchFor(qq);
    }, [q, runSearchFor]);

    const zoneStyle = useCallback((feature: any): L.PathOptions => {
        const props = feature?.properties || {};

        const stroke = parseYandexColor(props.strokeColorRaw);
        const fill = parseYandexColor(props.fillColorRaw);

        const rawWidth = Number(props.strokeWidthRaw);
        const weight = Number.isFinite(rawWidth)
            ? Math.max(1, rawWidth / 100)
            : 2;

        return {
            color: stroke.color,
            opacity: stroke.opacity,
            fillColor: fill.color,
            fillOpacity: fill.opacity,
            weight,
        };
    }, []);

    const onEachZone = useCallback(
        (feature: any, layer: L.Layer) => {
            const name =
                String(feature?.properties?.name || "").trim() || "Без названия";

            const pathLayer = layer as L.Path & {
                bindTooltip?: (content: string, options?: L.TooltipOptions) => any;
                on?: (type: string | Record<string, any>, fn?: any) => any;
            };

            if ("bindTooltip" in pathLayer) {
                pathLayer.bindTooltip(name, {
                    sticky: true,
                    direction: "top",
                    opacity: 0.95,
                });
            }

            if ("on" in pathLayer) {
                pathLayer.on({
                    click: async (e: any) => {
                        if (readOnly) return;

                        const latlng = e?.latlng;
                        if (!latlng) return;

                        const target = e?.originalEvent?.target as HTMLElement | undefined;
                        if (target && typeof target.blur === "function") {
                            target.blur();
                        }

                        await commitPoint(latlng.lat, latlng.lng);
                    },
                });
            }
        },
        [commitPoint, readOnly]
    );

    const ClickHandler: React.FC = () => {
        useMapEvents({
            click: async (e: LeafletMouseEvent) => {
                if (readOnly) return;
                await commitPoint(e.latlng.lat, e.latlng.lng);
            },
        });

        return null;
    };

    return (
        <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 8 }}>
            {!readOnly && (
                <div
                    className="map-search-wrap"
                    style={{ position: "relative", width: "100%" }}
                >
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
                                    void runSearch();
                                }
                            }}
                            style={{ width: "100%", minWidth: 0 }}
                            title={q}
                        />
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => void runSearch()}
                            disabled={!q.trim()}
                        >
                            Найти
                        </button>
                    </div>

                    {!!overlayStatus && (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                            {overlayStatus}
                        </div>
                    )}

                    {!!status && (
                        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
                            {status}
                        </div>
                    )}
                </div>
            )}

            <div
                className="glMap"
                style={{
                    height: compact ? 300 : 380,
                    border: "1px solid #e0e0e0",
                    borderRadius: 10,
                    overflow: "hidden",
                    position: "relative",
                    isolation: "isolate",
                    contain: "layout paint",
                }}
            >
                <MapContainer
                    center={center}
                    zoom={zoom}
                    style={{ height: "100%", width: "100%" }}
                    scrollWheelZoom
                    attributionControl={false}
                >
                    <SizeFix />
                    <AttributionControl position="bottomright" prefix={false} />

                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap contributors"
                    />

                    {kmlGeoJson && (
                        <Pane name="kmlPane" style={{ zIndex: 450 }}>
                            <GeoJSON
                                data={kmlGeoJson}
                                style={zoneStyle}
                                onEachFeature={onEachZone}
                            />
                        </Pane>
                    )}

                    <KmlBoundsUpdater
                        bounds={kmlBounds}
                        enabled={fitKmlBounds && !overlayFitted}
                        onDone={() => setOverlayFitted(true)}
                    />

                    {(!fitKmlBounds || overlayFitted || !kmlBounds) && (
                        <ViewUpdater center={center} zoom={zoom} animate />
                    )}

                    <ClickHandler />

                    <Marker
                        icon={SmallMarkerIcon}
                        position={pos}
                        draggable={!readOnly}
                        eventHandlers={{
                            dragend: async (e) => {
                                const ll = (e.target as L.Marker).getLatLng();
                                await commitPoint(ll.lat, ll.lng);
                            },
                        }}
                    />
                </MapContainer>
            </div>
        </div>
    );
}