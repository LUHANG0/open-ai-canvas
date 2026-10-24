import { expect, test } from "bun:test";
import { demoConnection, initialDemoPoint, zoomDemoAt } from "../src/components/brand/brand-canvas-geometry";

test("zoom leaves the world point under the cursor stationary", () => {
    const pan = { x: -150, y: 36 }, cursor = { x: 420, y: 180 };
    const world = { x: (cursor.x - pan.x) / .82, y: (cursor.y - pan.y) / .82 };
    const result = zoomDemoAt(pan, .82, 1.3, cursor);
    expect(result.x + world.x * 1.3).toBeCloseTo(cursor.x);
    expect(result.y + world.y * 1.3).toBeCloseTo(cursor.y);
    const reversed = zoomDemoAt(result, 1.3, .82, cursor);
    expect(reversed.x).toBeCloseTo(pan.x);
    expect(reversed.y).toBeCloseTo(pan.y);
});

test("connections retain both endpoints beyond the initial world bounds", () => {
    const result = demoConnection({ x: -5000, y: 3000 }, initialDemoPoint(1));
    expect(result).toStartWith("M -4720 3145 C");
    expect(result).toEndWith("400 185");
});
