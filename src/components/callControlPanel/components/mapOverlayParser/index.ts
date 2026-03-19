import * as toGeoJSON from "@mapbox/togeojson";

type AnyFeatureCollection = GeoJSON.FeatureCollection;

function cleanupRawText(raw: string): string {
    return String(raw || "").replace(/\u0000/g, "").trim();
}

function looksLikeKml(text: string): boolean {
    const t = text.trim().toLowerCase();
    return t.startsWith("<?xml") || t.includes("<kml");
}

function looksLikeGeoJson(text: string): boolean {
    const t = text.trim();
    return t.startsWith("{") || t.startsWith("[");
}

function looksLikeYandexConstructorText(text: string): boolean {
    return (
        text.includes("Yandex Map Constructor") ||
        text.includes("#fillColor:") ||
        text.includes("_strokeColor:")
    );
}

function parseGeoJsonText(text: string): AnyFeatureCollection {
    const parsed = JSON.parse(text);

    if (parsed?.type === "FeatureCollection") {
        return parsed as AnyFeatureCollection;
    }

    if (parsed?.type === "Feature") {
        return {
            type: "FeatureCollection",
            features: [parsed],
        };
    }

    throw new Error("Неподдерживаемый GeoJSON");
}

function parseStyleUrl(styleUrl: string | null | undefined) {
    const raw = String(styleUrl || "").trim();

    const m = raw.match(
        /fillColor:([0-9a-fA-F]{8})_strokeColor:([0-9a-fA-F]{8})_strokeWidth:([0-9.]+)/
    );

    if (!m) {
        return {
            fillColorRaw: undefined,
            strokeColorRaw: undefined,
            strokeWidthRaw: undefined,
        };
    }

    return {
        fillColorRaw: m[1],
        strokeColorRaw: m[2],
        strokeWidthRaw: Number(m[3]),
    };
}

function parseKmlText(text: string): AnyFeatureCollection {
    const xml = new DOMParser().parseFromString(text, "text/xml");

    const parserError = xml.querySelector("parsererror");
    if (parserError) {
        throw new Error("Ошибка XML при разборе KML");
    }

    const base = toGeoJSON.kml(xml) as AnyFeatureCollection;

    const placemarks = Array.from(xml.getElementsByTagName("Placemark"));

    const features = (base.features || []).map((feature, index) => {
        const placemark = placemarks[index];

        const description =
            placemark?.getElementsByTagName("description")[0]?.textContent?.trim() || "";

        const name =
            placemark?.getElementsByTagName("name")[0]?.textContent?.trim() || "";

        const styleUrl =
            placemark?.getElementsByTagName("styleUrl")[0]?.textContent?.trim() || "";

        const styleMeta = parseStyleUrl(styleUrl);

        return {
            ...feature,
            properties: {
                ...(feature.properties || {}),
                name: name || description || `Зона ${index + 1}`,
                description,
                styleUrl,
                ...styleMeta,
                sourceFormat: "kml",
            },
        };
    });

    return {
        type: "FeatureCollection",
        features,
    };
}

/**
 * Оставил заглушку под твой будущий текстовый яндекс-парсер.
 * Но для текущего delivery_map.kml он вообще не нужен.
 */
function parseYandexConstructorText(raw: string): AnyFeatureCollection {
    throw new Error("Текстовый Yandex Constructor parser пока не нужен для этого файла");
}

async function fetchTextWithoutAuth(url: string): Promise<string> {
    const resp = await fetch(url, {
        method: "GET",
        credentials: "omit",
    });

    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
    }

    return await resp.text();
}

export async function loadOverlayAsGeoJson(
    url: string
): Promise<AnyFeatureCollection> {
    const rawText = await fetchTextWithoutAuth(url);
    const text = cleanupRawText(rawText);

    if (looksLikeKml(text)) {
        return parseKmlText(rawText);
    }

    if (looksLikeGeoJson(text)) {
        return parseGeoJsonText(rawText);
    }

    if (looksLikeYandexConstructorText(text)) {
        return parseYandexConstructorText(rawText);
    }

    throw new Error("Неизвестный формат файла карты");
}