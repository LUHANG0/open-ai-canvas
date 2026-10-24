import { ArrowLeft } from "lucide-react";
import { ConfigProvider } from "antd";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";

import { BrandLogo } from "@/components/brand/brand-logo";
import { SiteComplianceFooter } from "@/components/layout/site-compliance-footer";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { getAuthSession } from "@/services/api/auth";
import { loadLoginPage, loadRegisterPage, preloadAuthRoute } from "@/lib/auth-route-modules";
import { safeAuthNext } from "@/lib/auth-navigation";
import { AuthFormPending } from "./auth-form-pending";
import "./auth-scene.css";

const AUTH_TABS = [
    { key: "login", label: "登录" },
    { key: "register", label: "注册" },
] as const;
const AUTH_LOADERS = { login: loadLoginPage, register: loadRegisterPage };

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
    const [identity, setIdentity] = useState<"checking" | "guest" | "member" | "failed">("checking");
    const [sessionRetry, setSessionRetry] = useState(0);
    const [pendingTab, setPendingTab] = useState<"login" | "register" | null>(null);
    const [routeError, setRouteError] = useState(false);
    const [pageVisible, setPageVisible] = useState(true);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const switchRequest = useRef(0);
    const requestedTab = useRef<"login" | "register">("login");
    const keyboardSwitch = useRef(false);
    const [artwork] = useState(() => {
        const candidate = (location.state as { brandArtwork?: unknown } | null)?.brandArtwork;
        if (typeof candidate !== "string") return "/brand/b/wave.webp";
        if (/^\/(?:brand\/|api\/public\/brand-site\/media\/)/.test(candidate) || candidate.startsWith("https://ik.imagekit.io/ff5bkg98p/")) return candidate;
        return "/brand/b/wave.webp";
    });
    const recovery = location.pathname === "/forgot-password";
    const invitation = location.pathname.startsWith("/i/");
    const hasTabs = !recovery && !invitation;
    const activeTab = location.pathname === "/register" ? "register" : "login";
    const title = invitation ? "加入梦层" : recovery ? "找回密码" : activeTab === "register" ? "创建账号" : `登录${appearance.brandName}`;
    const description = invitation ? "接受邀请，开始你的创作。" : recovery ? "通过账号邮箱验证身份，重新设置密码。" : activeTab === "register" ? "准备好开始你的下一次创作。" : "继续你的故事与创作。";
    const changeTab = async (key: "login" | "register", keyboard = false) => {
        const request = ++switchRequest.current;
        if (!recovery && key === activeTab) { setPendingTab(null); setRouteError(false); return; }
        requestedTab.current = key;
        setPendingTab(key); setRouteError(false);
        try {
            await AUTH_LOADERS[key]();
            if (request !== switchRequest.current) return;
            keyboardSwitch.current = keyboard;
            void navigate({ pathname: `/${key}`, search: location.search }, { state: location.state, viewTransition: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches });
        } catch { if (request === switchRequest.current) setRouteError(true); }
        finally { if (request === switchRequest.current) setPendingTab(null); }
    };

    useEffect(() => {
        if (!keyboardSwitch.current) titleRef.current?.focus({ preventScroll: true });
        keyboardSwitch.current = false;
        return () => { switchRequest.current++; };
    }, [location.pathname]);
    useEffect(() => {
        const change = () => setPageVisible(document.visibilityState !== "hidden");
        change(); document.addEventListener("visibilitychange", change);
        return () => document.removeEventListener("visibilitychange", change);
    }, []);

    useEffect(() => {
        let active = true;
        setIdentity("checking");
        // Identity only: workspace caches and model data start after entering the workspace.
        void getAuthSession().then((session) => {
            if (active) setIdentity(session.user ? "member" : "guest");
        }).catch(() => { if (active) setIdentity("failed"); });
        return () => { active = false; };
    }, [sessionRetry]);

    if (location.pathname === "/login" && identity === "member") {
        const requested = new URLSearchParams(location.search).get("next");
        const next = safeAuthNext(requested);
        return <Navigate to={next} replace />;
    }

    return (
        <ConfigProvider theme={getAntThemeConfig(true, appearance.activeSkin)}>
            <main className="auth-scene auth-scene-simple" data-studio-theme={theme} data-page-visible={pageVisible || undefined}>
                <header className="auth-scene-navigation">
                    <Link to="/" viewTransition className="auth-scene-brand">
                        <BrandLogo theme="dark" className="size-8" alt="" fallback={<span className="size-8 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />} />
                        <span>
                            {appearance.brandName}
                            <small>{brandStudioLabel(appearance)}</small>
                        </span>
                    </Link>
                    <Link to="/" viewTransition className="auth-scene-return">
                        <ArrowLeft aria-hidden="true" />
                        返回官网
                    </Link>
                </header>
                <div className="auth-scene-content">
                    <section className="auth-scene-card" aria-labelledby="auth-scene-title">
                        <header className="auth-scene-heading">
                            <h1 id="auth-scene-title" ref={titleRef} tabIndex={-1}>{title}</h1>
                            <p className="auth-scene-muted">{description}</p>
                        </header>
                        {hasTabs && (
                            <div className="app-control-group auth-scene-tabs" role="tablist" aria-label="账户入口" data-active={activeTab} aria-busy={Boolean(pendingTab)}>
                                <span className="auth-scene-tab-indicator" aria-hidden="true" />
                                {AUTH_TABS.map((tab, index) => (
                                    <button
                                        key={tab.key}
                                        ref={(element) => {
                                            tabRefs.current[index] = element;
                                        }}
                                        type="button"
                                        id={`auth-tab-${tab.key}`}
                                        role="tab"
                                        data-slot="control-item"
                                        aria-selected={activeTab === tab.key}
                                        aria-controls={`auth-panel-${tab.key}`}
                                        tabIndex={activeTab === tab.key ? 0 : -1}
                                        onPointerEnter={() => preloadAuthRoute(`/${tab.key}`)}
                                        onFocus={() => preloadAuthRoute(`/${tab.key}`)}
                                        onClick={() => { void changeTab(tab.key); }}
                                        onKeyDown={(event) => {
                                            if (
                                                event.defaultPrevented ||
                                                event.nativeEvent.isComposing ||
                                                event.nativeEvent.keyCode === 229 ||
                                                event.altKey ||
                                                event.ctrlKey ||
                                                event.metaKey ||
                                                event.shiftKey ||
                                                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                                            )
                                                return;
                                            event.preventDefault();
                                            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? AUTH_TABS.length - 1 : (index + (event.key === "ArrowLeft" ? -1 : 1) + AUTH_TABS.length) % AUTH_TABS.length;
                                            tabRefs.current[nextIndex]?.focus();
                                            void changeTab(AUTH_TABS[nextIndex].key, true);
                                        }}
                                    >
                                        <span data-slot="control-label">{tab.label}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {hasTabs && <div id={`auth-panel-${activeTab === "login" ? "register" : "login"}`} role="tabpanel" aria-labelledby={`auth-tab-${activeTab === "login" ? "register" : "login"}`} hidden />}
                        {routeError && <div className="auth-session-notice auth-scene-notice" role="alert"><span>页面暂时无法加载，请重试。</span><button type="button" className="auth-scene-link" onClick={() => { void changeTab(requestedTab.current); }}>重新加载</button></div>}
                        <div id={hasTabs ? `auth-panel-${activeTab}` : undefined} role={hasTabs ? "tabpanel" : undefined} aria-labelledby={hasTabs ? `auth-tab-${activeTab}` : undefined} className="auth-scene-fields">
                            {location.pathname === "/login" && identity === "checking" ? <AuthFormPending message="正在确认登录状态" /> : <>
                                {location.pathname === "/login" && identity === "failed" && <div className="auth-session-notice auth-scene-notice" role="alert">
                                    <span>暂时无法确认登录状态，可重试检查或继续使用表单登录。</span>
                                    <button type="button" className="auth-scene-link" onClick={() => setSessionRetry((value) => value + 1)}>重试检查</button>
                                </div>}
                                <Outlet />
                            </>}
                        </div>
                    </section>
                    <figure className="auth-scene-artwork" aria-hidden="true">
                        <img src={artwork} alt="" fetchPriority="high" decoding="async" onError={(event) => { if (!event.currentTarget.src.endsWith("/brand/b/wave.webp")) event.currentTarget.src = "/brand/b/wave.webp"; }} />
                    </figure>
                </div>
                <SiteComplianceFooter variant="auth" className="auth-scene-footer" />
            </main>
        </ConfigProvider>
    );
}
