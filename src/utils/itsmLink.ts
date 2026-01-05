export type ChatRole = "client" | "operator" | "manager";
export type ItsmLinkOpts = { worker?: string | null; role?: ChatRole; name?: string; sipLogin?: string | null };

export function buildItsmPath(guid: string) {
    return `/itsm/${encodeURIComponent(guid)}`;
}

export function buildItsmUrl(guid: string) {
    return new URL(buildItsmPath(guid), window.location.origin).toString();
}
