import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { getAuthSettings, type PublicAuthSettings } from "@/services/api/auth";

type AuthSettingsContextValue = {
    settings: PublicAuthSettings | null;
    loading: boolean;
    error: string;
    ensureReady: () => Promise<PublicAuthSettings>;
    refresh: () => Promise<void>;
};

const AuthSettingsContext = createContext<AuthSettingsContextValue | null>(null);

let cachedSettings: PublicAuthSettings | null = null;
let settingsRequest: Promise<PublicAuthSettings> | null = null;

function loadAuthSettings(force = false) {
    if (!force && cachedSettings) return Promise.resolve(cachedSettings);
    if (settingsRequest) return settingsRequest;

    settingsRequest = getAuthSettings()
        .then((settings) => {
            cachedSettings = settings;
            return settings;
        })
        .finally(() => {
            settingsRequest = null;
        });
    return settingsRequest;
}

export function AuthSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<PublicAuthSettings | null>(cachedSettings);
    const [loading, setLoading] = useState(!cachedSettings);
    const [error, setError] = useState("");

    const ensureReady = useCallback(async () => {
        const nextSettings = await loadAuthSettings();
        setSettings(nextSettings);
        setError("");
        setLoading(false);
        return nextSettings;
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setSettings(await loadAuthSettings(true));
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "无法读取登录与注册设置");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        void loadAuthSettings()
            .then((nextSettings) => {
                if (!active) return;
                setSettings(nextSettings);
                setError("");
            })
            .catch((loadError) => {
                if (!active) return;
                setError(loadError instanceof Error ? loadError.message : "无法读取登录与注册设置");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, []);

    const value = useMemo<AuthSettingsContextValue>(() => ({ settings, loading, error, ensureReady, refresh }), [ensureReady, error, loading, refresh, settings]);
    return <AuthSettingsContext.Provider value={value}>{children}</AuthSettingsContext.Provider>;
}

export function useAuthSettings() {
    const value = useContext(AuthSettingsContext);
    if (!value) throw new Error("useAuthSettings must be used within AuthSettingsProvider");
    return value;
}
