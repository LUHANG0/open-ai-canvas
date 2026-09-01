import { describe, expect, test } from "bun:test";

import { CANVAS_LARGE_REPRO_PROJECT_ID, CANVAS_REPRO_PROJECT_ID, createCanvasReproProject, createLargeCanvasReproProject } from "../src/lib/canvas/canvas-repro-fixture";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("canvas P0 reproduction fixture", () => {
    test("provides deterministic nodes, connections and viewport without remote media", () => {
        const project = createCanvasReproProject();

        expect(project.id).toBe(CANVAS_REPRO_PROJECT_ID);
        expect(project.nodes.map((node) => node.id)).toEqual(["canvas-p0-text-story", "canvas-p0-text-shot", "canvas-p0-image-reference", "canvas-p0-config"]);
        expect(project.connections).toHaveLength(2);
        expect(project.nodes.every((node) => !node.metadata?.content?.startsWith("http"))).toBe(true);
        expect(project.viewport).toEqual({ x: 120, y: 70, k: 0.9 });
    });

    test("keeps the lab dev-only and isolated from auth bootstrap", async () => {
        const [router, providers] = await Promise.all([read("../src/router.tsx"), read("../src/components/layout/app-providers.tsx")]);

        expect(router).toContain('const CanvasReproLab = lazy(() => import("@/pages/dev/canvas-repro-lab"))');
        expect(router).toContain('{ path: "/dev/canvas-repro/:id"');
        expect(router.indexOf("CanvasReproLab")).toBeGreaterThan(router.indexOf("function devRoutes()"));
        expect(providers).toContain('window.location.pathname.startsWith("/dev/canvas-repro/")');
    });

    test("provides a deterministic large graph without remote media", () => {
        const project = createLargeCanvasReproProject();

        expect(project.id).toBe(CANVAS_LARGE_REPRO_PROJECT_ID);
        expect(project.nodes).toHaveLength(324);
        expect(project.connections).toHaveLength(612);
        expect(project.nodes.every((node) => !node.metadata?.content?.startsWith("http"))).toBe(true);
        expect(new Set(project.nodes.map((node) => node.id)).size).toBe(project.nodes.length);
    });
});
