import { describe, expect, test } from "bun:test";

import { APP_THEME_COLORS } from "../src/lib/app-theme";
import { getAntThemeConfigForPathname } from "../src/lib/app-theme-route";
import { createBrandPalette, DEFAULT_BRAND_PRIMARY, normalizeBrandPrimary } from "../src/lib/branding-theme";

describe("website branding theme", () => {
    test("keeps the established palette for the default brand", () => {
        const palette = createBrandPalette(DEFAULT_BRAND_PRIMARY);
        expect(palette[500]).toBe("#8b7cf6");
        expect(palette[50]).toBe("#f5f3ff");
        expect(normalizeBrandPrimary("not-a-color")).toBe(DEFAULT_BRAND_PRIMARY);
    });

    test("applies custom accents to the website and Admin while keeping primary commands neutral", () => {
        const palette = createBrandPalette("#18A56B");
        const user = getAntThemeConfigForPathname(false, "/create", "#18A56B");
        const admin = getAntThemeConfigForPathname(false, "/admin/settings/branding", "#18A56B");

        expect(palette[500]).toBe("#18a56b");
        expect(new Set(Object.values(palette)).size).toBe(10);
        expect(user.token?.colorPrimary).toBe(palette[700]);
        expect(admin.token?.colorPrimary).toBe(user.token?.colorPrimary);
        expect(admin.components?.Button?.colorPrimary).toBe(APP_THEME_COLORS.light.action.primary.bg);
        expect(user.components?.Button?.colorPrimary).toBe(APP_THEME_COLORS.light.action.primary.bg);
        expect(admin.components?.Input?.activeBorderColor).toBe(user.token?.colorPrimary);
        expect(admin.token?.colorError).toBe(APP_THEME_COLORS.light.status.error.fg);
    });

    test("keeps extreme custom accent colors readable in both appearances", () => {
        const luminance = (hex: string) =>
            hex
                .slice(1)
                .match(/../g)!
                .map((channel) => {
                    const n = parseInt(channel, 16) / 255;
                    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
                })
                .reduce((sum, channel, i) => sum + channel * [0.2126, 0.7152, 0.0722][i], 0);
        for (const primary of ["#FFFFFF", "#000000", "#FFFF00", "#0000FF", "#18A56B"]) {
            for (const dark of [false, true]) {
                const theme = getAntThemeConfigForPathname(dark, "/admin", primary);
                const a = luminance(theme.token!.colorLink!);
                const b = luminance(dark ? "#22252e" : "#ffffff");
                expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
                expect(theme.components?.Button?.colorPrimary).toBe(APP_THEME_COLORS[dark ? "dark" : "light"].action.primary.bg);
            }
        }
    });
});

test("brand configuration is wired into public, auth and admin entry points", async () => {
    const [application, authScene, authPanel, router, adminShell, brandingSettings] = await Promise.all([
        Bun.file(new URL("../src/application.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/auth-scene.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/auth-panel.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/router.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/components/admin-shell.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/settings/branding-settings-page.tsx", import.meta.url)).text(),
    ]);

    expect(application).toContain("<BrandingProvider>");
    expect(authPanel).toContain("withBrandingAntTheme");
    expect(authScene).not.toContain("bilibili.com");
    expect(router).toContain('path: "settings/branding"');
    expect(adminShell).toContain('path: "/admin/settings/branding"');
    expect(brandingSettings).toContain('params.get("section")');
    expect(brandingSettings).toContain('label="品牌资料"');
    expect(brandingSettings).toContain('label="标志与颜色"');
    expect(brandingSettings).toContain('label="登录页面"');
    expect(brandingSettings).toContain('label="官网与备案"');
    expect(brandingSettings).not.toContain('label="作品展示"');
    expect(brandingSettings).toContain("登录页使用官网首页的封面");
    expect(brandingSettings).toContain('setActiveSection("website")');
    expect(brandingSettings).toContain("<SiteDisplaySettingsEditor");
    expect(brandingSettings).toContain("admin-branding-assets-grid");
    expect(brandingSettings).toContain('className="admin-branding-summary"');
    expect(brandingSettings).toContain('className="admin-branding-editor-sheet"');
    expect(brandingSettings).not.toContain("<Tabs");
    expect(brandingSettings).not.toContain("admin-branding-preview-frame");
    expect(brandingSettings).not.toContain('label="英文名称"');
    expect(brandingSettings).not.toContain('label="Meta Description"');
});
