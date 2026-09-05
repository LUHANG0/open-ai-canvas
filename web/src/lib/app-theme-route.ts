import type { ThemeConfig } from "antd";
import type { RouterProviderProps } from "react-router";

import { getAdminAntThemeConfig, getAntThemeConfig } from "@/lib/app-theme";
import { DEFAULT_BRAND_PRIMARY, withBrandingAntTheme } from "@/lib/branding-theme";

export type AppThemeRouter = Pick<RouterProviderProps["router"], "state" | "subscribe">;

export function isAdminThemePathname(pathname: string) {
    const normalized = pathname.toLowerCase();
    return normalized === "/admin" || normalized.startsWith("/admin/");
}

export function isDarkThemeForPathname(preferDark: boolean, pathname: string) {
    return ["/", "/product", "/showcase", "/about", "/login", "/register"].includes(pathname.toLowerCase().replace(/\/$/, "") || "/") || preferDark;
}

export function getAntThemeConfigForPathname(preferDark: boolean, pathname: string, brandPrimaryColor = DEFAULT_BRAND_PRIMARY): ThemeConfig {
    const dark = isDarkThemeForPathname(preferDark, pathname);
    const base = isAdminThemePathname(pathname) ? getAdminAntThemeConfig(dark) : getAntThemeConfig(dark);
    return withBrandingAntTheme(base, brandPrimaryColor, dark);
}

/**
 * AppProviders sits above RouterProvider so AntD's App-level message, modal and
 * notification holders can cover every route. Subscribe to that same data
 * router here so those holders switch themes at the exact route boundary too.
 */
export function createAppThemePathnameStore(router: AppThemeRouter) {
    return {
        subscribe(onStoreChange: () => void) {
            return router.subscribe(() => onStoreChange());
        },
        getSnapshot() {
            return router.state.location.pathname;
        },
    };
}
