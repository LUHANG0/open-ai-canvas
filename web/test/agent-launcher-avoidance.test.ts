import { expect, test } from "bun:test";
import { avoidAgentLauncherOverlap } from "../src/lib/canvas/agent-launcher-position";

const viewport = { width: 1280, height: 720 };
const size = { width: 76, height: 76 };
const preferred = { right: 20, bottom: 20 };
const composer = { left: 251, top: 581, right: 1256, bottom: 712 };

test("the launcher and its label clear the real desktop composer without changing the preference", () => {
    const placed = avoidAgentLauncherOverlap(preferred, viewport, size, [composer]);
    expect(720 - placed.bottom + 34 + 12).toBeLessThanOrEqual(composer.top);
    expect(placed.right).toBe(20);
    expect(preferred).toEqual({ right: 20, bottom: 20 });
    expect(avoidAgentLauncherOverlap(preferred, viewport, size, [])).toEqual(preferred);
});

test("a user's position outside the composer remains unchanged", () => {
    const moved = { right: 400, bottom: 240 };
    expect(avoidAgentLauncherOverlap(moved, viewport, size, [composer])).toEqual(moved);
});

test("avoidance may move sideways when there is no room above a tall composer", () => {
    const obstacle = { left: 950, top: 20, right: 1260, bottom: 710 };
    const placed = avoidAgentLauncherOverlap(preferred, viewport, size, [obstacle]);
    expect(viewport.width - placed.right + 14 + 12).toBeLessThanOrEqual(obstacle.left);
});

test("large avatars, collapsed orbs and short viewports stay in bounds", () => {
    for (const dimensions of [{ width: 244, height: 220 }, { width: 48, height: 48 }, size]) {
        const placed = avoidAgentLauncherOverlap(preferred, { width: 1280, height: 400 }, dimensions, [{ ...composer, top: 250, bottom: 392 }]);
        expect(placed.right).toBeGreaterThanOrEqual(20);
        expect(placed.bottom).toBeGreaterThanOrEqual(20);
        expect(placed.right + dimensions.width).toBeLessThanOrEqual(1260);
        expect(placed.bottom + dimensions.height).toBeLessThanOrEqual(380);
    }
});

test("avoidance clears all marked surfaces rather than jumping onto the next one", () => {
    const obstacles = [composer, { left: 1100, top: 300, right: 1260, bottom: 570 }];
    const placed = avoidAgentLauncherOverlap(preferred, viewport, size, obstacles);
    const left = viewport.width - placed.right - size.width;
    const top = viewport.height - placed.bottom - size.height;
    for (const obstacle of obstacles) {
        expect(left - 14 >= obstacle.right + 12 || left + size.width + 14 <= obstacle.left - 12 || top - 14 >= obstacle.bottom + 12 || top + size.height + 34 <= obstacle.top - 12).toBe(true);
    }
});

test("a completely covered viewport has a deterministic bounded fallback", () => {
    expect(avoidAgentLauncherOverlap(preferred, viewport, size, [{ left: 0, top: 0, right: 1280, bottom: 720 }])).toEqual(preferred);
});
