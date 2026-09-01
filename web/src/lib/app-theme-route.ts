import type { ThemeConfig } from "antd";
import type { RouterProviderProps } from "react-router";

import { getAdminAntThemeConfig, getAntThemeConfig } from "@/lib/app-theme";

export type AppThemeRouter = Pick<RouterProviderProps["router"], "state" | "subscribe">;

export function isAdminThemePathname(pathname: string) {
    const normalized = pathname.toLowerCase();
    return normalized === "/admin" || normalized.startsWith("/admin/");
}

export function getAntThemeConfigForPathname(dark: boolean, pcBrandV2: boolean, pathname: string): ThemeConfig {
    return isAdminThemePathname(pathname) ? getAdminAntThemeConfig(dark) : getAntThemeConfig(dark, pcBrandV2);
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
