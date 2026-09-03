import type { ThemeConfig } from "antd";
import type { RouterProviderProps } from "react-router";

import { getAdminAntThemeConfig, getAntThemeConfig } from "@/lib/app-theme";
import { withBrandingAntTheme } from "@/lib/branding-theme";

export type AppThemeRouter = Pick<RouterProviderProps["router"], "state" | "subscribe">;

export function isAdminThemePathname(pathname: string) {
    const normalized = pathname.toLowerCase();
    return normalized === "/admin" || normalized.startsWith("/admin/");
}

export function getAntThemeConfigForPathname(dark: boolean, pcBrandV2: boolean, pathname: string, brandPrimaryColor?: string): ThemeConfig {
    if (isAdminThemePathname(pathname)) return getAdminAntThemeConfig(dark);
    const base = getAntThemeConfig(dark, pcBrandV2);
    return brandPrimaryColor ? withBrandingAntTheme(base, brandPrimaryColor, dark) : base;
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
