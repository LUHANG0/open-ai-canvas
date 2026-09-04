import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("auth login experience", () => {
    test("opens the form directly and shares the website identity, poster and filing settings", async () => {
        const [scene, media, panel] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-media.tsx"), read("../src/pages/auth/auth-panel.tsx")]);
        expect(scene).toContain("<AuthSettingsProvider>");
        expect(scene).toContain("<AuthPanel");
        expect(scene).not.toContain("authOpen");
        expect(scene).not.toContain("AuthEntry");
        expect(scene).toContain("branding.config.auth.title");
        expect(panel).toContain("branding.config.auth.description");
        expect(scene).toContain("site.config.links.icpText");
        expect(scene).toContain("site.config.links.icpUrl");
        expect(scene).toContain("返回官网");
        expect(media).toContain("site.config.hero.posterUrl || BRAND_CONCEPT_POSTER");
        expect(media).toContain("failedURL === configuredURL ? BRAND_CONCEPT_POSTER : configuredURL");
        expect(panel).not.toContain("pc-auth-panel-close");
        expect(panel).toContain('<div className="pc-auth-form-slot">');
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
    });

    test("preserves invitation-only registration and first-administrator routing", async () => {
        const [scene, panel, register] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-panel.tsx"), read("../src/pages/auth/register.tsx")]);
        expect(scene).toContain('settings.firstUser && mode !== "register"');
        expect(scene).toContain("!inviteFlow && !invitedFlow");
        expect(panel).toContain("仅限受邀成员使用，需要账号请联系团队管理员");
        expect(panel).toContain("!settings.emailCodeRequired || settings.emailEnabled");
        expect(register).toContain("当前仅限受邀成员使用");
        expect(register).toContain("请联系团队管理员获取邀请");
        expect(register).not.toContain("管理员尚未配置注册邮件");
    });

    test("contains guest hydration failures instead of leaking an unhandled rejection", async () => {
        const [hydrator, session] = await Promise.all([read("../src/components/auth/auth-session-hydrator.tsx"), read("../src/lib/user-session.ts")]);
        expect(hydrator).toContain("void getAuthSession()");
        expect(hydrator).toContain("访客状态初始化未完整完成，登录后将自动重试");
        expect(hydrator.match(/\.catch\(/g)?.length).toBe(2);
        expect(session).toContain("if (!payload.user?.id)");
        expect(session).toContain("channels: []");
    });

    test("preloads auth forms with a retryable failure and keeps settings single-flight", async () => {
        const [scene, loader, provider, router] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-route-loader.ts"), read("../src/pages/auth/auth-settings-provider.tsx"), read("../src/router.tsx")]);
        expect(loader).toContain('login: () => import("./login")');
        expect(loader).toContain('register: () => import("./register")');
        expect(loader).toContain("if (pendingPage) return pendingPage");
        expect(scene).toContain("void preloadAuthPages()");
        expect(scene).toContain("setPageError(true)");
        expect(scene).toContain("重新加载");
        expect(scene).not.toContain("Suspense");
        expect(scene).not.toContain("lazy(");
        expect(router).not.toContain("fullScreenDeferred(<LoginPage />)");
        expect(router).not.toContain("fullScreenDeferred(<RegisterPage />)");
        expect(provider).toContain("let settingsRequest: Promise<PublicAuthSettings> | null = null");
        expect(provider).toContain("if (settingsRequest) return settingsRequest");
    });

    test("supports a scrolling mobile form, readable autofill and reduced motion", async () => {
        const styles = [await read("../src/pages/auth/auth-scene.css"), await read("../src/pages/auth/auth-form.css")].join("\n");
        expect(styles).toContain("overflow-y: auto");
        expect(styles).toContain("@media (max-width: 900px)");
        expect(styles).toContain("justify-content: center");
        expect(styles).not.toContain("grid-template-columns");
        expect(styles).not.toContain("max-height: calc(100dvh");
        expect(styles).toContain("color-scheme: dark");
        expect(styles).toContain("input:-webkit-autofill");
        expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
        expect(styles).toContain("var(--auth-brand)");
    });
});
