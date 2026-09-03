import { describe, expect, test } from "bun:test";

async function source(path: string) {
    return Bun.file(new URL(path, import.meta.url)).text();
}

describe("canvas minimap lazy loading", () => {
    test("loads the minimap only when the bottom dock allows it", async () => {
        const dockSource = await source("../src/pages/canvas/canvas-project-bottom-dock.tsx");

        expect(dockSource).toContain('lazy(() => import("@/components/canvas/canvas-mini-map")');
        expect(dockSource).not.toContain('import { Minimap } from "@/components/canvas/canvas-mini-map"');
        expect(dockSource).toContain('type MinimapProps = ComponentProps<typeof import("@/components/canvas/canvas-mini-map").Minimap>');
        expect(dockSource).toContain("canShowCanvasMiniMap(isMiniMapOpen, focusMode) ? (");
        expect(dockSource).toContain("<Suspense");
        expect(dockSource).toContain('className="sr-only"');
        expect(dockSource).toContain('role="status"');
        expect(dockSource).toContain('aria-live="polite"');
        expect(dockSource).toContain("正在加载画布小地图…");
        expect(dockSource).toContain("<Minimap nodes={nodes} viewport={viewport} viewportSize={viewportSize}");
    });

    test("keeps zoom controls and the asset tray on the static path", async () => {
        const dockSource = await source("../src/pages/canvas/canvas-project-bottom-dock.tsx");

        expect(dockSource).toContain('import { CanvasZoomControls } from "@/components/canvas/canvas-zoom-controls"');
        expect(dockSource).toContain('import { CanvasAssetTray } from "@/components/canvas/canvas-asset-tray"');
        expect(dockSource.match(/lazy\(\(\) => import/g)).toHaveLength(1);
        expect(dockSource).toContain("<CanvasZoomControls");
        expect(dockSource).toContain("<CanvasAssetTray");
    });
});
