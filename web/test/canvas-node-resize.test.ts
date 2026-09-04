import { describe, expect, test } from "bun:test";

import { calculateCanvasResizeBounds, createCanvasResizeGesture, sameCanvasResizeInput, type CanvasResizeBounds, type CanvasResizeCorner } from "../src/lib/canvas/canvas-node-resize";

const initial = { x: 100, y: 200, width: 400, height: 300 };
const minimum = { minWidth: 120, minHeight: 80 };

function gestureHarness(scale = 1, bounds = initial) {
    let frameId = 0;
    const frames = new Map<number, () => void>();
    const previews: Array<CanvasResizeBounds | null> = [];
    const commits: CanvasResizeBounds[] = [];
    const gesture = createCanvasResizeGesture({
        initial: bounds,
        start: { x: 10, y: 20 },
        scale,
        corner: "bottom-right",
        constraints: minimum,
        requestFrame: (callback) => {
            const id = frameId++;
            frames.set(id, callback);
            return id;
        },
        cancelFrame: (id) => { frames.delete(id); },
        preview: (preview) => { previews.push(preview); },
        commit: (result) => { commits.push(result); },
    });
    const flushFrame = () => {
        const callbacks = [...frames.values()];
        frames.clear();
        callbacks.forEach((callback) => callback());
    };
    return { gesture, frames, previews, commits, flushFrame };
}

describe("canvas resize preview", () => {
    test("many pointer moves render one latest preview per frame without writing canvas state", () => {
        const harness = gestureHarness(0.5);
        for (let step = 1; step <= 60; step++) harness.gesture.move({ x: 10 + step, y: 20 + step });
        expect(harness.frames.size).toBe(1);
        expect(harness.commits).toEqual([]);
        harness.flushFrame();
        expect(harness.previews).toEqual([{ x: 100, y: 200, width: 520, height: 420 }]);
        expect(harness.commits).toEqual([]);
        harness.gesture.move({ x: 80, y: 100 });
        harness.flushFrame();
        expect(harness.previews.at(-1)).toEqual({ x: 100, y: 200, width: 540, height: 460 });
        expect(harness.commits).toEqual([]);
    });

    test("pointerup commits its final coordinates once even before the pending animation frame", () => {
        const harness = gestureHarness();
        harness.gesture.move({ x: 30, y: 40 });
        harness.gesture.finish({ x: 90, y: 120 });
        expect(harness.frames.size).toBe(0);
        expect(harness.previews).toEqual([null]);
        expect(harness.commits).toEqual([{ x: 100, y: 200, width: 480, height: 400 }]);
        harness.gesture.finish({ x: 100, y: 130 });
        harness.gesture.move({ x: 120, y: 140 });
        harness.flushFrame();
        expect(harness.commits).toHaveLength(1);
        expect(harness.previews).toEqual([null]);
    });

    test("finish can flush the last move when the caller has no new coordinates", () => {
        const harness = gestureHarness();
        harness.gesture.move({ x: 35, y: 65 });
        harness.gesture.finish();
        expect(harness.commits).toEqual([{ x: 100, y: 200, width: 425, height: 345 }]);
    });

    test("cancel restores the preview and discards queued updates without a history entry", () => {
        const harness = gestureHarness();
        harness.gesture.move({ x: 40, y: 50 });
        harness.flushFrame();
        harness.gesture.move({ x: 80, y: 90 });
        harness.gesture.cancel();
        harness.flushFrame();
        harness.gesture.finish({ x: 90, y: 100 });
        expect(harness.frames.size).toBe(0);
        expect(harness.previews.at(-1)).toBeNull();
        expect(harness.commits).toEqual([]);
    });

    test("unmount discards pending frames without calling a React state setter or commit", () => {
        const harness = gestureHarness();
        harness.gesture.move({ x: 40, y: 50 });
        harness.gesture.dispose();
        harness.flushFrame();
        harness.gesture.finish();
        expect(harness.frames.size).toBe(0);
        expect(harness.previews).toEqual([]);
        expect(harness.commits).toEqual([]);
    });

    test("clicks and returning to the starting position preserve the original dimensions", () => {
        const small = { ...initial, width: 90, height: 60 };
        const click = gestureHarness(1, small);
        click.gesture.finish({ x: 10, y: 20 });
        expect(click.commits).toEqual([]);
        const returned = gestureHarness();
        returned.gesture.move({ x: 80, y: 90 });
        returned.flushFrame();
        returned.gesture.finish({ x: 10, y: 20 });
        expect(returned.commits).toEqual([]);
        expect(returned.previews.at(-1)).toBeNull();
    });
});

