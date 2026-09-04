import { expect, test } from "bun:test";

test("brand pages are public while workspace and content settings keep their existing auth boundaries", async () => {
    const [router, adminShell] = await Promise.all([Bun.file(new URL("../src/router.tsx", import.meta.url)).text(), Bun.file(new URL("../src/pages/admin/components/admin-shell.tsx", import.meta.url)).text()]);
    for (const path of ['path: "/"', 'path: "/product"', 'path: "/showcase"', 'path: "/about"']) {
        expect(router).toContain(path);
    }
    expect(router).toContain("<PublicSiteLayout />");
    expect(router).toContain("<PublicHomePage />");
    expect(router).toContain('{ path: "/home", element: <RequireAuth>');
    expect(router).toContain('{ path: "settings/public-site", element: <Navigate to="/admin/settings/branding?section=website" replace /> }');
    expect(adminShell).not.toContain('path: "/admin/settings/public-site"');
    expect(adminShell).toContain('label: "网站设置"');
    expect(router).toContain('path: "/admin",');
    expect(router).toContain("<RequireAuth>{deferred(<AdminPage />)}</RequireAuth>");
});

test("site display saves only exposed settings and leaves legacy publishing out of the editor", async () => {
    const [api, admin, provider] = await Promise.all([
        Bun.file(new URL("../src/services/api/public-site.ts", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/admin/settings/site-display-settings.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/components/public-site/public-site-provider.tsx", import.meta.url)).text(),
    ]);
    expect(api).toContain('patch("/admin/settings/site-display"');
    expect(admin).toContain("updateAdminSiteDisplay(setting.revision, draft)");
    expect(admin).toContain("setting.published.hero.posterUrl");
    expect(admin).not.toContain("publishAdminPublicSite");
    expect(admin).not.toContain("updateAdminPublicSiteDraft");
    expect(provider).toContain("PUBLIC_SITE_CACHE_KEY");
    expect(provider).toContain("Public marketing content must not block login");
});

test("homepage uses its independent media and a bundled poster with resilient fallbacks", async () => {
    const home = await Bun.file(new URL("../src/pages/public-site/home.tsx", import.meta.url)).text();
    expect(home).toContain("const mediaUrl = hero.showreelUrl");
    expect(home).toContain("hero.posterUrl || BRAND_CONCEPT_POSTER");
    expect(home).toContain("desktop && !reducedMotion && !videoFailed");
    expect(home).toContain("onError={() => setVideoFailed(true)}");
});

test("homepage interactions cover motion, keyboard focus and reduced motion", async () => {
    const [home, css] = await Promise.all([Bun.file(new URL("../src/pages/public-site/home.tsx", import.meta.url)).text(), Bun.file(new URL("../src/pages/public-site/public-site.css", import.meta.url)).text()]);
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
    const [layout, css] = await Promise.all([Bun.file(new URL("../src/pages/public-site/layout.tsx", import.meta.url)).text(), Bun.file(new URL("../src/pages/public-site/public-site.css", import.meta.url)).text()]);
    expect(layout).toContain("ref={shellRef}");
    expect(layout).toContain('shellRef.current?.scrollTo({ top: 0, behavior: "auto" })');
    expect(css).toContain("height: 100%;");
    expect(css).toContain("overflow-y: auto;");
    expect(css).toContain(".public-site-shell.is-menu-open");
    expect(css).toContain("inset: 66px 0 0;");
});

test("navigation uses invitation guidance and preserves invitation-only authentication", async () => {
    const [layout, auth, register] = await Promise.all([
        Bun.file(new URL("../src/pages/public-site/layout.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/auth-scene.tsx", import.meta.url)).text(),
        Bun.file(new URL("../src/pages/auth/register.tsx", import.meta.url)).text(),
    ]);
    expect(layout).toContain('const accountHref = user ? "/settings" : "/login"');
    expect(layout).toContain('const accountLabel = user ? "账号设置" : "体验说明"');
    expect(layout).toContain('event.key === "Escape"');
    expect(auth).toContain('className="pc-auth-back-link');
    expect(auth).toContain("返回官网");
    expect(register).toContain("当前仅限受邀成员使用");
    expect(register).not.toContain("管理员尚未配置注册邮件");
    expect(register).toContain("返回登录");
});
