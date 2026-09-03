import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

function compact(source: string) {
    return source.replace(/\s+/g, " ").trim();
}

describe("short-drama PC shell regression gates", () => {
    test("keeps the existing project API and navigation contracts", async () => {
        const [index, detail, card] = await Promise.all([
            read("../src/pages/projects/index.tsx"),
            read("../src/pages/projects/detail.tsx"),
            read("../src/pages/projects/project-list-card.tsx"),
        ]);

        expect(index).toContain('queryKey: ["projects", "paged"]');
        expect(index).toContain("listProjects({ page: pageParam, pageSize: 50 })");
        expect(index).toContain("mutationFn: createProject");
        expect(index).toContain("mutationFn: deleteProject");
        expect(index).toContain("await importProjectUnits(");
        expect(index).toContain('navigate(`/projects/${project.project.id}/overview`)');
        expect(index).toContain('`/projects/${project.id}/chapters?import=1`');
        expect(card).toContain('to={`/projects/${row.project.id}/overview`}');
        expect(detail).toContain("<ProjectChaptersView");
        expect(detail).toContain("<ProjectWorkflowView");
        expect(detail).toContain("<ProjectAssetsView");
    });

    test("keeps creation focused until the user explicitly expands AI ideation", async () => {
        const index = await read("../src/pages/projects/index.tsx");

        expect(index).toContain('aria-controls="short-drama-ai-starter"');
        expect(index).toContain("aria-expanded={starterOpen}");
        expect(index).toContain('{starterOpen ? <Surface id="short-drama-ai-starter"');
        expect(index).toContain('aria-controls="short-drama-generation-options"');
        expect(index).toContain("aria-expanded={generationOptionsOpen}");
        expect(index).toContain("aria-pressed={status === item.value}");
        expect(index).toContain('aria-pressed={createSource === "blank"}');
        expect(index).toContain('aria-pressed={createSource === "novel"}');
        expect(index).toContain('aria-pressed={createSource === "text"}');
        expect(index).toContain('htmlFor="short-drama-story-draft"');
        expect(index).toContain('id="short-drama-story-draft"');
    });

    test("keeps PC-only helpers hidden until the desktop breakpoint", async () => {
        const css = await read("../src/pages/projects/short-drama-shell.css");
        const beforeDesktop = compact(css.slice(0, css.indexOf("@media (min-width: 1024px)")));
        const desktop = compact(css.slice(css.indexOf("@media (min-width: 1024px)")));

        expect(beforeDesktop).toContain(".pc-short-drama-create-launcher, .pc-short-drama-story-label, .pc-short-drama-options-toggle");
        expect(beforeDesktop).toContain("display: none;");
        expect(desktop).toContain(".pc-short-drama-create-launcher { display: flex;");
        expect(desktop).toContain('.pc-short-drama-status-filter button[aria-pressed="true"]');
        expect(desktop).toContain("@media (min-width: 1024px) and (prefers-reduced-motion: reduce)");
    });

    test("reduces the overview to one current task and one compact production path", async () => {
        const [overview, css] = await Promise.all([
            read("../src/pages/projects/detail/overview.tsx"),
            read("../src/pages/projects/projects.css"),
        ]);

        expect(overview).toContain('className="project-standard-flow is-compact"');
        expect(overview).toContain('className="project-standard-flow-track is-compact"');
        expect(overview).not.toContain("当前制作检查");
        expect(overview).not.toContain("快速入口");
        expect(overview).not.toContain("step.description");
        expect(css).toContain(".pc-project-overview .project-standard-flow-track.is-compact");
    });

    test("keeps new visual rules isolated from Admin and global theme contracts", async () => {
        const css = await read("../src/pages/projects/short-drama-shell.css");

        expect(css).not.toContain(".admin-");
        expect(css).not.toContain("--admin-");
        expect(css).not.toContain(".ant-modal-");
        expect(css).toContain("--app-surface-1");
        expect(css).toContain("--app-selection-bg");
        expect(css).toContain("--app-focus-shadow");
    });
});
