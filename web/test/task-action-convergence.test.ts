import { describe, expect, test } from "bun:test";
import { isTaskFailed, statusDotClassName, taskStatusTone } from "../src/pages/tasks/task-display";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("task card action convergence", () => {
    test("separates cancellation and uncertain submission tones from retry grouping", () => {
        const cancelled = { provider: "system", status: "cancelled" as const };
        const failed = { provider: "system", status: "failed" as const };
        const uncertain = { provider: "dreamina-cli", status: "failed" as const, stage: "submission_unknown" };

        expect(taskStatusTone(cancelled)).toBe("info");
        expect(taskStatusTone(failed)).toBe("error");
        expect(taskStatusTone(uncertain)).toBe("warning");
        expect(statusDotClassName(cancelled)).toBe("task-record-dot is-info");
        expect(statusDotClassName(uncertain)).toBe("task-record-dot is-warning");
        expect(isTaskFailed(cancelled)).toBe(true);
        expect(isTaskFailed(failed)).toBe(true);
        expect(isTaskFailed(uncertain)).toBe(true);
        expect(isTaskFailed({ status: "running" })).toBe(false);
    });

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
