import { useEffect } from "react";

declare global {
    interface Window {
        $crisp?: unknown[];
        CRISP_WEBSITE_ID?: string;
    }
}

const CRISP_SCRIPT_SRC = "https://client.crisp.chat/l.js";

/** One bootstrap per tab — avoids re-injecting / re-init on every React route change. */
let crispBootstrapScheduled = false;

function injectCrispScript(websiteId: string) {
    if (typeof document === "undefined") return;
    if (document.querySelector(`script[src="${CRISP_SCRIPT_SRC}"]`)) return;

    window.$crisp = window.$crisp ?? [];
    window.CRISP_WEBSITE_ID = websiteId.trim();

    const s = document.createElement("script");
    s.type = "text/javascript";
    s.src = CRISP_SCRIPT_SRC;
    s.async = true;
    document.head.appendChild(s);
}

/**
 * Loads Crisp once per browser tab (bottom-right by default). Deferred until the
 * browser is idle so Shopify admin + Polaris first paint are not blocked.
 */
function scheduleCrispOnce(websiteId: string) {
    const id = websiteId.trim();
    if (!id || typeof document === "undefined") return;
    if (document.querySelector(`script[src="${CRISP_SCRIPT_SRC}"]`)) return;
    if (crispBootstrapScheduled) return;
    crispBootstrapScheduled = true;

    const run = () => {
        injectCrispScript(id);
    };

    if (typeof requestIdleCallback !== "undefined") {
        requestIdleCallback(run, { timeout: 4000 });
    } else {
        window.setTimeout(run, 1200);
    }
}

/**
 * Loads Crisp live chat in the embedded admin (bottom-right by default).
 * Only runs in the browser; safe if `websiteId` is empty (no-op).
 */
export function CrispChatWidget({ websiteId }: { websiteId: string }) {
    useEffect(() => {
        scheduleCrispOnce(websiteId);
    }, [websiteId]);

    return null;
}
