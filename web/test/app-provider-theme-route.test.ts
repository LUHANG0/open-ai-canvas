import { describe, expect, test } from "bun:test";
import { createMemoryRouter } from "react-router";

import { APP_THEME_COLORS } from "../src/lib/app-theme";
import { createAppThemePathnameStore, getAntThemeConfigForPathname, isAdminThemePathname, isDarkThemeForPathname } from "../src/lib/app-theme-route";

describe("app provider route theme", () => {
    test("matches only the Admin route boundary", () => {
        expect(isAdminThemePathname("/admin")).toBe(true);
        expect(isAdminThemePathname("/admin/logs")).toBe(true);
        expect(isAdminThemePathname("/Admin/settings/storage")).toBe(true);
        expect(isAdminThemePathname("/administrator")).toBe(false);
        expect(isAdminThemePathname("/admin-tools")).toBe(false);
        expect(isAdminThemePathname("/create")).toBe(false);
    });

    test("shares surfaces, controls and brand accents across user and Admin routes", () => {
        for (const dark of [false, true]) {
            const user = getAntThemeConfigForPathname(dark, "/create");
            const admin = getAntThemeConfigForPathname(dark, "/admin/channels");
            const color = APP_THEME_COLORS[dark ? "dark" : "light"];
            expect(user.token?.colorBgContainer).toBe(color.surface.one);
            expect(admin.token?.colorBgContainer).toBe(user.token?.colorBgContainer);
            expect(admin.token?.colorPrimary).toBe(user.token?.colorPrimary);
            expect(admin.token?.borderRadius).toBe(user.token?.borderRadius);
            expect(admin.components?.Button).toEqual(user.components?.Button);
            expect(user.components?.Button?.colorPrimary).toBe(color.action.primary.bg);
            expect(admin.components?.Menu?.itemHeight).toBe(34);
            expect(user.components?.Menu?.itemHeight).toBe(36);
        }
    });

    test("keeps public and auth feedback dark without changing workspace preferences", () => {
        for (const path of ["/", "/product", "/showcase/", "/about", "/login", "/register"]) {
            expect(isDarkThemeForPathname(false, path)).toBe(true);
            expect(getAntThemeConfigForPathname(false, path).token?.colorBgContainer).toBe(APP_THEME_COLORS.dark.surface.one);
        }
        for (const path of ["/home", "/create", "/admin", "/login-other"]) {
            expect(isDarkThemeForPathname(false, path)).toBe(false);
            expect(isDarkThemeForPathname(true, path)).toBe(true);
        }
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
