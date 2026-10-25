import { type AnchorHTMLAttributes } from "react";
import { Link, useInRouterContext } from "react-router";
import { preloadAuthRoute } from "@/lib/auth-route-modules";
import { useBrandAuthEntry } from "./brand-auth-entry";
import { authLink } from "@/lib/auth-navigation";

type BrandLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; authNext?: string };

export function BrandLink({ href, authNext, onPointerEnter, onPointerDown, onFocus, onClick, ...props }: BrandLinkProps) {
    const routed = useInRouterContext();
    const openAuth = useBrandAuthEntry();
    let target: string | undefined;
    if (href.startsWith("/") && !href.startsWith("//")) target = href;
    else if (typeof window !== "undefined" && /^https?:\/\//.test(href)) {
        try {
            const url = new URL(href);
            if (url.origin === window.location.origin) target = url.pathname + url.search + url.hash;
        } catch { /* Keep invalid custom URLs as native anchors; do not crash the renderer. */ }
    }
    if (!routed || !target) return <a href={href} onClick={onClick} onPointerEnter={onPointerEnter} onPointerDown={onPointerDown} onFocus={onFocus} {...props} />;
    const { to: route, state } = authLink(target, authNext);
    return <Link to={route} state={state} {...props} aria-busy={props["aria-busy"] ?? (route.startsWith("/login") && openAuth?.pending ? true : undefined)} onClick={(event) => {
        onClick?.(event);
        if (!openAuth || event.defaultPrevented || props.download !== undefined || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || (props.target && props.target !== "_self")) return;
        const url = new URL(route, window.location.origin);
        if (url.pathname !== "/login") return;
        event.preventDefault(); openAuth.open(route, state);
    }} onPointerEnter={(event) => { onPointerEnter?.(event); preloadAuthRoute(route); }} onPointerDown={(event) => { onPointerDown?.(event); preloadAuthRoute(route); }} onFocus={(event) => { onFocus?.(event); preloadAuthRoute(route); }} />;
}