describe("canvas resize geometry", () => {
    test("only external geometry or effective constraints invalidate a gesture", () => {
        const input = { nodeId: "node", bounds: initial, scale: 1, constraints: { ...minimum, aspectRatio: 2 } };
        expect(sameCanvasResizeInput(input, { ...input, bounds: { ...initial }, constraints: { ...input.constraints } })).toBe(true);
        expect(sameCanvasResizeInput(input, { ...input, nodeId: "replacement" })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, bounds: { ...initial, x: 110 } })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, bounds: { ...initial, width: 350 } })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, scale: 0.5 })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, constraints: { ...input.constraints, minHeight: 200 } })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, constraints: { ...input.constraints, aspectRatio: 3 } })).toBe(false);
        expect(sameCanvasResizeInput(input, { ...input, constraints: { ...input.constraints, contentBounds: { left: 50, top: 50, right: 100, bottom: 100 } } })).toBe(false);
    });

    test("all corners keep the opposite corner fixed while changing position and size", () => {
        const expected: Record<CanvasResizeCorner, CanvasResizeBounds> = {
            "top-left": { x: 130, y: 240, width: 370, height: 260 },
            "top-right": { x: 100, y: 240, width: 430, height: 260 },
            "bottom-left": { x: 130, y: 200, width: 370, height: 340 },
            "bottom-right": { x: 100, y: 200, width: 430, height: 340 },
        };
        for (const corner of Object.keys(expected) as CanvasResizeCorner[]) {
            expect(calculateCanvasResizeBounds(initial, { x: 30, y: 40 }, corner, minimum)).toEqual(expected[corner]);
        }
    });

    test("minimum width and storyboard height clamp dimensions without moving the opposite anchor", () => {
        expect(calculateCanvasResizeBounds(initial, { x: 800, y: 800 }, "top-left", { minWidth: 200, minHeight: 280 })).toEqual({ x: 300, y: 220, width: 200, height: 280 });
    });

    test("aspect ratio follows the dominant pointer axis and respects both minimums", () => {
        const widescreen = { ...initial, width: 400, height: 200 };
        expect(calculateCanvasResizeBounds(widescreen, { x: 100, y: 30 }, "bottom-right", { ...minimum, aspectRatio: 2 })).toEqual({ x: 100, y: 200, width: 500, height: 250 });
        expect(calculateCanvasResizeBounds(widescreen, { x: 20, y: 80 }, "bottom-right", { ...minimum, aspectRatio: 2 })).toEqual({ x: 100, y: 200, width: 560, height: 280 });
        expect(calculateCanvasResizeBounds(widescreen, { x: 600, y: 600 }, "top-left", { minWidth: 180, minHeight: 120, aspectRatio: 2 })).toEqual({ x: 260, y: 280, width: 240, height: 120 });
    });

    test("frames cannot shrink across padded child content on either moving edge", () => {
        const constraints = { minWidth: 120, minHeight: 80, contentBounds: { left: 120, top: 230, right: 470, bottom: 460 } };
        expect(calculateCanvasResizeBounds(initial, { x: 400, y: 400 }, "top-left", constraints)).toEqual({ x: 120, y: 230, width: 380, height: 270 });
        expect(calculateCanvasResizeBounds(initial, { x: -400, y: -400 }, "bottom-right", constraints)).toEqual({ x: 100, y: 200, width: 370, height: 260 });
    });
});
