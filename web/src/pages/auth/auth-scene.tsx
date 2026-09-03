import { motion, useReducedMotion } from "motion/react";
import { ConfigProvider, Tabs } from "antd";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Play, ShieldCheck } from "lucide-react";
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
        eyebrow: "WELCOME BACK",
        title: "进入创作现场",
        description: "继续编辑你的画布、素材与生成任务。",
    },
    register: {
        eyebrow: "CREATE ACCOUNT",
        title: "建立你的创作空间",
        description: "一个账号管理画布、素材、技能和模型偏好。",
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
                <div className="pc-auth-layout grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1.32fr)_minmax(520px,1fr)]">
                    <section className="pc-auth-brand relative min-h-[250px] overflow-hidden sm:min-h-[320px] lg:min-h-0" aria-label={`${branding.config.identity.displayName}品牌介绍`}>
                        {showVideo ? (
                            <video
                                className="pc-auth-brand-video absolute inset-0 size-full object-cover"
                                src={hero.authHeroUrl}
                                poster={hero.authHeroPosterUrl || undefined}
                                autoPlay
                                muted
                                loop
                                playsInline
                                preload="metadata"
                                aria-hidden="true"
                                onError={() => setHeroFailed(true)}
                            />
                        ) : showImage || showPoster ? (
                            <img className="pc-auth-brand-video absolute inset-0 size-full object-cover" src={showImage ? hero.authHeroUrl : hero.authHeroPosterUrl} alt="" aria-hidden="true" onError={() => setHeroFailed(true)} />
                        ) : null}
                        {!showVideo && !showImage && !showPoster ? <div aria-hidden className="pc-auth-brand-ambient absolute inset-0" /> : null}
                        <div aria-hidden className="pc-auth-brand-shade absolute inset-0" />
                        <div aria-hidden className="pc-auth-brand-fade absolute inset-y-0 right-0 hidden lg:block" />
                        <div className="pc-auth-brand-nav absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-5 sm:p-7 lg:p-9">
                            <div className="pc-auth-brand-link inline-flex items-center gap-2.5 text-sm font-semibold text-white drop-shadow-sm">
                                <BrandMark className="pc-auth-brand-logo size-7" />
                                <span>{branding.config.identity.displayName}</span>
                            </div>
                            {branding.config.auth.liveBadge ? (
                                <span className="pc-auth-live-badge inline-flex items-center gap-2 border px-3 py-1.5 text-[var(--fs-label)] backdrop-blur-xl">
                                    <Play className="size-3 fill-current" />
                                    {branding.config.auth.liveBadge}
                                </span>
                            ) : null}
                        </div>
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                            className="pc-auth-brand-copy absolute inset-x-0 bottom-0 max-w-2xl p-5 sm:p-7 lg:p-10"
                        >
                            {branding.config.auth.eyebrow ? <p className="pc-auth-brand-eyebrow">{branding.config.auth.eyebrow}</p> : null}
                            <h1 className="pc-auth-brand-title">{branding.config.auth.title}</h1>
                            {branding.config.auth.description ? <p className="pc-auth-brand-summary">{branding.config.auth.description}</p> : null}
                            <div className="pc-auth-brand-capabilities" aria-label="核心创作能力">
                                <span>素材管理</span>
                                <span>生成任务</span>
                                <span>画布编排</span>
                            </div>
                        </motion.div>
                    </section>

                    <section className="pc-auth-panel relative flex min-h-[620px] items-start justify-center overflow-y-auto px-4 pb-8 pt-16 sm:px-8 lg:min-h-0 lg:px-10 lg:pb-10 lg:pt-20">
                        <div className="pc-auth-security-badge absolute right-5 top-5 inline-flex items-center gap-2 text-xs text-white/46 lg:right-8 lg:top-8">
                            <ShieldCheck className="size-3.5" aria-hidden="true" />
                            安全登录
                        </div>
                        <motion.div
                            initial={reducedMotion ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            layout={!reducedMotion}
                            transition={{ duration: aceternityMotion.duration.panel, ease: aceternityMotion.easing.enter }}
                            className="pc-auth-card-wrap my-auto w-full max-w-[460px]"
                        >
                            <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(true, desktop), branding.config.theme.primaryColor, true)}>
                                <div className="auth-card-dark pc-auth-card h-auto overflow-hidden backdrop-blur-2xl">
                                    <section aria-label={copy.title} className={`pc-auth-card-content flex flex-col ${activeTab === "login" ? "is-login" : "is-register"}`}>
                                        <header className="pc-auth-card-header">
                                            <p className="pc-auth-card-eyebrow">{settings?.firstUser ? "INITIAL SETUP" : copy.eyebrow}</p>
                                            <h2 className="pc-auth-card-title">{settings?.firstUser ? "创建第一个管理员" : copy.title}</h2>
                                            <p className="pc-auth-card-description">{settings?.firstUser ? `完成 ${branding.config.identity.displayName} 的首次初始化。` : copy.description}</p>
                                        </header>
                                        <div className="px-6 sm:px-8">
                                            <Tabs className="auth-card-tabs pc-auth-tabs" activeKey={activeTab} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                                        </div>
                                        <div key={location.pathname} className="pc-auth-form-slot flex-1">
                                            <Outlet />
                                        </div>
                                    </section>
                                </div>
                            </ConfigProvider>
                        </motion.div>
                    </section>
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
