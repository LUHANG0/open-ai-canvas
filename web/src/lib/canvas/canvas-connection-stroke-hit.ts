import type { CanvasConnectionGeometry } from "./canvas-connection-geometry";

export type CanvasStrokeHitEntry = { id: string; geometry: CanvasConnectionGeometry };
export type CanvasStrokeHitTester = {
    pick(entries: readonly CanvasStrokeHitEntry[], x: number, y: number, scale: number): string | null;
};

let tester: CanvasStrokeHitTester | null | undefined;

/** Native stroke geometry, not a sampled polyline. Unsupported browsers keep the
 * individual SVG hit paths; a missing canvas API must never disable selection. */
export function getCanvasConnectionStrokeHitTester(): CanvasStrokeHitTester | null {
    if (tester !== undefined) return tester;
    if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
    const context = document.createElement("canvas").getContext("2d");
    if (!context || typeof context.isPointInStroke !== "function") return (tester = null);
    const paths = new WeakMap<CanvasConnectionGeometry, Path2D>();
    context.lineCap = "butt";
    context.lineJoin = "miter";
    tester = {
        pick(entries, x, y, scale) {
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(scale) || scale <= 0) return null;
            context.lineWidth = 16 / scale;
            const radius = context.lineWidth / 2;
            // The last original DOM edge wins, including overlaps within a batch.
            for (let index = entries.length - 1; index >= 0; index--) {
                const { id, geometry } = entries[index];
                const bounds = geometry.bounds;
                if (!geometry.pathD || x < bounds.left - radius || x > bounds.right + radius || y < bounds.top - radius || y > bounds.bottom + radius) continue;
                let path = paths.get(geometry);
                if (!path) {
                    path = new Path2D(geometry.pathD);
                    paths.set(geometry, path);
                }
                if (context.isPointInStroke(path, x, y)) return id;
            }
            return null;
        },
    };
    return tester;
}
