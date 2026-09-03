import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("task card action convergence", () => {
    test("shares the same view and retry contract across list and grid cards", async () => {
        const [actions, grid, list] = await Promise.all([read("../src/pages/tasks/task-actions.tsx"), read("../src/pages/tasks/task-grid-card.tsx"), read("../src/pages/tasks/task-list-row.tsx")]);

        expect(grid).toContain("<TaskActions");
        expect(list).toContain("<TaskActions");
        expect(grid).not.toContain('from "antd"');
        expect(list).not.toContain('from "antd"');
        expect(actions).toContain("CONTENT_MODERATION_ERROR_CODE");
        expect(actions).toContain("isContentModerationError");
        expect(actions).toContain('aria-label="查看详情"');
        expect(actions).toContain('aria-label="重试任务"');
        expect(actions).toContain("loading={actingId === task.id}");
    });
});
