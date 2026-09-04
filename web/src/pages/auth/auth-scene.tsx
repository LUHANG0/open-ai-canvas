import { Button } from "antd";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { BRAND_CONCEPT_POSTER } from "@/lib/public-site-content";
import { AuthMedia } from "./auth-media";
import { AuthPanel } from "./auth-panel";
import { getCachedAuthPages, type AuthMode, type AuthPages, preloadAuthPages } from "./auth-route-loader";
import { AuthSettingsProvider, useAuthSettings } from "./auth-settings-provider";
import "./auth-scene.css";

export function AuthScene() {
    return (
        <AuthSettingsProvider>
            <AuthSceneContent />
        </AuthSettingsProvider>
    );
}

function AuthSceneContent() {
    const location = useLocation();
    const navigate = useNavigate();
    const { branding } = useBranding();
    const { site } = usePublicSite();
    const { settings } = useAuthSettings();
    const inviteFlow = location.pathname === "/register" && new URLSearchParams(location.search).has("invite");
    const invitedFlow = location.pathname === "/register" && new URLSearchParams(location.search).get("invited") === "1";
    const [pages, setPages] = useState<Partial<AuthPages>>(getCachedAuthPages);
    const [pageError, setPageError] = useState(false);
    const [retry, setRetry] = useState(0);
    const mode: AuthMode = location.pathname === "/register" ? "register" : "login";
    const ActivePage = pages[mode];

    useEffect(() => {
        let active = true;
        setPageError(false);
        void preloadAuthPages()
            .then((loadedPages) => {
                if (active) setPages(loadedPages);
            })
            .catch(() => {
                if (active) setPageError(true);
            });
        return () => {
            active = false;
        };
    }, [retry]);

    useEffect(() => {
        if (!settings) return;
        if (settings.firstUser && mode !== "register") {
            navigate({ pathname: "/register", search: location.search }, { replace: true });
            return;
        }
        if (!settings.firstUser && !settings.registrationEnabled && mode === "register" && !inviteFlow && !invitedFlow) {
            navigate({ pathname: "/login", search: location.search }, { replace: true });
        }
    }, [inviteFlow, invitedFlow, location.search, mode, navigate, settings]);

    return (
        <main className="pc-auth-scene">
            <AuthMedia />
            <header className="pc-auth-page-header">
                <Link className="pc-auth-story-brand" to="/" aria-label="返回官网">
                    <BrandMark className="pc-auth-story-logo" />
                    <span>
                        {branding.config.identity.displayName}
                        <small>AI FILM WORKSPACE</small>
                    </span>
                </Link>
                <Link className="pc-auth-back-link" to="/">
                    <ArrowLeft aria-hidden="true" /> 返回官网
                </Link>
            </header>
            <section className="pc-auth-access-body">
                {ActivePage ? (
                    <AuthPanel mode={mode} Page={ActivePage} />
                ) : (
                    <div className="pc-auth-page-loading" role={pageError ? "alert" : "status"}>
                        <h1>{pageError ? "暂时无法打开账号入口" : "正在准备账号入口"}</h1>
                        <p>{pageError ? "请检查网络后重试。" : "马上就好。"}</p>
                        {pageError ? <Button onClick={() => setRetry((value) => value + 1)}>重新加载</Button> : null}
                    </div>
                )}
            </section>
            <footer className="pc-auth-page-footer">
                <p className="pc-auth-page-motto">{branding.config.auth.title || "让故事开机。"}</p>
                <div className="pc-auth-site-footer">
                    <span>
                        © {new Date().getFullYear()} {branding.config.identity.displayName}
                    </span>
                    {site.config.links.icpText ? (
                        <a href={site.config.links.icpUrl || "https://beian.miit.gov.cn/"} target="_blank" rel="noreferrer">
                            {site.config.links.icpText}
                        </a>
                    ) : null}
                    <span className="pc-auth-story-caption">{!site.config.hero.posterUrl || site.config.hero.posterUrl === BRAND_CONCEPT_POSTER ? "《最后一班》 · AI 品牌概念视觉" : "YOUR NEXT STORY STARTS HERE"}</span>
                </div>
            </footer>
        </main>
    );
}
