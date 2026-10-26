import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { ConfigProvider } from "antd";
import { useNavigate } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal";
import { getAntThemeConfig } from "@/lib/app-theme";
import { loadForgotPasswordPage, loadInvitationPage, loadLoginPage, loadRegisterPage } from "@/lib/auth-route-modules";
import { getAuthSession, getAuthSettings } from "@/services/api/auth";
import { brandStudioLabel, useAppearanceStore } from "@/stores/use-appearance-store";
import { AuthFormPending } from "@/pages/auth/auth-form-pending";
import { useAuthReducedMotion } from "@/pages/auth/use-auth-motion";
import { BrandLogo } from "./brand-logo";
import BrandAuthShowcase from "./brand-auth-showcase";
import { clearAuthNavigation } from "@/lib/auth-navigation";
import { BrandAuthFlow, type BrandAuthMode } from "./brand-auth-entry";
import "@/pages/auth/auth-scene.css";
import "./brand-auth-dialog.css";

const loaders = { login: loadLoginPage, register: loadRegisterPage, "forgot-password": loadForgotPasswordPage, invitation: loadInvitationPage };
const loadInvitationEntry = () => import("./brand-invitation-entry");
const tabs = ["login", "register"] as const;
function loopDialogTab(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const dialog = event.currentTarget.querySelector<HTMLElement>('[role="dialog"]');
    if (!(event.target instanceof Element) || event.target.closest('[role="dialog"]') !== dialog || !dialog) return;
    const items = [...dialog.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href],[tabindex]')].filter((element) => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[hidden],[inert]") && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
    const first = items[0], last = items[items.length - 1];
    // Keep the boundary key in the document; native focusin cannot catch browser chrome.
    if (event.shiftKey && document.activeElement === first || !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
    }
}
export default function BrandAuthDialog({ next, onClosed, routeMode = "login", onModeChange }: { next: string; onClosed: () => void; routeMode?: BrandAuthMode; onModeChange?: (mode: BrandAuthMode) => void }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const navigate = useNavigate();
    const [open, setOpen] = useState(true);
    const [mode, setMode] = useState<BrandAuthMode>(routeMode);
    const [pending, setPending] = useState<BrandAuthMode | null>(routeMode);
    const [error, setError] = useState<string>();
    const [sessionFailed, setSessionFailed] = useState(false);
    const [registrationPolicy, setRegistrationPolicy] = useState<"loading" | "open" | "invitation" | "failed">("loading");
    const [Page, setPage] = useState<ComponentType>();
    const request = useRef(0);
    const dismissed = useRef(false);
    const invitationCancellation = useRef(new AbortController());
    const mounted = useRef(true);
    const registrationSettings = useRef<ReturnType<typeof getAuthSettings> | null>(null);
    const panel = useRef<HTMLDivElement>(null);
    const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const animation = useRef<Animation | null>(null);
    const transitionOrigin = useRef<number | null>(null);
    const committedPage = useRef<ComponentType | undefined>(undefined);
    const keyboardCommit = useRef(false);
    const reduced = useAuthReducedMotion();
    const requested = useRef<BrandAuthMode>(routeMode);
    const member = useRef(false);
    const destination = useRef(next);
    destination.current = next;
    const titleRef = useRef<HTMLHeadingElement>(null);
    const titleId = useId();
    const invited = registrationPolicy === "invitation";
    const inviteEntry = mode === "register" && invited;
    const invitationScene = inviteEntry || mode === "invitation";
    const hideTabs = mode === "forgot-password" || mode === "invitation" || inviteEntry;
    const registerLabel = invited ? "受邀加入" : registrationPolicy === "open" ? "注册" : registrationPolicy === "loading" ? "正在读取…" : "重试注册设置";
    const title = mode === "invitation" ? `欢迎加入${appearance.brandName}` : mode === "register" ? invited ? `受邀加入${appearance.brandName}` : registrationPolicy === "open" ? "创建账号" : `加入${appearance.brandName}` : mode === "forgot-password" ? "找回密码" : `欢迎登录${appearance.brandName}`;
    const readRegistrationSettings = () => {
        if (!registrationSettings.current) {
            if (mounted.current && !dismissed.current) setRegistrationPolicy("loading");
            registrationSettings.current = getAuthSettings().then((settings) => {
                if (typeof settings.registrationEnabled !== "boolean") throw new Error("Registration policy unavailable");
                if (mounted.current && !dismissed.current) setRegistrationPolicy(settings.registrationEnabled ? "open" : "invitation");
                return settings;
            }).catch((error) => {
                registrationSettings.current = null;
                if (mounted.current && !dismissed.current) setRegistrationPolicy("failed");
                throw error;
            });
        }
        return registrationSettings.current;
    };
    const close = () => { dismissed.current = true; invitationCancellation.current.abort(); request.current++; animation.current?.cancel(); setOpen(false); };
    const changeMode = async (target: BrandAuthMode, keyboard = false, fromRoute = false) => {
        const id = ++request.current;
        requested.current = target;
        if (target === "login" && member.current) { clearAuthNavigation(); void navigate(destination.current, { replace: true }); return; }
        if (target === mode && Page) { setPage(() => Page); setMode(target); setPending(null); setError(undefined); if (!fromRoute) onModeChange?.(target); return; }
        setPending(target); setError(undefined);
        let readingPolicy = target === "register";
        try {
            const settings = target === "register" ? await readRegistrationSettings() : null;
            readingPolicy = false;
            let module: { default: ComponentType };
            if (target === "register" && settings?.registrationEnabled === false) {
                const { default: InvitationPage } = await loadInvitationEntry();
                const signal = invitationCancellation.current.signal;
                module = { default: () => <InvitationPage signal={signal} canNavigate={() => !dismissed.current && requested.current === "register"} /> };
            } else module = await loaders[target]();
            if (id !== request.current) return;
            transitionOrigin.current = panel.current?.parentElement?.getBoundingClientRect().top ?? null;
            animation.current?.cancel();
            keyboardCommit.current = keyboard;
            setPage(() => module.default); setMode(target);
            if (!fromRoute) onModeChange?.(target);
            if (document.activeElement instanceof HTMLElement && panel.current?.contains(document.activeElement)) tabRefs.current[target === "register" ? 1 : 0]?.focus();
        } catch { if (id === request.current) setError(readingPolicy ? "暂时无法读取注册设置，请重试。" : "表单暂时无法加载，请重试。"); }
        finally { if (id === request.current) setPending(null); }
    };
    useEffect(() => {
        if (routeMode !== requested.current) void changeMode(routeMode, false, true);
    }, [routeMode]);
    useLayoutEffect(() => {
        const changed = committedPage.current !== Page;
        const hadPage = Boolean(committedPage.current);
        const origin = transitionOrigin.current;
        transitionOrigin.current = null;
        committedPage.current = Page;
        animation.current?.cancel();
        if (!changed) return;
        if (panel.current?.parentElement) panel.current.parentElement.scrollTop = 0;
        if (mode === "forgot-password" || mode === "invitation") titleRef.current?.focus({ preventScroll: true });
        const area = panel.current?.parentElement;
        if (!hadPage || keyboardCommit.current || !area?.animate || reduced || origin === null) return;
        const offset = origin - area.getBoundingClientRect().top;
        if (Math.abs(offset) < 1) return;
        animation.current = area.animate([{ transform: `translateY(${offset}px)` }, { transform: "translateY(0)" }], { duration: 160, easing: "cubic-bezier(.23,1,.32,1)" });
    }, [mode, Page, reduced]);
    useEffect(() => {
        let active = true;
        mounted.current = true;
        if (invitationCancellation.current.signal.aborted) invitationCancellation.current = new AbortController();
        // Session discovery must not block opening or typing into the form.
        void changeMode(requested.current, false, true);
        void readRegistrationSettings().catch(() => undefined);
        void getAuthSession().then((session) => {
            if (!active || dismissed.current) return;
            member.current = Boolean(session.user);
            if (session.user && requested.current === "login") { clearAuthNavigation(); void navigate(destination.current, { replace: true }); return; }
        }).catch(() => {
            if (!active || dismissed.current) return;
            setSessionFailed(true);
        });
        return () => { active = false; mounted.current = false; request.current++; invitationCancellation.current.abort(); animation.current?.cancel(); };
    }, []);
    const theme = getAntThemeConfig(true, appearance.activeSkin);
    return <ConfigProvider theme={reduced ? { ...theme, token: { ...theme.token, motion: false } } : theme}>
        <AppModal open={open} onCancel={close} afterClose={onClosed} transitionName={reduced ? "" : undefined} maskTransitionName={reduced ? "" : undefined} centered flush footer={null} width={invitationScene ? 460 : 900} rootClassName="mc-auth-layer" className={mode === "invitation" ? "mc-auth-dialog mc-auth-dialog-invitation" : inviteEntry ? "mc-auth-dialog mc-auth-dialog-entry" : "mc-auth-dialog mc-auth-dialog-standard"} aria-labelledby={titleId} closable={{ "aria-label": mode === "invitation" ? "关闭邀请注册窗口" : mode === "forgot-password" ? "关闭找回密码窗口" : mode === "register" ? "关闭注册窗口" : "关闭登录窗口" }} wrapProps={{ onKeyDown: loopDialogTab }}
            title={<div className="mc-auth-heading">{mode === "invitation" ? <div className="mc-invitation-brand"><BrandLogo theme="dark" alt="" className="mc-auth-symbol" fallback={null} /><span className="mc-invitation-wordmark">{brandStudioLabel(appearance)}</span></div> : <div className="mc-auth-brand"><BrandLogo theme="dark" alt="" className="mc-auth-symbol" fallback={null} /><span aria-hidden="true">{brandStudioLabel(appearance)}</span></div>}<h2 ref={titleRef} tabIndex={-1} id={titleId}>{title}</h2><p>{mode === "invitation" ? "接受邀请，开始你的创作。" : mode === "register" ? invited ? `${appearance.brandName}目前采用邀请制。输入邀请码，加入创作。` : registrationPolicy === "open" ? "创建账号，进入梦层创作台。" : registrationPolicy === "loading" ? "正在读取注册设置。" : "请重试读取注册设置。" : mode === "forgot-password" ? "验证账号邮箱，重新设置密码。" : "回到创作中，让灵感接着发生。"}</p></div>}>
            {!invitationScene && <BrandAuthShowcase open={open} />}
            <div className="mc-auth-body auth-scene-card">
                <div className="mc-auth-tabs" role="tablist" aria-label="账户入口" data-active={mode === "register" ? "register" : "login"} aria-busy={Boolean(pending)} hidden={hideTabs}>
                    {tabs.map((tab, index) => <button key={tab} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${titleId}-${tab}`} aria-selected={mode === tab} aria-controls={`${titleId}-panel`} disabled={tab === "register" && registrationPolicy === "loading"} tabIndex={mode === tab ? 0 : -1} onPointerEnter={() => {
                        if (tab === "register") void readRegistrationSettings().then(async (settings) => { if (settings.registrationEnabled) await loadRegisterPage(); else await loadInvitationEntry(); }).catch(() => undefined);
                        else void loadLoginPage().catch(() => undefined);
                    }} onClick={() => { void changeMode(tab); }} onKeyDown={(event) => {
                        if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault(); const index = registrationPolicy === "loading" || event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "login" ? 1 : 0;
                        tabRefs.current[index]?.focus(); void changeMode(tabs[index], true);
                    }}>{tab === "login" ? "登录" : registerLabel}</button>)}
                </div>
                <div className="mc-auth-scroll">
                    {sessionFailed && mode === "login" && <p className="mc-auth-error" role="status">暂时无法确认登录状态，可继续使用表单登录。</p>}
                    {error && <div role="alert" className="mc-auth-error">{error}<button type="button" onClick={() => { void changeMode(requested.current); }}>重新加载</button><button type="button" onClick={() => window.location.reload()}>刷新页面</button></div>}
                    {Page && pending && pending !== mode && <p className="mc-auth-progress" role="status">{pending === "register" ? "正在准备注册方式…" : pending === "forgot-password" ? "正在准备找回密码…" : "正在准备登录…"}</p>}
                    <div ref={panel} id={`${titleId}-panel`} role={hideTabs ? undefined : "tabpanel"} aria-labelledby={hideTabs ? undefined : `${titleId}-${mode}`} className="auth-scene-fields mc-auth-fields" aria-busy={Boolean(pending)}>
                        <BrandAuthFlow.Provider value={{ next, changeMode: (target) => { void changeMode(target); } }}>{Page ? <Page /> : !error ? <AuthFormPending message={mode === "invitation" ? "正在准备邀请" : mode === "register" ? "正在准备注册入口" : mode === "forgot-password" ? "正在准备找回密码" : "正在准备登录"} /> : null}</BrandAuthFlow.Provider>
                        {mode === "register" && invited && Page && <p className="mc-invitation-login">已有账号？<button type="button" className="auth-scene-link" onClick={() => { void changeMode("login"); }}>登录</button></p>}
                    </div>
                </div>
            </div>
        </AppModal>
    </ConfigProvider>;
}
