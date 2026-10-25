import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { activeAuthFlow, authDestination, authReturnState, beginAuthNavigation, clearAuthNavigation } from "@/lib/auth-navigation";

export function useAuthDestination() {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const entry = authReturnState(location.state);
    const next = authDestination(location.state, params.get("next"));
    const flow = useRef<string | undefined>(undefined);
    const lifetime = useRef(0);
    const [, refreshRestoredEntry] = useState(0);
    useEffect(() => {
        const show = (event: PageTransitionEvent) => { if (event.persisted) refreshRestoredEntry((value) => value + 1); };
        window.addEventListener("pageshow", show);
        return () => window.removeEventListener("pageshow", show);
    }, []);
    useLayoutEffect(() => {
        if (entry?.flow && activeAuthFlow(entry.flow) && !params.has("next")) {
            flow.current = entry.flow;
            return;
        }
        const id = beginAuthNavigation();
        flow.current = id;
        params.delete("next");
        void navigate({ pathname: location.pathname, search: params.size ? `?${params}` : "", hash: location.hash }, {
            replace: true,
            state: { ...(location.state && typeof location.state === "object" ? location.state : {}), authReturn: { next, flow: id } },
        });
    }, [location.key, location.pathname, location.search, location.hash, location.state, next, navigate]);
    useEffect(() => {
        const generation = ++lifetime.current;
        return () => {
            // StrictMode replays setup; a real route departure has no following setup.
            queueMicrotask(() => { if (lifetime.current === generation) clearAuthNavigation(flow.current); });
        };
    }, []);
    return next;
}
