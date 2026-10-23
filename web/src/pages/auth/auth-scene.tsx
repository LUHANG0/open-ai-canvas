import { useReducedMotion } from "motion/react";
import { ArrowLeft, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { SiteComplianceFooter } from "@/components/layout/site-compliance-footer";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { useThemeStore } from "@/stores/use-theme-store";

const AUTH_TABS = [
    { key: "login", label: "登录" },
    { key: "register", label: "注册" },
];

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
    recovery: {
        eyebrow: "ACCOUNT RECOVERY",
        title: "重新设置密码",
        description: "验证账号邮箱后，设置一个新的登录密码。",
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
    const appearance = useAppearanceStore((state) => state.appearance);
    const theme = useThemeStore((state) => state.theme);
    const location = useLocation();
    const navigate = useNavigate();
    const reducedMotion = useReducedMotion();
    const videoRef = useRef<HTMLVideoElement>(null);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const [manualVideoActive, setManualVideoActive] = useState(false);
    const [videoPlaying, setVideoPlaying] = useState(false);
    const [failedPosterURL, setFailedPosterURL] = useState("");
    const recovery = location.pathname === "/forgot-password";
    const activeTab = location.pathname === "/register" ? "register" : "login";
    const copy = recovery ? authCopy.recovery : activeTab === "register" ? authCopy.register : authCopy.login;
    const automaticVideoActive = appearance.authVideoAutoplay && !reducedMotion;
    const videoActive = Boolean(appearance.authVideoUrl && (automaticVideoActive || manualVideoActive));

    useEffect(() => {
        setManualVideoActive(false);
        setVideoPlaying(false);
    }, [appearance.authVideoUrl, appearance.authVideoAutoplay]);

    const playVideo = () => {
        setManualVideoActive(true);
        requestAnimationFrame(() => {
            void videoRef.current?.play().catch(() => setVideoPlaying(false));
        });
    };

    return (
        <main className="auth-scene h-dvh min-h-0 overflow-y-auto lg:overflow-hidden">
            <div className="grid min-h-full lg:h-full lg:grid-cols-[minmax(0,1.32fr)_minmax(520px,1fr)]">
                <section className="auth-scene-hero relative min-h-[250px] overflow-hidden sm:min-h-[320px] lg:min-h-0" aria-label={`${appearance.brandName}品牌影片`}>
                    {videoActive && appearance.authVideoUrl ? <video ref={videoRef} className="absolute inset-0 size-full object-cover" src={appearance.authVideoUrl} poster={appearance.authVideoPosterUrl || undefined} autoPlay muted loop playsInline preload="metadata" onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} /> : appearance.authVideoPosterUrl && failedPosterURL !== appearance.authVideoPosterUrl ? <img className="absolute inset-0 size-full object-cover" src={appearance.authVideoPosterUrl} alt="" decoding="async" onError={() => setFailedPosterURL(appearance.authVideoPosterUrl)} /> : null}
                    <div aria-hidden className="auth-scene-hero-overlay absolute inset-0" />
                    <div aria-hidden className="auth-scene-video-blend absolute inset-y-0 right-0 hidden w-[clamp(120px,14vw,240px)] lg:block" />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-4 p-5 sm:p-7 lg:p-9">
                        <Link to="/" className="auth-scene-brand inline-flex items-center gap-2.5 rounded-sm text-sm font-semibold transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--control-focus-ring)]">
                            <BrandLogo theme={theme} className="size-7" alt="" fallback={<span className="size-7 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />} />
                            {appearance.brandName}
                        </Link>
                        <button type="button" className="auth-scene-hero-control inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[var(--fs-label)] backdrop-blur-xl transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--control-focus-ring)] disabled:cursor-default disabled:opacity-45" onClick={playVideo} disabled={videoPlaying || !appearance.authVideoUrl} aria-pressed={videoPlaying}>
                            <Play className="size-3 fill-current" aria-hidden="true" />
                            {videoPlaying ? "创作正在发生" : "播放品牌影片"}
                        </button>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 max-w-2xl p-5 sm:p-7 lg:p-10">
                        <p className="auth-scene-hero-muted text-xs font-semibold tracking-[0.18em]">{brandStudioLabel(appearance)}</p>
                        <h1 className="auth-scene-hero-title mt-3 max-w-xl whitespace-pre-line text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{appearance.authHeroTitle}</h1>
                        {appearance.authHeroDescription ? <p className="auth-scene-hero-muted mt-4 max-w-xl whitespace-pre-line text-sm leading-6 sm:text-base sm:leading-7">{appearance.authHeroDescription}</p> : null}
                    </div>
                </section>

                <section className="auth-scene-form-pane relative flex min-h-[660px] flex-col items-center overflow-y-auto px-4 pt-20 sm:px-8 lg:min-h-0 lg:px-10 lg:pt-20">
                    <Link to="/" className="auth-scene-return absolute right-5 top-5 z-20 inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs backdrop-blur-xl transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--control-focus-ring)] lg:right-8 lg:top-8">
                        <ArrowLeft className="size-3.5" aria-hidden="true" />
                        返回首页
                    </Link>

                    <div className="flex w-full flex-1 items-center justify-center">
                        <div className="my-auto w-full max-w-[460px]">
                            <div className="auth-scene-card h-auto overflow-hidden rounded-lg backdrop-blur-2xl">
                                <section aria-label={copy.title} className={`flex flex-col ${recovery ? "min-h-[600px]" : activeTab === "login" ? "" : "min-h-[620px] sm:min-h-[640px]"}`}>
                                    <header className="px-6 pb-5 pt-6 sm:px-8 sm:pt-7">
                                        <p className="auth-scene-eyebrow text-xs font-semibold tracking-[0.18em]">{copy.eyebrow}</p>
                                        <h2 className="mt-2 text-3xl font-semibold">{copy.title}</h2>
                                        <p className="auth-scene-muted mt-2 text-sm leading-6">{copy.description}</p>
                                    </header>
                                    {!recovery ? (
                                        <div className="px-6 sm:px-8">
                                            <div className="app-control-group w-full" role="tablist" aria-label="账户入口">
                                                {AUTH_TABS.map((tab, index) => (
                                                    <button
                                                        key={tab.key}
                                                        ref={(element) => { tabRefs.current[index] = element; }}
                                                        type="button"
                                                        id={`auth-tab-${tab.key}`}
                                                        role="tab"
                                                        data-slot="control-item"
                                                        style={{ flex: "1 1 0%" }}
                                                        aria-selected={activeTab === tab.key}
                                                        aria-controls={`auth-panel-${tab.key}`}
                                                        tabIndex={activeTab === tab.key ? 0 : -1}
                                                        onClick={() => {
                                                            if (tab.key !== activeTab) navigate({ pathname: tab.key === "register" ? "/register" : "/login", search: location.search });
                                                        }}
                                                        onKeyDown={(event) => {
                                                            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                                                            event.preventDefault();
                                                            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? AUTH_TABS.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + AUTH_TABS.length) % AUTH_TABS.length;
                                                            tabRefs.current[nextIndex]?.focus();
                                                            if (AUTH_TABS[nextIndex].key !== activeTab) navigate({ pathname: AUTH_TABS[nextIndex].key === "register" ? "/register" : "/login", search: location.search });
                                                        }}
                                                    >
                                                        <span data-slot="control-label">{tab.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                    {!recovery ? <div id={`auth-panel-${activeTab === "login" ? "register" : "login"}`} role="tabpanel" aria-labelledby={`auth-tab-${activeTab === "login" ? "register" : "login"}`} hidden /> : null}
                                    <div key={location.pathname} id={recovery ? undefined : `auth-panel-${activeTab}`} role={recovery ? undefined : "tabpanel"} aria-labelledby={recovery ? undefined : `auth-tab-${activeTab}`} tabIndex={recovery ? undefined : 0} className={`${!recovery && activeTab === "login" ? "" : "flex-1"} px-6 py-6 sm:px-8 sm:py-7 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--control-focus-ring)]`}>
                                        <Outlet />
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>
                    <SiteComplianceFooter variant="auth" className="relative inset-auto w-full shrink-0" />
                </section>
            </div>
        </main>
    );
}
