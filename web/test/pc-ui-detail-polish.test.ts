import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

function compact(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

describe("PC detail polish regression gates", () => {
    test("keeps creative-chain helper content inert below the PC breakpoint", async () => {
        const [home, create, projects, canvas] = await Promise.all([read("../src/pages/home/home-pc.css"), read("../src/pages/create/creation-workspace.css"), read("../src/pages/projects/projects.css"), read("../src/pages/canvas/canvas-library-pc.css")]);

        expect(compact(home.slice(0, home.indexOf("@media (min-width: 1024px)")))).toContain(".pc-home-page .home-primary-link-pc, .pc-home-page .home-secondary-link, .pc-home-page .home-chart-legend { display: none; }");
        expect(compact(create.slice(0, create.indexOf("@media (min-width: 1024px)")))).toContain(".creation-home .creation-empty-suggest .suggest-copy > .creation-starter-action { display: none; }");
        expect(compact(create.slice(create.indexOf("@media (min-width: 1024px)")))).toContain(".creation-home .creation-empty-suggest .suggest-copy > .creation-starter-action { display: inline-flex;");
        expect(compact(projects.slice(0, projects.indexOf("@media (min-width: 1024px)")))).toContain(".pc-project-detail-state .workspace-state-action { display: none; } .pc-project-detail-empty-action { display: none; }");
        expect(compact(canvas.slice(0, canvas.indexOf("@media (min-width: 1024px)")))).toContain(
            ".pc-canvas-library-page .pc-canvas-library-only, .pc-canvas-library-dialog-pc-only, .pc-canvas-folder__preview-count, .pc-canvas-opening__pulse, .pc-canvas-opening small, .pc-canvas-library__empty-guide { display: none; }",
        );
    });

    test("gates content-chain error and busy states to the PC viewport", async () => {
        const [assets, tasks, wallet] = await Promise.all([read("../src/pages/assets/index.tsx"), read("../src/pages/tasks/index.tsx"), read("../src/pages/wallet/index.tsx")]);

        expect(assets).toContain('loading={isPcBrandViewport && transferBusy === "export-all"}');
        expect(assets).toContain("disabled: isPcBrandViewport && Boolean(transferBusy)");
        expect(assets).toContain("isPcBrandViewport && !assetsHydrated");
        expect(tasks).toContain("isPcBrandViewport && !loading && loadError && !tasks.length");
        expect(tasks).toContain("(!isPcBrandViewport || !loadError || tasks.length)");
        expect(wallet).toContain("!account && isPcBrandViewport && (loading || loadError)");
        expect(wallet).toContain("scroll={{ x: isPcBrandViewport ? 1000 : 990 }}");
        expect(wallet).toContain("locale={");
        expect(wallet).not.toContain("screens.lg &&");
    });

    test("keeps ecosystem helper content responsive at compact breakpoints", async () => {
        const [auth, plugins, settings, voice] = await Promise.all([read("../src/pages/auth/auth-pc.css"), read("../src/pages/plugins/plugins.css"), read("../src/pages/settings/settings.css"), read("../src/pages/voice-recording-pc.css")]);

        expect(compact(auth)).toContain("@media (max-width: 560px)");
        expect(compact(auth)).toContain(".pc-auth-workspace { padding: 12px; }");
        expect(compact(auth)).toContain(".pc-auth-panel { max-height: calc(100dvh - 24px);");
        expect(compact(auth)).toContain(".pc-auth-form-assurance, .pc-auth-password-status { display: flex;");
        expect(auth).not.toContain(".pc-auth-brand-capabilities");
        expect(compact(plugins.slice(0, plugins.indexOf("@media (min-width: 1024px)")))).toContain(".plugins-overview, .plugin-card-open-hint, .plugin-section-card-icon { display: none; }");
        expect(compact(settings.slice(0, settings.indexOf("@media (min-width: 1024px)")))).toContain(".settings-section-context { display: none; } .settings-diagnostics-preview-error { display: none; }");
        expect(compact(voice.slice(0, voice.indexOf("@media (min-width: 1024px)")))).toContain(".pc-voice-count, .pc-voice-status-strip { display: none; }");
    });

    test("keeps task results and filters connected with accessible semantics", async () => {
        const [tasks, filter] = await Promise.all([read("../src/pages/tasks/index.tsx"), read("../src/pages/tasks/task-status-filter.tsx")]);

        expect(tasks).toContain('id="task-results"');
        expect(tasks).toContain('aria-label="任务明细表，可横向滚动查看全部七列"');
        expect(filter).toContain('aria-controls="task-results"');
        expect(filter).toContain('role="tab"');
    });
});
