import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("auth login experience", () => {
    test("uses a full-screen video entry and reveals one centered auth panel", async () => {
        const [scene, entry, media, panel] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-entry.tsx"), read("../src/pages/auth/auth-media.tsx"), read("../src/pages/auth/auth-panel.tsx")]);
        const experience = [scene, entry, media, panel].join("\n");

        expect(scene).toContain("authOpen");
        expect(scene).toContain("<AuthSettingsProvider>");
        expect(scene).toContain("<AuthMedia />");
        expect(scene).toContain("<AuthEntry");
        expect(scene).toContain("<AuthPanel");
        expect(entry).toContain("pc-auth-entry-nav");
        expect(entry).toContain("智能影像创作空间");
        expect(entry).toContain("branding.config.auth.title");
        expect(entry).toContain("branding.config.auth.description");
        expect(entry).toContain("进入{branding.config.identity.shortName}");
        expect(media).toContain("pc-auth-atmosphere-media");
        expect(panel).toContain("pc-auth-brand-head");
        expect(panel).toContain("pc-auth-workspace");
        expect(panel).toContain("pc-auth-panel-close");
        expect(experience).not.toContain("pc-auth-brand-stage");
        expect(experience).not.toContain("pc-auth-feature-media");
        expect(experience).not.toContain("pc-auth-layout");
        expect(experience).not.toContain("pc-auth-sheet");
        expect(experience).not.toContain("WELCOME BACK");
        expect(experience).not.toContain("AUTHENTICATION");
    });

    test("provides local failure feedback and accessible login fields", async () => {
        const login = await read("../src/pages/auth/login.tsx");

        expect(login).toContain('role="alert"');
        expect(login).toContain('aria-describedby={submitError ? "login-error" : undefined}');
        expect(login).toContain('autoComplete="username"');
        expect(login).toContain('formData.get("username")');
        expect(login).toContain('formData.get("password")');
        expect(login).toContain('name="username"');
        expect(login).toContain('name="password"');
        expect(login).toContain("disabled={submitting}");
        expect(login).toContain("pc-auth-login-fields");
        expect(login).not.toContain("pc-auth-credential-group");
    });

    test("contains guest hydration failures instead of leaking an unhandled rejection", async () => {
        const [hydrator, session] = await Promise.all([read("../src/components/auth/auth-session-hydrator.tsx"), read("../src/lib/user-session.ts")]);

        expect(hydrator).toContain("void getAuthSession()");
        expect(hydrator).toContain("访客状态初始化未完整完成，登录后将自动重试");
        expect(hydrator.match(/\.catch\(/g)?.length).toBe(2);
        expect(session).toContain("if (!payload.user?.id)");
        expect(session).toContain("channels: []");
    });

    test("preloads auth forms without Suspense and keeps settings single-flight so switching stays smooth", async () => {
        const [scene, loader, provider, router] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-route-loader.ts"), read("../src/pages/auth/auth-settings-provider.tsx"), read("../src/router.tsx")]);

        expect(loader).toContain('login: () => import("./login")');
        expect(loader).toContain('register: () => import("./register")');
        expect(loader).toContain("if (pendingPage) return pendingPage");
        expect(scene).toContain("void preloadAuthPages()");
        expect(scene).toContain("await Promise.all([preloadAuthPages(), ensureReady().catch(() => null)])");
        expect(scene).not.toContain("Suspense");
        expect(scene).not.toContain("lazy(");
        expect(router).not.toContain("fullScreenDeferred(<LoginPage />)");
        expect(router).not.toContain("fullScreenDeferred(<RegisterPage />)");
        expect(provider).toContain("let settingsRequest: Promise<PublicAuthSettings> | null = null");
        expect(provider).toContain("if (settingsRequest) return settingsRequest");
    });

    test("keeps the cinematic entry responsive without dropping dynamic theme tokens", async () => {
        const styles = [await read("../src/pages/auth/auth-scene.css"), await read("../src/pages/auth/auth-form.css")].join("\n");

        expect(styles).toContain(".pc-auth-atmosphere-media");
        expect(styles).toContain(".pc-auth-scene.is-auth-open .pc-auth-atmosphere-media");
        expect(styles).toContain("filter: blur(14px)");
        expect(styles).toContain(".pc-auth-entry-button");
        expect(styles).toContain(".pc-auth-workspace");
        expect(styles).toContain(".pc-auth-login-fields");
        expect(styles).toContain(".pc-auth-login-error");
        expect(styles).not.toContain(".pc-auth-card-footnote");
        expect(styles).not.toContain(".pc-auth-brand-stage");
        expect(styles).toContain(".pc-auth-panel-footer");
        expect(styles).toContain("--auth-panel: rgba(15, 16, 17, 0.96)");
        expect(styles).toContain("font-family: ui-serif");
        expect(styles).toContain("border-radius: 8px");
        expect(styles).not.toContain("rgba(248, 247, 243, 0.94)");
        expect(styles).toContain("var(--auth-brand)");
    });
});
