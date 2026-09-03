import { AnimatePresence, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { AuthEntry } from "./auth-entry";
import { AuthMedia } from "./auth-media";
import { AuthPanel } from "./auth-panel";
import { getCachedAuthPages, type AuthMode, type AuthPages, preloadAuthPages } from "./auth-route-loader";
import { AuthSettingsProvider, useAuthSettings } from "./auth-settings-provider";

import "./auth-scene.css";

export function AuthScene() {
    return (
        <AuthSettingsProvider>
            <AuthSceneContent />
        </AuthSettingsProvider>
    );
}

function AuthSceneContent() {
    const location = useLocation();
    const navigate = useNavigate();
    const reducedMotion = Boolean(useReducedMotion());
    const { settings, ensureReady } = useAuthSettings();
    const [authOpen, setAuthOpen] = useState(false);
    const [pages, setPages] = useState<Partial<AuthPages>>(getCachedAuthPages);
    const mode: AuthMode = location.pathname === "/register" ? "register" : "login";
    const ActivePage = pages[mode];

    useEffect(() => {
        let active = true;
        void preloadAuthPages()
            .then((loadedPages) => {
                if (active) setPages(loadedPages);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        if (!settings) return;
        if (settings.firstUser && mode !== "register") {
            navigate({ pathname: "/register", search: location.search }, { replace: true });
            return;
        }
        if (!settings.firstUser && !settings.registrationEnabled && mode === "register") {
            navigate({ pathname: "/login", search: location.search }, { replace: true });
        }
    }, [location.search, mode, navigate, settings]);

    const openAuth = useCallback(async () => {
        const [loadedPages] = await Promise.all([preloadAuthPages(), ensureReady().catch(() => null)]);
        setPages(loadedPages);
        setAuthOpen(true);
    }, [ensureReady]);

    return (
        <main className={`pc-auth-scene h-dvh min-h-0 overflow-hidden${authOpen ? " is-auth-open" : ""}`}>
            <AuthMedia />
            <AnimatePresence mode="wait" initial={false}>
                {!authOpen ? (
                    <AuthEntry key="entry" reducedMotion={reducedMotion} onOpen={() => void openAuth()} />
                ) : ActivePage ? (
                    <AuthPanel key="panel" mode={mode} Page={ActivePage} reducedMotion={reducedMotion} onClose={() => setAuthOpen(false)} />
                ) : null}
            </AnimatePresence>
        </main>
    );
}
