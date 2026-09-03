import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("auth login experience", () => {
    test("keeps a focused brand hero and a single authentication card", async () => {
        const scene = await read("../src/pages/auth/auth-scene.tsx");

        expect(scene).toContain("branding.config.auth.title");
        expect(scene).toContain("pc-auth-brand-head");
        expect(scene).not.toContain("pc-auth-card-footnote");
        expect(scene).not.toContain("creativeCapabilities");
        expect(scene).not.toContain('aria-label="影视创作流程"');
        expect(scene).not.toContain("WELCOME BACK");
        expect(scene).not.toContain("AUTHENTICATION");
        expect(scene).toContain("pc-auth-media-layer");
        expect(scene).not.toContain("hasHeroMedia");
    });

    test("provides local failure feedback and accessible login fields", async () => {
        const login = await read("../src/pages/auth/login.tsx");

        expect(login).toContain('role="alert"');
        expect(login).toContain('aria-describedby={submitError ? "login-error" : undefined}');
        expect(login).toContain("autoFocus");
        expect(login).toContain('formData.get("username")');
        expect(login).toContain('formData.get("password")');
        expect(login).toContain('name="username"');
        expect(login).toContain('name="password"');
        expect(login).toContain("disabled={submitting}");
    });

    test("contains guest hydration failures instead of leaking an unhandled rejection", async () => {
        const [hydrator, session] = await Promise.all([read("../src/components/auth/auth-session-hydrator.tsx"), read("../src/lib/user-session.ts")]);

        expect(hydrator).toContain("void getAuthSession()");
        expect(hydrator).toContain("访客状态初始化未完整完成，登录后将自动重试");
        expect(hydrator.match(/\.catch\(/g)?.length).toBe(2);
        expect(session).toContain("if (!payload.user?.id)");
        expect(session).toContain("channels: []");
    });

    test("covers compact and desktop layouts without dropping dynamic theme tokens", async () => {
        const styles = await read("../src/pages/auth/auth-pc.css");

        expect(styles).toContain("@media (max-width: 1023px)");
        expect(styles).toContain(".pc-auth-topbar");
        expect(styles).toContain(".pc-auth-login-error");
        expect(styles).not.toContain(".pc-auth-card-footnote");
        expect(styles).toContain("flex-direction: column");
        expect(styles).toContain("width: min(460px, calc(100% - 40px))");
        expect(styles).toContain("var(--auth-brand)");
    });
});
