import { describe, expect, test } from "bun:test";
import { createMemoryRouter } from "react-router";

import { APP_THEME_COLORS, PC_USER_THEME_COLORS } from "../src/lib/app-theme";
import { createAppThemePathnameStore, getAntThemeConfigForPathname, isAdminThemePathname } from "../src/lib/app-theme-route";

describe("app provider route theme", () => {
    test("matches only the Admin route boundary", () => {
        expect(isAdminThemePathname("/admin")).toBe(true);
        expect(isAdminThemePathname("/admin/logs")).toBe(true);
        expect(isAdminThemePathname("/Admin/settings/storage")).toBe(true);
        expect(isAdminThemePathname("/administrator")).toBe(false);
        expect(isAdminThemePathname("/admin-tools")).toBe(false);
        expect(isAdminThemePathname("/create")).toBe(false);
    });

    test("keeps Brand V2 on desktop user routes and the legacy palette on Admin", () => {
        const user = getAntThemeConfigForPathname(false, true, "/create");
        const admin = getAntThemeConfigForPathname(false, true, "/admin/channels");
        const mobileUser = getAntThemeConfigForPathname(false, false, "/create");
        const darkUser = getAntThemeConfigForPathname(true, true, "/create");
        const darkAdmin = getAntThemeConfigForPathname(true, true, "/admin/logs");

        expect(user.token?.colorPrimary).toBe(PC_USER_THEME_COLORS.light.action.primary.bg);
        expect(admin.token?.colorPrimary).toBe(APP_THEME_COLORS.light.action.primary.bg);
        expect(admin.components?.Menu?.itemHeight).toBe(34);
        expect(mobileUser.token?.colorPrimary).toBe(APP_THEME_COLORS.light.action.primary.bg);
        expect(mobileUser.components?.Menu?.itemHeight).toBe(36);
        expect(darkUser.token?.colorPrimary).toBe(PC_USER_THEME_COLORS.dark.action.primary.bg);
        expect(darkAdmin.token?.colorPrimary).toBe(APP_THEME_COLORS.dark.action.primary.bg);
        expect(darkAdmin.components?.Menu?.itemHeight).toBe(34);
    });

    test("places App-level feedback holders inside the route-aware theme", async () => {
        const [providerSource, applicationSource] = await Promise.all([Bun.file(new URL("../src/components/layout/app-providers.tsx", import.meta.url)).text(), Bun.file(new URL("../src/application.tsx", import.meta.url)).text()]);
        const provider = providerSource.replace(/\s+/g, " ");
        const themedTreeStart = provider.indexOf("<ConfigProvider locale={zhCN} theme={antTheme}>");
        const themedTreeEnd = provider.indexOf("</ConfigProvider>", themedTreeStart);

        expect(provider).toContain("useSyncExternalStore(pathnameStore.subscribe, pathnameStore.getSnapshot, pathnameStore.getSnapshot)");
        expect(themedTreeStart).toBeGreaterThanOrEqual(0);
        expect(themedTreeEnd).toBeGreaterThan(themedTreeStart);
        expect(provider.slice(themedTreeStart, themedTreeEnd)).toContain("<App message=");
        expect(applicationSource).toContain("<AppProviders router={router}>");
    });

    test("tracks committed router transitions in both directions", async () => {
        const router = createMemoryRouter([{ path: "*", element: null }], { initialEntries: ["/create"] });
        const store = createAppThemePathnameStore(router);
        const snapshots: string[] = [];
        const unsubscribe = store.subscribe(() => snapshots.push(store.getSnapshot()));

        expect(store.getSnapshot()).toBe("/create");
        await router.navigate("/admin/logs");
        expect(store.getSnapshot()).toBe("/admin/logs");
        await router.navigate("/create");
        expect(store.getSnapshot()).toBe("/create");
        expect(snapshots).toContain("/admin/logs");
        expect(snapshots.at(-1)).toBe("/create");

        unsubscribe();
        router.dispose();
    });
});
