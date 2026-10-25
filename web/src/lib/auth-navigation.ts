/** Shared destination contract for public entries, guards and authentication forms. */
export function safeAuthNext(value: string | null | undefined) {
    if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return "/create";
    try {
        const url = new URL(value, "https://auth.invalid");
        const path = decodeURIComponent(url.pathname).toLowerCase();
        if (url.origin !== "https://auth.invalid" || path.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(path) || /^\/(?:login|register|forgot-password)(?:\/|$)/.test(path)) return "/create";
    } catch { return "/create"; }
    return value;
}

export function authEntry(next: string, to: "/login" | "/register" | "/forgot-password" = "/login") {
    return { to, state: { authReturn: { next: safeAuthNext(next) } } };
}

type AuthReturn = { next: string; flow?: string };
const FLOW_KEY = "mengceng.auth-navigation.flow";
let memoryFlow: string | null = null;
let memoryOnly = false;

export function authReturnState(state: unknown): AuthReturn | undefined {
    if (!state || typeof state !== "object" || !("authReturn" in state)) return;
    const value = state.authReturn;
    if (!value || typeof value !== "object" || !("next" in value) || typeof value.next !== "string") return;
    return { next: safeAuthNext(value.next), flow: "flow" in value && typeof value.flow === "string" ? value.flow : undefined };
}

function currentFlow() {
    if (memoryOnly) return memoryFlow;
    try { return window.sessionStorage.getItem(FLOW_KEY); } catch { memoryOnly = true; return memoryFlow; }
}

export function activeAuthFlow(flow: string | undefined) {
    return Boolean(flow && currentFlow() === flow);
}

export function beginAuthNavigation() {
    const flow = crypto.randomUUID();
    memoryFlow = flow;
    if (!memoryOnly) {
        try { window.sessionStorage.setItem(FLOW_KEY, flow); } catch {
            memoryOnly = true;
            try { window.sessionStorage.removeItem(FLOW_KEY); } catch { /* Storage is unavailable; do not revive its previous value in this document. */ }
        }
    }
    return flow;
}

/** The tag contains no destination; stale history entries cannot revive a finished flow. */
export function clearAuthNavigation(flow?: string) {
    if (flow && currentFlow() !== flow) return;
    memoryFlow = null;
    try { window.sessionStorage.removeItem(FLOW_KEY); } catch { memoryOnly = true; }
}

export function authDestination(state: unknown, legacyNext: string | null = null) {
    if (legacyNext !== null) return safeAuthNext(legacyNext);
    const entry = authReturnState(state);
    return entry && (!entry.flow || activeAuthFlow(entry.flow)) ? entry.next : "/create";
}

/** Clean only the presentation parameter; OAuth errors and other protocol data survive. */
export function authLink(href: string, next?: string) {
    const url = new URL(href, "https://auth.invalid");
    if (!/^\/(?:login|register|forgot-password)\/?$/.test(url.pathname)) return { to: href, state: undefined };
    const legacy = url.searchParams.get("next");
    if (legacy !== null) url.searchParams.delete("next");
    return {
        to: url.pathname + url.search + url.hash,
        state: next !== undefined || legacy !== null ? authEntry(next ?? legacy ?? "/create").state : undefined,
    };
}

/** Full-document returns must obey the same departure rule as SPA links. */
export function observeAuthNavigation(router: {
    state: { location: { pathname: string } };
    subscribe: (callback: (state: { location: { pathname: string } }) => void) => () => void;
}) {
    const authPath = (path: string) => /^\/(?:login|register|forgot-password)\/?$|^\/i\/[^/]+\/?$/i.test(path);
    const departed = ({ location }: { location: { pathname: string } }) => { if (!authPath(location.pathname)) clearAuthNavigation(); };
    const navigation = window.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "back_forward") clearAuthNavigation();
    departed(router.state);
    const stop = router.subscribe(departed);
    const hide = (event: PageTransitionEvent) => { if (event.persisted) clearAuthNavigation(); };
    window.addEventListener("pagehide", hide);
    return () => { stop(); window.removeEventListener("pagehide", hide); };
}
