import { useEffect, useId, useLayoutEffect, useRef, useState, type ComponentType, type KeyboardEvent } from "react";
import { ConfigProvider } from "antd";
import { useNavigate } from "react-router";
import { AppModal } from "@/components/ui/product/app-modal";
import { getAntThemeConfig } from "@/lib/app-theme";
import { loadForgotPasswordPage, loadLoginPage, loadRegisterPage } from "@/lib/auth-route-modules";
import { getAuthSession, getAuthSettings } from "@/services/api/auth";
import { useAppearanceStore } from "@/stores/use-appearance-store";
import { AuthFormPending } from "@/pages/auth/auth-form-pending";
import { BrandLogo } from "./brand-logo";
import { BrandAuthFlow, type BrandAuthMode } from "./brand-auth-entry";
import "@/pages/auth/auth-scene.css";
import "./brand-auth-dialog.css";

const loaders = { login: loadLoginPage, register: loadRegisterPage, "forgot-password": loadForgotPasswordPage };
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
export default function BrandAuthDialog({ next, onClosed }: { next: string; onClosed: () => void }) {
    const appearance = useAppearanceStore((state) => state.appearance);
    const navigate = useNavigate();
    const [open, setOpen] = useState(true);
    const [mode, setMode] = useState<BrandAuthMode>("login");
    const [pending, setPending] = useState<BrandAuthMode | null>("login");
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
    const initial = useRef(true);
    const requested = useRef<BrandAuthMode>("login");
    const titleRef = useRef<HTMLHeadingElement>(null);
    const titleId = useId();
    const invited = registrationPolicy === "invitation";
    const registerLabel = invited ? "内测用户邀请" : registrationPolicy === "open" ? "注册" : "注册入口";
    const title = mode === "register" ? invited ? "内测用户邀请" : "创建账号" : mode === "forgot-password" ? "找回密码" : `登录${appearance.brandName}`;
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
    const changeMode = async (target: BrandAuthMode, keyboard = false) => {
        const id = ++request.current;
        requested.current = target;
        animation.current?.cancel();
        if (target === mode && Page) { setPending(null); setError(undefined); return; }
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
            if (Page && !keyboard && panel.current?.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                animation.current = panel.current.animate([{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], { duration: 120, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" });
                await animation.current.finished.catch(() => undefined);
            }
            if (id !== request.current) return;
            animation.current?.cancel();
            initial.current = keyboard;
            setPage(() => module.default); setMode(target);
            if (document.activeElement instanceof HTMLElement && panel.current?.contains(document.activeElement)) tabRefs.current[target === "register" ? 1 : 0]?.focus();
        } catch { if (id === request.current) setError(readingPolicy ? "暂时无法读取注册设置，请重试。" : "表单暂时无法加载，请重试。"); }
        finally { if (id === request.current) setPending(null); }
    };
    useLayoutEffect(() => {
        if (panel.current?.parentElement) panel.current.parentElement.scrollTop = 0;
        if (mode === "forgot-password") titleRef.current?.focus({ preventScroll: true });
        if (initial.current) { initial.current = false; return; }
        if (!panel.current?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        animation.current = panel.current.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "cubic-bezier(.23,1,.32,1)" });
    }, [mode, Page]);
    useEffect(() => {
        let active = true;
        mounted.current = true;
        const initialRequest = request.current;
        void readRegistrationSettings().catch(() => undefined);
        void getAuthSession().then((session) => {
            if (!active || dismissed.current) return;
            if (session.user) { void navigate(next, { replace: true }); return; }
            if (request.current === initialRequest) void changeMode("login");
        }).catch(() => {
            if (!active || dismissed.current) return;
            setSessionFailed(true);
            if (request.current === initialRequest) void changeMode("login");
        });
        return () => { active = false; mounted.current = false; request.current++; animation.current?.cancel(); };
    }, []);
    return <ConfigProvider theme={getAntThemeConfig(true, appearance.activeSkin)}>
        <AppModal open={open} onCancel={close} afterClose={onClosed} centered flush footer={null} width={468} rootClassName="mc-auth-layer" className="mc-auth-dialog" aria-labelledby={titleId} closable={{ "aria-label": "关闭登录窗口" }} wrapProps={{ onKeyDown: loopDialogTab }}
            title={<div className="mc-auth-heading"><BrandLogo theme="dark" alt="" className="mc-auth-symbol" fallback={null} /><h2 ref={titleRef} tabIndex={-1} id={titleId}>{title}</h2><p>{mode === "register" ? invited ? "输入管理员提供的 6 位邀请码。" : "准备好开始你的下一次创作。" : mode === "forgot-password" ? "验证账号邮箱，重新设置密码。" : "继续你的故事与创作。"}</p></div>}>
            <div className="mc-auth-body auth-scene-card">
                <div className="mc-auth-tabs" role="tablist" aria-label="账户入口" data-active={mode === "register" ? "register" : "login"} aria-busy={Boolean(pending)} hidden={mode === "forgot-password"}>
                    <span aria-hidden="true" className="mc-auth-selection" />
                    {tabs.map((tab, index) => <button key={tab} ref={(element) => { tabRefs.current[index] = element; }} type="button" role="tab" id={`${titleId}-${tab}`} aria-selected={mode === tab} aria-controls={`${titleId}-panel`} tabIndex={mode === tab ? 0 : -1} onPointerEnter={() => {
                        if (tab === "register") void readRegistrationSettings().then(async (settings) => { if (settings.registrationEnabled) await loadRegisterPage(); else await loadInvitationEntry(); }).catch(() => undefined);
                        else void loadLoginPage().catch(() => undefined);
                    }} onClick={() => { void changeMode(tab); }} onKeyDown={(event) => {
                        if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                        event.preventDefault(); const index = event.key === "Home" ? 0 : event.key === "End" ? 1 : tab === "login" ? 1 : 0;
                        tabRefs.current[index]?.focus(); void changeMode(tabs[index], true);
                    }}>{tab === "login" ? "登录" : registerLabel}</button>)}
                </div>
                <div className="mc-auth-scroll">
                    {sessionFailed && mode === "login" && <p className="mc-auth-error" role="status">暂时无法确认登录状态，可继续使用表单登录。</p>}
                    {error && <div role="alert" className="mc-auth-error">{error}<button type="button" onClick={() => { void changeMode(requested.current); }}>重新加载</button></div>}
                    <div ref={panel} id={`${titleId}-panel`} role={mode === "forgot-password" ? undefined : "tabpanel"} aria-labelledby={mode === "forgot-password" ? undefined : `${titleId}-${mode}`} className="auth-scene-fields mc-auth-fields" aria-busy={Boolean(pending)}>
                        <BrandAuthFlow.Provider value={{ next, changeMode: (target) => { void changeMode(target); } }}>{Page ? <Page /> : <AuthFormPending message="正在准备登录" />}</BrandAuthFlow.Provider>
                    </div>
                </div>
            </div>
        </AppModal>
    </ConfigProvider>;
}
