import { motion, useReducedMotion } from "motion/react";
import { ConfigProvider, Tabs } from "antd";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

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
        title: "继续你的创作",
        description: "回到你的项目、素材与生成现场。",
    },
    register: {
        title: "建立你的创作空间",
        description: "从故事开始，建立属于你的数字片场。",
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
            <main className="pc-auth-scene h-dvh min-h-0 overflow-y-auto text-white lg:overflow-hidden">
                <div className="pc-auth-media-layer" aria-hidden="true">
                    {showVideo ? (
                        <video className="pc-auth-media" src={hero.authHeroUrl} poster={hero.authHeroPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onError={() => setHeroFailed(true)} />
                    ) : showImage || showPoster ? (
                        <img className="pc-auth-media" src={showImage ? hero.authHeroUrl : hero.authHeroPosterUrl} alt="" referrerPolicy="no-referrer" onError={() => setHeroFailed(true)} />
                    ) : (
                        <div className="pc-auth-brand-ambient absolute inset-0" />
                    )}
                    <div className="pc-auth-media-grade" />
                </div>
                <header className="pc-auth-topbar">
                    <Link to="/" className="pc-auth-back-link">
                        <ArrowLeft aria-hidden="true" />
                        返回首页
                    </Link>
                </header>

                <div className="pc-auth-layout">
                    <motion.header
                        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="pc-auth-brand-head"
                        aria-label={`${branding.config.identity.displayName}品牌介绍`}
                    >
                        <Link to="/" className="pc-auth-brand-link" aria-label={`${branding.config.identity.displayName}官网首页`}>
                            <span className="pc-auth-brand-symbol">
                                <BrandMark className="pc-auth-brand-logo" />
                            </span>
                            <strong>{branding.config.identity.displayName}</strong>
                        </Link>
                        <h1 className="pc-auth-brand-title">{branding.config.auth.title}</h1>
                        {branding.config.auth.description ? <p className="pc-auth-brand-summary">{branding.config.auth.description}</p> : null}
                    </motion.header>

                    <motion.div
                        initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        layout={!reducedMotion}
                        transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                        className="pc-auth-card-wrap"
                    >
                        <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(true, desktop), branding.config.theme.primaryColor, true)}>
                            <div className="auth-card-dark pc-auth-card">
                                <section aria-label={copy.title} className={`pc-auth-card-content ${activeTab === "login" ? "is-login" : "is-register"}`}>
                                    <header className="pc-auth-card-header">
                                        <p className="pc-auth-card-eyebrow">{settings?.firstUser ? "首次设置" : activeTab === "login" ? "账号登录" : "创建账号"}</p>
                                        <h2 className="pc-auth-card-title">{settings?.firstUser ? "创建第一个管理员" : copy.title}</h2>
                                        <p className="pc-auth-card-description">{settings?.firstUser ? `完成 ${branding.config.identity.displayName} 的首次初始化。` : copy.description}</p>
                                    </header>
                                    <div className="pc-auth-tabs-wrap">
                                        <Tabs className="auth-card-tabs pc-auth-tabs" activeKey={activeTab} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                                    </div>
                                    <div key={location.pathname} className="pc-auth-form-slot">
                                        <Outlet />
                                    </div>
                                </section>
                            </div>
                        </ConfigProvider>
                    </motion.div>
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
