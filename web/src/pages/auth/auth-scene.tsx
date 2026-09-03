import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ConfigProvider, Tabs } from "antd";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { getAntThemeConfig } from "@/lib/app-theme";
import { withBrandingAntTheme } from "@/lib/branding-theme";
import { getAuthSettings, type PublicAuthSettings } from "@/services/api/auth";

import "./auth-pc.css";

type AuthSettingsContextValue = {
    settings: PublicAuthSettings | null;
    loading: boolean;
    error: string;
    refresh: () => Promise<void>;
};

const AuthSettingsContext = createContext<AuthSettingsContextValue | null>(null);

const preloadAuthRoutes = () => Promise.all([import("./login"), import("./register")]);

export function LinuxDOIcon() {
    return (
        <span
            aria-hidden
            className="size-5 shrink-0 rounded-full"
            style={{
                background: "linear-gradient(to bottom, #1d1d1f 0 33.333%, #efefef 33.333% 66.666%, #feb005 66.666% 100%)",
                boxShadow: "0 0 0 1px rgba(255,255,255,.14)",
            }}
        />
    );
}

export function AuthScene() {
    const location = useLocation();
    const navigate = useNavigate();
    const reducedMotion = useReducedMotion();
    const desktop = usePcBrandViewport();
    const { branding } = useBranding();
    const [settings, setSettings] = useState<PublicAuthSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [heroFailed, setHeroFailed] = useState(false);
    const [authOpen, setAuthOpen] = useState(false);
    const activeTab = location.pathname === "/register" ? "register" : "login";

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setSettings(await getAuthSettings());
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "无法读取登录与注册设置");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        if (!settings) return;
        if (settings.firstUser && activeTab !== "register") {
            navigate({ pathname: "/register", search: location.search }, { replace: true });
            return;
        }
        if (!settings.firstUser && !settings.registrationEnabled && activeTab === "register") {
            navigate({ pathname: "/login", search: location.search }, { replace: true });
        }
    }, [activeTab, location.search, navigate, settings]);

    useEffect(() => setHeroFailed(false), [branding.assets.authHeroUrl]);

    useEffect(() => {
        const preload = preloadAuthRoutes();
        void preload.catch(() => undefined);
    }, []);

    const openAuth = useCallback(async () => {
        await preloadAuthRoutes().catch(() => undefined);
        setAuthOpen(true);
    }, []);

    const tabs = useMemo(() => {
        if (settings?.firstUser) return [{ key: "register", label: "创建管理员" }];
        if (settings && !settings.registrationEnabled) return [{ key: "login", label: "登录" }];
        return [
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
        ];
    }, [settings]);

    const hero = branding.assets;
    const showVideo = Boolean(!reducedMotion && hero.authHeroKind === "video" && hero.authHeroUrl && !heroFailed);
    const showImage = Boolean(hero.authHeroKind === "image" && hero.authHeroUrl && !heroFailed);
    const showPoster = Boolean(hero.authHeroKind === "video" && hero.authHeroPosterUrl && !showVideo);
    const context = useMemo<AuthSettingsContextValue>(() => ({ settings, loading, error, refresh }), [error, loading, refresh, settings]);

    return (
        <AuthSettingsContext.Provider value={context}>
            <main className={`pc-auth-scene h-dvh min-h-0 overflow-hidden${authOpen ? " is-auth-open" : ""}`}>
                <div className="pc-auth-atmosphere" aria-hidden="true">
                    {showVideo ? (
                        <video className="pc-auth-atmosphere-media" src={hero.authHeroUrl} poster={hero.authHeroPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onError={() => setHeroFailed(true)} />
                    ) : showImage || showPoster ? (
                        <img className="pc-auth-atmosphere-media" src={showImage ? hero.authHeroUrl : hero.authHeroPosterUrl} alt="" referrerPolicy="no-referrer" onError={() => setHeroFailed(true)} />
                    ) : (
                        <div className="pc-auth-brand-ambient" />
                    )}
                    <div className="pc-auth-atmosphere-grade" />
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    {!authOpen ? (
                        <motion.div
                            key="entry"
                            className="pc-auth-entry"
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                            transition={{ duration: reducedMotion ? 0 : 0.38, ease: aceternityMotion.easing.enter }}
                        >
                            <header className="pc-auth-entry-nav">
                                <span className="pc-auth-entry-brand" aria-label={branding.config.identity.displayName}>
                                    <BrandMark className="pc-auth-entry-logo" />
                                </span>
                                <button type="button" className="pc-auth-entry-login" onClick={() => void openAuth()}>
                                    登录
                                </button>
                            </header>
                            <div className="pc-auth-entry-content">
                                <p className="pc-auth-entry-eyebrow">智能影像创作空间</p>
                                <h1>{branding.config.auth.title}</h1>
                                {branding.config.auth.description ? <p className="pc-auth-entry-description">{branding.config.auth.description}</p> : null}
                                <motion.button type="button" className="pc-auth-entry-button" onClick={() => void openAuth()} whileHover={reducedMotion ? undefined : { y: -2 }} whileTap={reducedMotion ? undefined : { scale: 0.985 }}>
                                    <span>进入{branding.config.identity.shortName}</span>
                                    <span aria-hidden="true">→</span>
                                </motion.button>
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="auth"
                            className="pc-auth-workspace"
                            initial={reducedMotion ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reducedMotion ? 0 : 0.42, ease: aceternityMotion.easing.enter }}
                        >
                            <motion.section
                                initial={reducedMotion ? false : { opacity: 0, y: 22, scale: 0.975 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                transition={{ duration: reducedMotion ? 0 : 0.5, ease: aceternityMotion.easing.enter }}
                                className="pc-auth-panel"
                                aria-label={`${branding.config.identity.displayName}账号入口`}
                            >
                                <button type="button" className="pc-auth-panel-close" onClick={() => setAuthOpen(false)} aria-label="返回视频">
                                    <span aria-hidden="true">×</span>
                                </button>
                                <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(true, desktop), branding.config.theme.primaryColor, true)}>
                                    <header className="pc-auth-brand-head">
                                        <span className="pc-auth-brand-symbol">
                                            <BrandMark className="pc-auth-brand-logo" />
                                        </span>
                                        <h1>{settings?.firstUser ? "创建第一个管理员" : activeTab === "login" ? `登录${branding.config.identity.shortName}` : "创建账号"}</h1>
                                    </header>

                                    <motion.div
                                        key={location.pathname}
                                        initial={reducedMotion ? false : { opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, ease: aceternityMotion.easing.enter }}
                                        className="pc-auth-form-slot"
                                    >
                                        <Outlet />
                                    </motion.div>

                                    <footer className="pc-auth-panel-footer">
                                        <span>{activeTab === "login" ? "还没有账号？" : "已经有账号？"}</span>
                                        <div className="pc-auth-tabs-wrap">
                                            <Tabs className="pc-auth-tabs" activeKey={activeTab} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                                        </div>
                                    </footer>
                                </ConfigProvider>
                            </motion.section>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </AuthSettingsContext.Provider>
    );
}

export function useAuthSettings() {
    const value = useContext(AuthSettingsContext);
    if (!value) throw new Error("useAuthSettings must be used within AuthScene");
    return value;
}
