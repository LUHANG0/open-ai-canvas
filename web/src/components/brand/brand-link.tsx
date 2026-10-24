import { useState, type AnchorHTMLAttributes } from "react";
import { Link, useInRouterContext } from "react-router";
import { preloadAuthRoute } from "@/lib/auth-route-modules";
import { preloadBrandAuthDialog, useBrandAuthEntry } from "./brand-auth-entry";

type BrandLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function BrandLink({ href, onPointerEnter, onPointerDown, onFocus, onClick, ...props }: BrandLinkProps) {
    const routed = useInRouterContext();
    const openAuth = useBrandAuthEntry();
    const [artwork, setArtwork] = useState<string>();
    let target: string | undefined;
    if (href.startsWith("/") && !href.startsWith("//")) target = href;
    else if (typeof window !== "undefined" && /^https?:\/\//.test(href)) {
        try {
            const url = new URL(href);
            if (url.origin === window.location.origin) target = url.pathname + url.search + url.hash;
        } catch { /* Keep invalid custom URLs as native anchors; do not crash the renderer. */ }
    }
    if (!routed || !target) return <a href={href} onClick={onClick} onPointerEnter={onPointerEnter} onPointerDown={onPointerDown} onFocus={onFocus} {...props} />;
    const route = target;
    const rememberArtwork = () => {
        if (!route.startsWith("/login")) return;
        if (openAuth) void preloadBrandAuthDialog().catch(() => undefined);
        const media = document.querySelector<HTMLImageElement>('.mc-film-frame[data-active] .mc-motion-media img,.mc-hero-custom-media img');
        setArtwork(media?.getAttribute("src") ?? undefined);
    };
    return <Link to={route} viewTransition={route.startsWith("/login")} state={artwork ? { brandArtwork: artwork } : undefined} {...props} aria-busy={props["aria-busy"] ?? (route.startsWith("/login") && openAuth?.pending ? true : undefined)} onClick={(event) => {
        onClick?.(event);
        if (!openAuth || event.defaultPrevented || props.download !== undefined || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (props.target && props.target !== "_self")) return;
        const url = new URL(route, window.location.origin);
        if (url.pathname !== "/login") return;
        event.preventDefault(); openAuth.open(url.searchParams.get("next") ?? "/create");
    }} onPointerEnter={(event) => { onPointerEnter?.(event); rememberArtwork(); preloadAuthRoute(route); }} onPointerDown={(event) => { onPointerDown?.(event); rememberArtwork(); }} onFocus={(event) => { onFocus?.(event); rememberArtwork(); preloadAuthRoute(route); }} />;
}
