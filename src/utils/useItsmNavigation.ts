// src/features/itsm/useItsmNavigation.ts
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { buildItsmPath, buildItsmUrl, type ItsmLinkOpts } from "./itsmLink";

const ITSMLAUNCH_MSG = "ITSMLAUNCH/1";

export function useItsmNavigation() {
    const navigate = useNavigate();

    const goToItsm = useCallback((guid: string, opts?: ItsmLinkOpts) => {
        // Чистый путь, а данные — в state (только внутри SPA).
        navigate(buildItsmPath(guid), { state: { __itsmLaunch__: true, ...opts } });
    }, [navigate]);

    const openItsmNewTab = useCallback((guid: string, opts?: ItsmLinkOpts) => {
        const url = buildItsmUrl(guid);
        const win = window.open(url, "_blank", "noopener,noreferrer");
        if (!win || !opts) return;

        // Попробуем отправить полезную нагрузку сразу и ещё раз после onload.
        const payload = { type: ITSMLAUNCH_MSG, origin: window.location.origin, data: { ...opts } };

        // 1) моментально (если вкладка уже готова принять сообщения)
        try { win.postMessage(payload, window.location.origin); } catch {}

        // 2) ещё попытка через небольшой таймаут
        setTimeout(() => {
            try { win.postMessage(payload, window.location.origin); } catch {}
        }, 300);

        // 3) и периодический пинг первые 3 секунды, чтобы надёжно доставить
        let tries = 0;
        const t: any = setInterval(() => {
            tries += 1;
            if (tries > 10) return clearInterval(t);
            try { win.postMessage(payload, window.location.origin); } catch {}
        }, 300);
        setTimeout(() => clearInterval(t), 3200);
    }, []);

    return {
        goToItsm,
        openItsmNewTab,
        buildItsmPath,
        buildItsmUrl,
    };
}
