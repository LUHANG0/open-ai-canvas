import { expect, test } from "bun:test";

test("canvas empty state entry views load only after routing resolves a visible kind", async () => {
    const entrySource = await Bun.file(new URL("../src/components/canvas/canvas-short-drama-entry.tsx", import.meta.url)).text();
    const emptyStatesSource = await Bun.file(new URL("../src/components/canvas/canvas-empty-states.tsx", import.meta.url)).text();
    const routeSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-empty-state.tsx", import.meta.url)).text();

    expect(entrySource).toContain("export function CanvasStylePlaceholderNodeContent");
    expect(entrySource).toContain("export function CanvasStoryInputNodeContent");
    expect(entrySource).not.toContain('from "antd"');
    expect(entrySource).not.toContain("CanvasShortDramaEmptyState");

    expect(emptyStatesSource).toContain("export function CanvasLinkedProjectEmptyState");
    expect(emptyStatesSource).toContain("export function CanvasShortDramaEmptyState");
    expect(emptyStatesSource).toContain("export function CanvasFreeformEmptyState");
    expect(emptyStatesSource).toContain('import { Dropdown } from "antd"');

    expect(routeSource).toContain('lazy(() => import("@/components/canvas/canvas-empty-states")');
    expect(routeSource).toContain("const kind = resolveCanvasEmptyStateKind(nodeCount, shortDramaEnabled, linkedProjectId)");
    expect(routeSource).toContain('if (kind === "freeform")');
    expect(routeSource).toContain('if (kind === "short-drama")');
    expect(routeSource).toContain('if (kind !== "linked-project" || !linkedProjectId) return null');
    expect(routeSource.match(/<Suspense fallback=\{<CanvasEmptyStateLoading kind=\{kind\} \/>\}>/g)?.length).toBe(3);
    expect(routeSource).toContain("pointer-events-none absolute inset-0");
    expect(routeSource).toContain('shortDrama ? "h-[288px] max-w-[760px]"');
    expect(routeSource).not.toContain('className="fixed inset-0');
    expect(routeSource).toContain("onUpload: onUploadRequest");
    expect(routeSource).toContain("onAddText: () => onCreateNode(CanvasNodeType.Text)");
    expect(routeSource).toContain("onAddScript: () => onCreateNode(CanvasNodeType.Script)");
    expect(routeSource).toContain("onOpenAgent: openCinematicAgent");
});
