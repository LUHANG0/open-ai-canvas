import { ArrowRight, GitFork, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { cn } from "@/lib/utils";
import { useUserStore } from "@/stores/use-user-store";

import "./public-site.css";

const navigation = [
    { to: "/", label: "首页", end: true },
    { to: "/product", label: "产品" },
    { to: "/showcase", label: "作品" },
    { to: "/about", label: "关于" },
] as const;

export default function PublicSiteLayout() {
    const location = useLocation();
    const { branding } = useBranding();
    const { site } = usePublicSite();
    const user = useUserStore((state) => state.user);
    const shellRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const appHref = user ? "/create" : `/login?next=${encodeURIComponent("/create")}`;
    const accountHref = user ? "/settings" : "/login";
    const accountLabel = user ? "账号设置" : "登录";

    useEffect(() => {
        setMenuOpen(false);
        shellRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, [location.pathname]);

    useEffect(() => {
        if (!menuOpen) return;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") setMenuOpen(false);
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [menuOpen]);

    return (
        <div ref={shellRef} className={cn("public-site-shell", menuOpen && "is-menu-open")}>
            <header className="public-site-header">
                <Link to="/" className="public-site-brand" aria-label={`${branding.config.identity.displayName}官网首页`}>
                    <span className="public-site-brand-symbol">
                        <BrandMark className="public-site-brand-mark" />
                    </span>
                    <span className="public-site-brand-copy">
                        <strong>{branding.config.identity.displayName}</strong>
                        <small>{branding.config.identity.englishName || branding.config.identity.workspaceLabel}</small>
                    </span>
                </Link>

                <nav className={cn("public-site-navigation", menuOpen && "is-open")} aria-label="官网导航">
                    {navigation.map((item) => (
                        <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined}>
                            {item.label}
                        </NavLink>
                    ))}
                    <div className="public-site-mobile-actions">
                        <Link to={accountHref}>{accountLabel}</Link>
                        <Link className="is-primary" to={appHref}>
                            {user ? "进入工作台" : site.config.hero.primaryCta}
                        </Link>
                    </div>
                </nav>

                <div className="public-site-header-actions">
                    <Link to={accountHref} className="public-site-login-link">
                        {accountLabel}
                    </Link>
                    <Link to={appHref} className="public-site-enter-link">
                        {user ? "进入工作台" : site.config.hero.primaryCta}
                        <ArrowRight aria-hidden="true" />
                    </Link>
                    <button type="button" className="public-site-menu-button" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
                        {menuOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </header>

            <Outlet />

            <footer className="public-site-footer">
                <div className="public-site-footer-brand">
                    <span className="public-site-footer-symbol">
                        <BrandMark />
                    </span>
                    <div>
                        <strong>{branding.config.identity.displayName}</strong>
                        <p>{branding.config.identity.slogan || branding.config.identity.description}</p>
                    </div>
                </div>
                <div className="public-site-footer-links">
                    {navigation.slice(1).map((item) => (
                        <Link key={item.to} to={item.to}>
                            {item.label}
                        </Link>
                    ))}
                    {site.config.links.docsUrl ? (
                        <a href={site.config.links.docsUrl} target={site.config.links.docsUrl.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                            文档
                        </a>
                    ) : null}
                    {site.config.links.contactUrl ? (
                        <a href={site.config.links.contactUrl} target={site.config.links.contactUrl.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                            联系
                        </a>
                    ) : null}
                    {site.config.links.repositoryUrl ? (
                        <a href={site.config.links.repositoryUrl} target="_blank" rel="noreferrer" aria-label="在新窗口打开 GitHub">
                            <GitFork aria-hidden="true" />
                            GitHub
                        </a>
                    ) : null}
                </div>
                <div className="public-site-footer-meta">
                    <span>
                        © {new Date().getFullYear()} {branding.config.identity.displayName}
                    </span>
                    {site.config.links.icpText ? <span>{site.config.links.icpText}</span> : null}
                    <span>让故事开机</span>
                </div>
            </footer>
        </div>
    );
}
