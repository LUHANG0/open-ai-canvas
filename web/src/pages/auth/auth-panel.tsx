import { ConfigProvider, Tabs } from "antd";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useBranding } from "@/components/branding/branding-provider";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { getAntThemeConfig } from "@/lib/app-theme";
import { withBrandingAntTheme } from "@/lib/branding-theme";
import type { AuthMode, AuthPageComponent } from "./auth-route-loader";
import { useAuthSettings } from "./auth-settings-provider";
import "./auth-form.css";

export function AuthPanel({ mode, Page }: { mode: AuthMode; Page: AuthPageComponent }) {
    const location = useLocation();
    const navigate = useNavigate();
    const desktop = usePcBrandViewport();
    const { branding } = useBranding();
    const { settings, error, refresh } = useAuthSettings();
    const inviteFlow = mode === "register" && (new URLSearchParams(location.search).has("invite") || new URLSearchParams(location.search).get("invited") === "1");
    const publicRegistrationAvailable = Boolean(settings?.registrationEnabled && (!settings.emailCodeRequired || settings.emailEnabled));
    const invitationOnly = Boolean(settings && !settings.firstUser && !publicRegistrationAvailable);
    const tabs = useMemo(() => {
        if (settings?.firstUser) return [{ key: "register", label: "创建管理员" }];
        if (inviteFlow)
            return [
                { key: "register", label: "受邀注册" },
                { key: "login", label: "登录" },
            ];
        if (!publicRegistrationAvailable) return [{ key: "login", label: "登录" }];
        return [
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
        ];
    }, [inviteFlow, publicRegistrationAvailable, settings]);

    return (
        <div className="pc-auth-workspace">
            <section className="pc-auth-panel" aria-label={`${branding.config.identity.displayName}账号入口`}>
                <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(true, desktop), branding.config.theme.primaryColor, true)}>
                    <header className="pc-auth-brand-head">
                        <span className="pc-auth-eyebrow">{mode === "login" ? "WELCOME BACK" : "YOUR FIRST STORY"}</span>
                        <h1>{inviteFlow ? `你已受邀加入${branding.config.identity.displayName}` : settings?.firstUser ? "创建第一个管理员" : mode === "login" ? `登录${branding.config.identity.shortName}` : "创建账号"}</h1>
                        <p>{mode === "login" ? branding.config.auth.description || "进入工作台，继续你的创作。" : "从这里开始你的第一段创作。"}</p>
                    </header>
                    {error && mode === "login" ? (
                        <button type="button" className="pc-auth-settings-retry" onClick={() => void refresh()}>
                            登录方式暂未完整加载，点击重试
                        </button>
                    ) : null}
                    <div className="pc-auth-form-slot">
                        <Page />
                    </div>
                    <footer className="pc-auth-panel-footer">
                        {invitationOnly && mode === "login" ? (
                            <>
                                <span className="pc-auth-invitation-badge">
                                    <i /> 邀请体验中
                                </span>
                                <p>仅限受邀成员使用，需要账号请联系团队管理员。</p>
                                <Link to="/#experience">了解邀请体验 →</Link>
                            </>
                        ) : (
                            <span>{mode === "login" ? (publicRegistrationAvailable ? "还没有账号？" : "收到邀请后，可使用邀请链接创建账号。") : "已经有账号？"}</span>
                        )}
                        {tabs.length > 1 ? (
                            <div className="pc-auth-tabs-wrap">
                                <Tabs className="pc-auth-tabs" activeKey={mode} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                            </div>
                        ) : null}
                    </footer>
                </ConfigProvider>
            </section>
        </div>
    );
}
