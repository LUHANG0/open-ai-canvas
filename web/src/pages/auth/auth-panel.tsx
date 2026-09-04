import { ConfigProvider, Tabs } from "antd";
import { motion } from "motion/react";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { usePcBrandViewport } from "@/hooks/use-pc-brand-viewport";
import { aceternityMotion } from "@/lib/aceternity-motion";
import { getAntThemeConfig } from "@/lib/app-theme";
import { withBrandingAntTheme } from "@/lib/branding-theme";
import type { AuthMode, AuthPageComponent } from "./auth-route-loader";
import { useAuthSettings } from "./auth-settings-provider";

import "./auth-form.css";

export function AuthPanel({ mode, Page, reducedMotion, onClose }: { mode: AuthMode; Page: AuthPageComponent; reducedMotion: boolean; onClose: () => void }) {
    const location = useLocation();
    const navigate = useNavigate();
    const desktop = usePcBrandViewport();
    const { branding } = useBranding();
    const { settings } = useAuthSettings();
    const inviteFlow = mode === "register" && (new URLSearchParams(location.search).has("invite") || new URLSearchParams(location.search).get("invited") === "1");
    const invitationOnly = Boolean(settings && !settings.firstUser && !settings.registrationEnabled);

    const tabs = useMemo(() => {
        if (settings?.firstUser) return [{ key: "register", label: "创建管理员" }];
        if (inviteFlow)
            return [
                { key: "register", label: "受邀注册" },
                { key: "login", label: "登录" },
            ];
        if (settings && !settings.registrationEnabled) return [{ key: "login", label: "登录" }];
        return [
            { key: "login", label: "登录" },
            { key: "register", label: "注册" },
        ];
    }, [inviteFlow, settings]);

    return (
        <motion.div key="auth" className="pc-auth-workspace" initial={reducedMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.24, ease: aceternityMotion.easing.enter }}>
            <section className="pc-auth-panel" aria-label={`${branding.config.identity.displayName}账号入口`}>
                <button type="button" className="pc-auth-panel-close" onClick={onClose} aria-label="返回视频">
                    <span aria-hidden="true">×</span>
                </button>
                <ConfigProvider theme={withBrandingAntTheme(getAntThemeConfig(true, desktop), branding.config.theme.primaryColor, true)}>
                    <header className="pc-auth-brand-head">
                        <span className="pc-auth-brand-symbol">
                            <BrandMark className="pc-auth-brand-logo" />
                        </span>
                        <h1>{inviteFlow ? "你已受邀加入影策" : settings?.firstUser ? "创建第一个管理员" : mode === "login" ? `登录${branding.config.identity.shortName}` : "创建账号"}</h1>
                    </header>

                    <div className="pc-auth-form-slot">
                        <Page />
                    </div>

                    <footer className="pc-auth-panel-footer">
                        <span>{mode === "login" ? (invitationOnly ? "仅限受邀成员使用，需要账号请联系团队管理员" : "还没有账号？") : "已经有账号？"}</span>
                        <div className="pc-auth-tabs-wrap">
                            <Tabs className="pc-auth-tabs" activeKey={mode} items={tabs} onChange={(key) => navigate({ pathname: key === "register" ? "/register" : "/login", search: location.search })} />
                        </div>
                    </footer>
                </ConfigProvider>
            </section>
        </motion.div>
    );
}
