import { expect, test } from "bun:test";

test("public brand site owns root routes while workspace remains authenticated", async () => {
    const router = await Bun.file(new URL("../src/router.tsx", import.meta.url)).text();
    for (const path of ['path: "/"', 'path: "/product"', 'path: "/showcase"', 'path: "/about"']) {
        expect(router).toContain(path);
    }
    expect(router).toContain("<PublicSiteLayout />");
    expect(router).not.toContain('{ path: "/", element: <Navigate to="/create" replace /> }');
    expect(router).toContain('{ path: "/home", element: <RequireAuth>');
    expect(router).toContain('path: "settings/public-site"');
});

test("public content keeps draft and published states separate", async () => {
    const [api, admin, provider] = await Promise.all([
        Bun.file(new URL("../src/services/api/public-site.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/settings/public-site-settings-page.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/components/public-site/public-site-provider.tsx", import.meta.url)).text(),
    ]);
    expect(api).toContain('patch("/admin/settings/public-site"');
    expect(api).toContain('post("/admin/settings/public-site/publish"');
    expect(api).toContain('post("/admin/settings/public-site/reset"');
    expect(admin).toContain("保存草稿不会影响公开官网");
    expect(admin).toContain("localDirty || !setting.dirty");
    expect(provider).toContain("PUBLIC_SITE_CACHE_KEY");
    expect(provider).toContain("Public marketing content must not block login");
});

test("homepage reuses brand hero media with resilient fallbacks", async () => {
    const home = await Bun.file(new URL("../src/pages/public-site/home.tsx", import.meta.url)).text();
    expect(home).toContain("hero.showreelUrl || branding.assets.authHeroUrl");
    expect(home).toContain("hero.posterUrl || branding.assets.authHeroPosterUrl");
    expect(home).toContain("desktop && !reducedMotion && !videoFailed");
    expect(home).toContain("onError={() => setVideoFailed(true)}");
});

test("homepage interactions cover motion, keyboard focus and reduced motion", async () => {
    const [home, css] = await Promise.all([
        Bun.file(new URL("../src/pages/public-site/home.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/public-site/public-site.css", import.meta.url)).text(),
    ]);
    expect(home).toContain("staggerChildren");
    expect(home).toContain("whileInView");
    expect(home).toContain("whileHover");
    expect(home).toContain("reducedMotion ? undefined");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(".public-button:active");
    expect(css).toContain(".public-button:hover:before");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
});

test("public site remains scrollable inside the application shell and resets on route changes", async () => {
    const [layout, css] = await Promise.all([
        Bun.file(new URL("../src/pages/public-site/layout.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/public-site/public-site.css", import.meta.url)).text(),
    ]);
    expect(layout).toContain('ref={shellRef}');
    expect(layout).toContain('shellRef.current?.scrollTo({ top: 0, behavior: "auto" })');
    expect(css).toContain("height: 100%;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).toContain(".public-site-shell.is-menu-open");
    expect(css).toContain("inset: 66px 0 0;");
});

test("public navigation and auth entry keep account and recovery actions explicit", async () => {
    const [layout, auth, register] = await Promise.all([
        Bun.file(new URL("../src/pages/public-site/layout.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/auth-scene.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/register.tsx", import.meta.url)).text(),
    ]);
    expect(layout).toContain('const accountHref = user ? "/settings" : "/login"');
    expect(layout).toContain('const accountLabel = user ? "账号设置" : "登录"');
    expect(layout).toContain('event.key === "Escape"');
    expect(auth).toContain('className="pc-auth-back-link');
    expect(auth).toContain("返回官网");
    expect(register).toContain("邮箱注册暂不可用");
    expect(register).toContain("返回登录");
});
