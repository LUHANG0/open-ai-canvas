import { describe, expect, test } from "bun:test";

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("auth login experience", () => {
    test("uses blurred ambient video, a clear feature frame and a compact auth panel", async () => {
        const scene = await read("../src/pages/auth/auth-scene.tsx");

        expect(scene).toContain("branding.config.auth.title");
        expect(scene).toContain("pc-auth-brand-head");
        expect(scene).toContain("pc-auth-atmosphere-media");
        expect(scene).toContain("pc-auth-brand-stage");
        expect(scene).toContain("pc-auth-feature-media");
        expect(scene).toContain("pc-auth-workspace");
        expect(scene).toContain("pc-auth-panel");
        expect(scene).not.toContain("pc-auth-sheet");
        expect(scene).not.toContain("pc-auth-card-footnote");
        expect(scene).not.toContain("creativeCapabilities");
        expect(scene).not.toContain('aria-label="影视创作流程"');
        expect(scene).not.toContain("WELCOME BACK");
        expect(scene).not.toContain("AUTHENTICATION");
        expect(scene).not.toContain("pc-auth-media-layer");
        expect(scene).not.toContain("返回首页");
        expect(scene).not.toContain("hasHeroMedia");
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

    test("preloads the opposite auth route so the bottom switch stays smooth", async () => {
        const scene = await read("../src/pages/auth/auth-scene.tsx");

        expect(scene).toContain('activeTab === "login" ? import("./register") : import("./login")');
        expect(scene).toContain("void preload.catch(() => undefined)");
    });

    test("covers compact and desktop layouts without dropping dynamic theme tokens", async () => {
        const styles = await read("../src/pages/auth/auth-pc.css");

        expect(styles).toContain("@media (max-width: 900px)");
        expect(styles).toContain(".pc-auth-atmosphere-media");
        expect(styles).toContain("filter: blur(38px)");
        expect(styles).toContain(".pc-auth-feature-frame");
        expect(styles).toContain(".pc-auth-feature-media");
        expect(styles).toContain(".pc-auth-workspace");
        expect(styles).toContain(".pc-auth-login-fields");
        expect(styles).toContain(".pc-auth-login-error");
        expect(styles).not.toContain(".pc-auth-card-footnote");
        expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
        expect(styles).toContain(".pc-auth-panel-footer");
        expect(styles).toContain("--auth-panel: rgba(248, 247, 243, 0.92)");
        expect(styles).toContain("var(--auth-brand)");
    });
});
