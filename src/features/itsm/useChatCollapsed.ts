// src/features/itsm/useChatCollapsed.ts
import { useCallback, useEffect, useMemo, useState } from "react";

export function useChatCollapsed(guid: string) {
    const key = useMemo(() => `chat_collapsed:${guid}`, [guid]);
    const [value, setValue] = useState<boolean>(() => {
        const v = localStorage.getItem(key);
        return v ? v === "1" : false;
    });
    useEffect(() => {
        localStorage.setItem(key, value ? "1" : "0");
    }, [key, value]);
    const toggle = useCallback(() => setValue(v => !v), []);
    return { value, toggle, set: setValue };
}
