declare module "@mapbox/togeojson" {
    import type { GeoJsonObject } from "geojson";

    export function kml(
        doc: Document,
        options?: Record<string, unknown>
    ): GeoJsonObject;

    export function gpx(
        doc: Document,
        options?: Record<string, unknown>
    ): GeoJsonObject;
}