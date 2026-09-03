import { motion, useReducedMotion } from "motion/react";
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

const authCopy = {
    login: {
        title: "欢迎回来",
        description: "继续你的创作旅程。",
    },
    register: {
        title: "创建账号",
        description: "从这里开始你的创作旅程。",
    },
} as const;

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
    const activeTab = location.pathname === "/register" ? "register" : "login";
    const copy = activeTab === "register" ? authCopy.register : authCopy.login;

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
        const preload = activeTab === "login" ? import("./register") : import("./login");
        void preload.catch(() => undefined);
    }, [activeTab]);

    const tabs = useMemo(() => {
        if (settings?.firstUser) return [{ key: "register", label: "创建管理员" }];
        if (settings && !settings.registrationEnabled) return [{ key: "login", label: "登录" }];
        return [
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
        ];
    }, [settings]);

    const hero = branding.assets;
    const showVideo = Boolean(desktop && !reducedMotion && hero.authHeroKind === "video" && hero.authHeroUrl && !heroFailed);
    const showImage = Boolean(hero.authHeroKind === "image" && hero.authHeroUrl && !heroFailed);
    const showPoster = Boolean(hero.authHeroKind === "video" && hero.authHeroPosterUrl && !showVideo);
    const context = useMemo<AuthSettingsContextValue>(() => ({ settings, loading, error, refresh }), [error, loading, refresh, settings]);

    return (
        <AuthSettingsContext.Provider value={context}>
            <main className="pc-auth-scene h-dvh min-h-0 overflow-y-auto">
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

                <div className="pc-auth-layout">
                    <motion.section
                        initial={reducedMotion ? false : { opacity: 0, x: -18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="pc-auth-brand-stage"
                        aria-label={`${branding.config.identity.displayName}品牌介绍`}
                    >
                        <div className="pc-auth-feature-frame">
                            {showVideo ? (
                                <video className="pc-auth-feature-media" src={hero.authHeroUrl} poster={hero.authHeroPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onError={() => setHeroFailed(true)} />
                            ) : showImage || showPoster ? (
                                <img className="pc-auth-feature-media" src={showImage ? hero.authHeroUrl : hero.authHeroPosterUrl} alt="" referrerPolicy="no-referrer" onError={() => setHeroFailed(true)} />
                            ) : (
                                <div className="pc-auth-brand-ambient" />
                            )}
                            <div className="pc-auth-feature-grade" />
                            <div className="pc-auth-stage-copy">
                                <p>{branding.config.identity.slogan}</p>
                                <h2>{branding.config.auth.title}</h2>
                                {branding.config.auth.description ? <span>{branding.config.auth.description}</span> : null}
                            </div>
                        </div>
                    </motion.section>

                    <motion.section initial={reducedMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }} className="pc-auth-workspace">
                        <div className="pc-auth-panel">
                            <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(false, desktop), branding.config.theme.primaryColor, false)}>
                                <header className="pc-auth-brand-head" aria-label={`${branding.config.identity.displayName}登录入口`}>
                                    <span className="pc-auth-brand-link">
                                        <span className="pc-auth-brand-symbol">
                                            <BrandMark className="pc-auth-brand-logo" />
                                        </span>
                                        <span className="pc-auth-brand-wordmark">
                                            <strong>{branding.config.identity.displayName}</strong>
                                            <small>{branding.config.identity.workspaceLabel}</small>
                                        </span>
                                    </span>
                                </header>

                                <section aria-label={copy.title} className={`pc-auth-card-content ${activeTab === "login" ? "is-login" : "is-register"}`}>
                                    <header className="pc-auth-card-header">
                                        <p className="pc-auth-card-eyebrow">{settings?.firstUser ? "首次设置" : activeTab === "login" ? `${branding.config.identity.shortName}账号` : "新账号"}</p>
                                        <h1 className="pc-auth-card-title">{settings?.firstUser ? "创建第一个管理员" : copy.title}</h1>
                                        <p className="pc-auth-card-description">{settings?.firstUser ? `完成 ${branding.config.identity.displayName} 的首次初始化。` : activeTab === "login" ? "登录后继续上次的创作。" : copy.description}</p>
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
                                </section>

                                <footer className="pc-auth-panel-footer">
                                    <span>{activeTab === "login" ? "还没有账号？" : "已经有账号？"}</span>
                                    <div className="pc-auth-tabs-wrap">
                                        <Tabs className="pc-auth-tabs" activeKey={activeTab} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                                    </div>
                                </footer>
                            </ConfigProvider>
                        </div>
                    </motion.section>
                </div>
            </main>
        </AuthSettingsContext.Provider>
    );
}

export function useAuthSettings() {
    const value = useContext(AuthSettingsContext);
    if (!value) throw new Error("useAuthSettings must be used within AuthScene");
    return value;
}
