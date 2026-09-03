import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("auth login experience", () => {
    test("keeps the brand-driven hero while exposing the creative workflow", async () => {
        const scene = await read("../src/pages/auth/auth-scene.tsx");

        expect(scene).toContain("branding.config.auth.title");
        expect(scene).toContain("creativeCapabilities.map");
        expect(scene).toContain("STORY TO SCREEN");
        expect(scene).toContain('aria-label="核心创作能力"');
        expect(scene).toContain("pc-auth-media-layer");
        expect(scene).toContain('hasHeroMedia ? " has-auth-media"');
    });

    test("provides local failure feedback and accessible login fields", async () => {
        const login = await read("../src/pages/auth/login.tsx");

        expect(login).toContain('role="alert"');
        expect(login).toContain('aria-describedby={submitError ? "login-error" : undefined}');
        expect(login).toContain("autoFocus");
        expect(login).toContain("disabled={!username.trim() || !password}");
        expect(login).toContain("username: username.trim()");
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
        expect(styles).toContain(".pc-auth-panel-glow");
        expect(styles).toContain(".pc-auth-login-error");
        expect(styles).toContain(".pc-auth-scene.has-auth-media .pc-auth-brand");
        expect(styles).toContain("var(--auth-brand)");
    });
});
