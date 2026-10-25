import { expect, test } from "bun:test";

import { appearanceLogoURL, normalizePublicAppearance } from "../src/stores/use-appearance-store";
import { moduleGroupSource } from "./helpers/module-group-source";

test("initial HTML uses MengCeng and resolves configured appearance in parallel", async () => {
    const [html, mainSource] = await Promise.all([Bun.file(new URL("../index.html", import.meta.url)).text(), Bun.file(new URL("../src/main.tsx", import.meta.url)).text()]);

    expect(html).not.toContain("影策");
    expect(html).toContain("<title>梦层 MengCeng</title>");
    expect(mainSource).toContain("bootstrapAppearance()");
    expect(mainSource).toContain('import("./application")');
    expect(mainSource.indexOf("bootstrapAppearance()")).toBeLessThan(mainSource.indexOf('import("./application")'));
});

test("appearance keeps custom brand identity and retires old auth media fields", () => {
    const legacy = { brandName: "HIMA Studio", brandSlug: "hima-studio", authHeroTitle: "旧标题", authHeroDescription: "旧说明", authVideoConfigured: true, authVideoUrl: "/old.mp4", authVideoPosterUrl: "/old.jpg", authVideoAutoplay: true };
    const appearance = normalizePublicAppearance(legacy);
    expect(appearance.brandName).toBe("HIMA Studio");
    expect(appearance.brandSlug).toBe("hima-studio");
    expect(appearance.schemaVersion).toBe(13);
    for (const key of Object.keys(legacy).filter((key) => key.startsWith("auth"))) expect(appearance).not.toHaveProperty(key);
});

test("appearance URLs reject executable and insecure remote schemes", () => {
    const appearance = normalizePublicAppearance({
        logoConfigured: true,
        logoUrl: "javascript:alert(1)",
        darkLogoConfigured: true,
        darkLogoUrl: "http://example.com/logo.png",
    });

    expect(appearance.logoUrl).toBe("/logo.svg");
    expect(appearance.darkLogoUrl).not.toContain("example.com");
});

test("appearance selects theme logos and falls back to the single configured logo", () => {
    const dual = normalizePublicAppearance({
        logoConfigured: true,
        darkLogoConfigured: true,
        logoUrl: "/api/public/appearance/assets/logo?v=dual",
        darkLogoUrl: "/api/public/appearance/assets/logo-dark?v=dual",
        logoFrameEnabled: false,
    });
    expect(appearanceLogoURL(dual, "light")).toContain("/logo?");
    expect(appearanceLogoURL(dual, "dark")).toContain("/logo-dark?");
    expect(dual.logoFrameEnabled).toBe(false);

    const single = normalizePublicAppearance({ logoConfigured: true, logoUrl: "/api/public/appearance/assets/logo?v=single" });
    expect(appearanceLogoURL(single, "light")).toBe(single.logoUrl);
    expect(appearanceLogoURL(single, "dark")).toBe(single.logoUrl);
    expect(single.logoFrameEnabled).toBe(true);
});

test("shared auth overlay keeps resolved brand identity without legacy promotional media", async () => {
    const source = await Bun.file(new URL("../src/components/brand/brand-auth-dialog.tsx", import.meta.url)).text();

    expect(source).not.toContain("appearance.authVideoUrl");
    expect(source).not.toContain("appearance.authVideoAutoplay");
    expect(source).not.toContain("<video");
    expect(source).toContain("appearance.brandName");
    expect(source).toContain("mc-auth-heading");
    expect(source).toContain('getAntThemeConfig(true, appearance.activeSkin)');
    expect(source).toContain('<BrandLogo theme="dark"');
    expect(source).not.toContain("让一个故事，");
    expect(source).not.toContain("AUTH_VIDEO_URL");
    expect(source).not.toContain("AUTH_VIDEO_POSTER");
});

test("appearance management exposes light and dark logo uploads plus the frame switch", async () => {
    const [pageSource, brandSource, adminStyles, globalStyles] = await Promise.all([
        Promise.resolve(moduleGroupSource("pages/admin/settings/appearance-settings-page.tsx")),
        Bun.file(new URL("../src/components/brand/brand-logo.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/styles/admin-ui.css", import.meta.url)).text(),
        Bun.file(new URL("../src/styles/globals.css", import.meta.url)).text(),
    ]);

    expect(pageSource).toContain('slot="logo-dark"');
    expect(pageSource).toContain("浅色模式 Logo");
    expect(pageSource).toContain("深色模式 Logo（可选）");
    expect(pageSource).toContain("禁用 Logo 后面的圆角矩形外框");
    expect(pageSource).toContain("<Switch");
    expect(pageSource).toContain("checked={!logoFrameEnabled}");
    expect(pageSource).toContain("setLogoFrameEnabled(!checked)");
    expect(pageSource).not.toContain("<Checkbox");
    expect(pageSource).toContain("深浅模式 Logo 预览");
    expect(pageSource).toContain("管理登录与注册方式");
    expect(pageSource).not.toContain('aria-label="登录页视频自动播放"');
    expect(pageSource).not.toContain("authVideoAutoplay");
    expect(brandSource).toContain("useActiveTheme");
    expect(brandSource).toContain("data-logo-frame-enabled");
    expect(brandSource).toContain("failedSource === source");
    expect(brandSource).toContain('aria-hidden="true"');
    expect(brandSource).toContain('style.visibility = "hidden"');
    expect(brandSource).toContain("setFailedSource(source)");
    expect(adminStyles).toContain(".admin-appearance-logo-preview-mark.is-unframed img");
    expect(globalStyles).toContain('.brand-logo-frame[data-logo-frame-enabled="false"] > :is(img, svg)');
});

test("object storage can adopt the configured English brand identifier without replacing saved prefixes automatically", async () => {
    const source = await Promise.resolve(moduleGroupSource("pages/admin/settings/storage-settings-page.tsx"));

    expect(source).toContain("state.appearance.brandSlug");
    expect(source).toContain("使用品牌标识");
    expect(source).toContain('form.setFieldValue("pathPrefix", brandSlug)');
    expect(source).toContain("setting.pathPrefix || DEFAULT_OSS_PATH_PREFIX");
});

test("appearance management exposes a server-side reset to the built-in MengCeng brand", async () => {
    const [pageSource, apiSource] = await Promise.all([Promise.resolve(moduleGroupSource("pages/admin/settings/appearance-settings-page.tsx")), Bun.file(new URL("../src/services/api/appearance.ts", import.meta.url)).text()]);

    expect(pageSource).toContain("恢复梦层默认");
    expect(pageSource).toContain("resetAdminAppearance()");
    expect(pageSource).toContain("已上传文件仍保留在存储资源中");
    expect(apiSource).toContain('http.delete<{ setting: AdminAppearance }>("/admin/settings/appearance")');
});
