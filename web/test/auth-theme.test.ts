import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { DEFAULT_CLASSIC_SKIN, duplicateSkinDefinition, skinCSSVariables } from "../src/lib/skin-themes";

const source = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("authentication brand palette and theme boundaries", () => {
    test("classic login surfaces have distinct light and dark palettes", () => {
        // globals.css 在不同平台上可能是 LF 或 CRLF；先归一化再分段，
        // 否则按字面换行查找 .dark 段会返回 -1，把断言变成永远失败。
        const css = source("styles/globals.css").replace(/\r\n/g, "\n");
        const dark = css.slice(css.indexOf(".dark {\n    --background:"));
        for (const [mode, background, panel, card] of [
            ["light", "#ffffff", "#f7f7f7", "#ffffff"],
            ["dark", "#08090c", "#0b0c10", "#121318"],
        ] as const) {
            const variables = skinCSSVariables(DEFAULT_CLASSIC_SKIN, mode);
            const modeCSS = mode === "dark" ? dark : css.slice(0, css.indexOf(".auth-scene {"));
            expect(variables["--auth-page-bg"]).toBe(background);
            expect(variables["--auth-panel-bg"]).toBe(panel);
            expect(variables["--auth-card-bg"]).toBe(card);
            for (const key of ["--auth-page-bg", "--auth-panel-bg", "--auth-card-bg", "--auth-accent", "--auth-muted"]) {
                expect(modeCSS).toContain(`${key}: ${variables[key]};`);
            }
        }
    });

    test("brand auth uses a dark media lightbox without changing the workspace preference", () => {
        const scene = source("components/brand/brand-auth-dialog.tsx");
        const showcase = source("components/brand/brand-auth-showcase.tsx");
        expect(scene).toContain("ConfigProvider");
        expect(scene).toContain('getAntThemeConfig(true, appearance.activeSkin)');
        expect(source("components/brand/brand-site.tsx")).toContain("useThemeStore");
        expect(scene).not.toContain('const theme = "dark"');
        expect(source("pages/auth/auth-scene.css")).not.toMatch(/#091017|Songti|brand-blue/);
        expect(scene).not.toContain("auth-card-dark");
        expect(source("pages/auth/auth-scene.tsx")).toContain("BrandAuthDialog");
        expect(source("pages/auth/auth-scene.tsx")).not.toContain("<main");
        expect(scene).toContain("<BrandAuthShowcase open={open}");
        expect(showcase).toContain("mc-auth-showcase");
        expect(showcase).toContain("document.hidden");
        expect(scene).toContain("useAuthReducedMotion");
        expect(scene).not.toContain("auth-scene-hero");
        expect(scene).toContain('<BrandLogo theme="dark"');
        expect(source("components/brand/brand-auth-dialog.css")).toContain(".mc-auth-dialog-standard .ant-modal-header");
        expect(source("components/brand/brand-site.tsx")).toContain('data-studio-theme={theme}');
        expect(scene).not.toContain("setTheme");
        expect(scene).not.toContain("auth-scene-artwork");
        expect(source("components/layout/app-providers.tsx")).toContain("getAntThemeConfig(dark, appearance.activeSkin)");
    });

    test("form links, tabs and notices do not assume white text", () => {
        for (const form of ["auth-login-form", "auth-register-form", "auth-recovery-form", "auth-form-parts", "auth-panel", "auth-dialog", "verification-fields"]) {
            const code = source(`components/auth/${form}.tsx`);
            expect(code).not.toMatch(/(?:text|border|bg)-white/);
            expect(code).not.toMatch(/text-(?:blue|amber)-[123]00/);
        }
        // 提示条统一走主题感知的 auth-scene-notice，注册与找回密码都经 AuthNotice 渲染。
        expect(source("components/auth/auth-form-parts.tsx")).toContain("auth-scene-notice");
        expect(source("components/auth/auth-register-form.tsx")).toContain("<AuthNotice");
        expect(source("components/auth/auth-recovery-form.tsx")).toContain("<AuthNotice");
    });

    test("focus and autofill keep theme-aware foregrounds and visible focus", () => {
        const css = source("styles/globals.css");
        const panel = source("components/auth/auth-panel.css");
        expect(css).not.toContain(".auth-card-dark");
        expect(css).toContain(".auth-scene-card input.ant-input:-webkit-autofill");
        expect(css).toContain("-webkit-text-fill-color: var(--foreground) !important");
        expect(css).toContain("box-shadow: 0 0 0 1000px var(--auth-field-bg, var(--auth-input-bg)) inset !important");
        expect(css).toContain(".auth-scene-link:focus-visible");
        expect(css).toContain(".auth-scene-card .ant-input-affix-wrapper:has(input:focus-visible)");
        expect(css).toContain("outline: 2px solid var(--control-focus-ring) !important");
        expect(css).toContain(".auth-code-field:has(input:focus-visible)");
        expect(css).toContain(".auth-code-field .auth-code-send:focus-visible");
    });

    test("custom auth palettes are preserved per mode", () => {
        const skin = duplicateSkinDefinition(DEFAULT_CLASSIC_SKIN, ["classic"]);
        skin.tokens.light.authPanel = "#f6ebe3";
        skin.tokens.light.authCard = "#fffdf9";
        skin.tokens.dark.authPanel = "#21120e";
        skin.tokens.dark.authCard = "#361f17";
        expect(skinCSSVariables(skin, "light")["--auth-panel-bg"]).toBe("#f6ebe3");
        expect(skinCSSVariables(skin, "light")["--auth-card-bg"]).toBe("#fffdf9");
        expect(skinCSSVariables(skin, "dark")["--auth-panel-bg"]).toBe("#21120e");
        expect(skinCSSVariables(skin, "dark")["--auth-card-bg"]).toBe("#361f17");
    });
});
