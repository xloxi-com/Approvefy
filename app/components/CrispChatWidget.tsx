import { useEffect, useRef } from "react";

declare global {
    interface Window {
        $crisp?: unknown[];
        CRISP_WEBSITE_ID?: string;
    }
}

const CRISP_SCRIPT_SRC = "https://client.crisp.chat/l.js";

/**
 * Loads Crisp live chat in the embedded admin (bottom-right by default).
 * Only runs in the browser; safe if `websiteId` is empty (no-op).
 */
export function CrispChatWidget({ websiteId }: { websiteId: string }) {
    const started = useRef(false);

    useEffect(() => {
        const id = websiteId.trim();
        if (!id || typeof document === "undefined") return;
        if (started.current) return;
        if (document.querySelector(`script[src="${CRISP_SCRIPT_SRC}"]`)) {
            started.current = true;
            return;
        }
        started.current = true;

        window.$crisp = window.$crisp ?? [];
        window.CRISP_WEBSITE_ID = id;

        const s = document.createElement("script");
        s.type = "text/javascript";
        s.src = CRISP_SCRIPT_SRC;
        s.async = true;
        document.head.appendChild(s);
    }, [websiteId]);

    return null;
}
