import { ArrowRight, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { BrandMark } from "@/components/branding/brand-mark";
import { useBranding } from "@/components/branding/branding-provider";
import { usePublicSite } from "@/components/public-site/public-site-provider";
import { cn } from "@/lib/utils";
import { publicEntryLabel } from "@/lib/public-site-content";
import { useUserStore } from "@/stores/use-user-store";

import "./public-site.css";

const navigation = [
    { to: "/", label: "首页", end: true },
    { to: "/product", label: "产品" },
    { to: "/showcase", label: "创作示例" },
    { to: "/about", label: "关于" },
] as const;

export default function PublicSiteLayout() {
    const location = useLocation();
    const { branding } = useBranding();
    const { site } = usePublicSite();
    const user = useUserStore((state) => state.user);
    const shellRef = useRef<HTMLDivElement>(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const appHref = user ? "/create" : `/login?next=${encodeURIComponent("/create")}`;
    const accountHref = user ? "/settings" : "/login";
    const accountLabel = user ? "账号设置" : "体验说明";

    useEffect(() => {
        setMenuOpen(false);
        if (location.hash) {
            let anchor = location.hash.slice(1);
            try {
                anchor = decodeURIComponent(anchor);
            } catch {
                /* Keep malformed fragments harmless. */
            }
            const scrollToAnchor = () => {
                const target = document.getElementById(anchor);
                if (!target) return false;
                target.scrollIntoView();
                return true;
            };
            if (scrollToAnchor()) return;
            const observer = new MutationObserver(() => {
                if (scrollToAnchor()) observer.disconnect();
            });
            if (shellRef.current) observer.observe(shellRef.current, { childList: true, subtree: true });
            return () => observer.disconnect();
        }
        shellRef.current?.scrollTo({ top: 0, behavior: "auto" });
    }, [location.pathname, location.hash]);

    useEffect(() => {
        if (!menuOpen) return;
        const header = menuButtonRef.current?.closest("header");
        header?.querySelector<HTMLElement>("nav a")?.focus();
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
            }
            if (event.key === "Tab" && header) {
                const controls = [...header.querySelectorAll<HTMLElement>("a,button")].filter((element) => element.getClientRects().length > 0);
                const first = controls[0];
                const last = controls.at(-1);
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first?.focus();
                }
            }
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [menuOpen]);

    useEffect(() => {
        const media = window.matchMedia("(min-width: 768px)");
        const closeOnDesktop = () => {
            if (media.matches) setMenuOpen(false);
        };
        media.addEventListener("change", closeOnDesktop);
        return () => media.removeEventListener("change", closeOnDesktop);
    }, []);

    return (
        <div ref={shellRef} className={cn("public-site-shell", menuOpen && "is-menu-open")}>
            <a className="public-skip-link" href="#main-content">
                跳转到正文
            </a>
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

                <nav id="public-navigation" className={cn("public-site-navigation", menuOpen && "is-open")} aria-label="官网导航">
                    {navigation.map((item) => (
                        <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : undefined} onClick={() => setMenuOpen(false)}>
                            {item.label}
                        </NavLink>
                    ))}
                    <div className="public-site-mobile-actions">
                        <Link to={user ? accountHref : "/#experience"}>{accountLabel}</Link>
                        <Link className="is-primary" to={appHref}>
                            {publicEntryLabel(Boolean(user))}
                        </Link>
                    </div>
                </nav>

                <div className="public-site-header-actions">
                    <Link to={user ? accountHref : "/#experience"} className="public-site-login-link">
                        {accountLabel}
                    </Link>
                    <Link to={appHref} className="public-site-enter-link">
                        {publicEntryLabel(Boolean(user))}
                        <ArrowRight aria-hidden="true" />
                    </Link>
                    <button ref={menuButtonRef} type="button" className="public-site-menu-button" aria-label={menuOpen ? "关闭导航" : "打开导航"} aria-controls="public-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
                        {menuOpen ? <X /> : <Menu />}
                    </button>
                </div>
            </header>

            <div inert={menuOpen}>
                <Outlet />
            </div>

            <footer className="public-site-footer" inert={menuOpen}>
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
                </div>
                <div className="public-site-footer-meta">
                    <span>
                        © {new Date().getFullYear()} {branding.config.identity.displayName}
                    </span>
                    {site.config.links.icpText ? (
                        <a href={site.config.links.icpUrl || "https://beian.miit.gov.cn/"} target="_blank" rel="noreferrer">
                            {site.config.links.icpText}
                        </a>
                    ) : null}
                    <span>让故事开机</span>
                </div>
            </footer>
        </div>
    );
}
