import { describe, expect, test } from "bun:test";

import { canvasSaveStatusPresentation, shouldBlockCanvasUnload, type CanvasSaveStatus } from "../src/lib/canvas/canvas-save-status";

function status(overrides: Partial<CanvasSaveStatus> = {}): CanvasSaveStatus {
    return {
        local: { phase: "saved", lastSavedAt: null, error: null },
        remote: { phase: "inactive", pending: false, lastSyncedAt: null, error: null, failureKind: null },
        ...overrides,
    };
}

describe("canvas save status", () => {
    test("distinguishes a durable local save from cloud sync", () => {
        expect(canvasSaveStatusPresentation(status()).label).toBe("已保存到本机");
        expect(canvasSaveStatusPresentation(status({ remote: { phase: "syncing", pending: true, lastSyncedAt: null, error: null, failureKind: null } })).label).toBe("同步中");
        expect(canvasSaveStatusPresentation(status({ remote: { phase: "ready", pending: false, lastSyncedAt: Date.now(), error: null, failureKind: null } })).label).toBe("已保存");
    });

    test("only offers retry for write failures that can be retried", () => {
        const localFailure = canvasSaveStatusPresentation(status({ local: { phase: "failed", lastSavedAt: null, error: "quota exceeded" } }));
        expect(localFailure).toMatchObject({ label: "保存失败", retryable: true, tone: "danger" });

        const syncFailure = canvasSaveStatusPresentation(status({ remote: { phase: "failed", pending: true, lastSyncedAt: null, error: "network unavailable", failureKind: "sync" } }));
        expect(syncFailure).toMatchObject({ label: "同步失败", retryable: true, tone: "warning" });

        const hydrationFailure = canvasSaveStatusPresentation(status({ remote: { phase: "failed", pending: false, lastSyncedAt: null, error: "session expired", failureKind: "hydrate" } }));
        expect(hydrationFailure).toMatchObject({ label: "云端不可用", retryable: false, tone: "warning" });
    });

    test("blocks refresh only while the local durable copy is unsettled", () => {
        expect(shouldBlockCanvasUnload(status())).toBe(false);
        expect(shouldBlockCanvasUnload(status({ local: { phase: "saving", lastSavedAt: null, error: null } }))).toBe(true);
        expect(shouldBlockCanvasUnload(status({ local: { phase: "failed", lastSavedAt: null, error: "storage failed" } }))).toBe(true);
        expect(shouldBlockCanvasUnload(status({ remote: { phase: "failed", pending: true, lastSyncedAt: null, error: "offline", failureKind: "sync" } }))).toBe(false);
    });
});
