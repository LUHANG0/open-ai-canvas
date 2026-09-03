import { expect, test } from "bun:test";

test("canvas feedback toasts load only while feedback state exists", async () => {
    const feedbackSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-feedback.tsx", import.meta.url)).text();
    const toastsSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-feedback-toasts.tsx", import.meta.url)).text();
    const uploadSource = await Bun.file(new URL("../src/pages/canvas/use-canvas-upload.ts", import.meta.url)).text();
    const taskDetailSource = await Bun.file(new URL("../src/pages/canvas/canvas-project-task-detail-dialog.tsx", import.meta.url)).text();

    expect(feedbackSource).toContain('lazy(() => import("./canvas-project-feedback-toasts")');
    expect(feedbackSource).toContain("if (!uploadStatus && !mergeVideoProgress && !agentChange) return null");
    expect(feedbackSource).toContain("<Suspense fallback={null}>");
    expect(feedbackSource).not.toContain('from "motion/react"');
    expect(feedbackSource).not.toContain('from "lucide-react"');
    expect(feedbackSource).toContain("export function TaskDetailItem");
    expect(feedbackSource).toContain("export function taskStatusText");
    expect(feedbackSource).toContain("export type CanvasUploadStatus");

    expect(toastsSource).toContain('from "motion/react"');
    expect(toastsSource).toContain('from "lucide-react"');
    expect(toastsSource).toContain("export function CanvasUploadStatusToast");
    expect(toastsSource).toContain("export function CanvasMergeStatusToast");
    expect(toastsSource).toContain("export function CanvasAgentChangeToast");
    expect(uploadSource).toContain('import type { CanvasUploadStatus } from "./canvas-project-feedback"');
    expect(taskDetailSource).toContain('import { TaskDetailItem } from "./canvas-project-feedback"');
});
