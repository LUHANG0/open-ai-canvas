import { describe, expect, test } from "bun:test";
import { resolveCanvasNodeRetryPlan } from "../src/pages/canvas/use-canvas-node-retry";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeStatus } from "../src/types/canvas";

function node(id: string, type: CanvasNodeData["type"], status: CanvasNodeStatus = "error", metadata: Partial<NonNullable<CanvasNodeData["metadata"]>> = {}): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata: { status, ...metadata } };
}

describe("画布节点重试分流", () => {
    test("脚本节点读取已保存剧情并拦截空内容", () => {
        expect(resolveCanvasNodeRetryPlan(node("script", CanvasNodeType.Script, "error", { composerContent: "  一段剧情  " }), []).kind).toBe("script");
        expect(resolveCanvasNodeRetryPlan(node("empty", CanvasNodeType.Script), []).kind).toBe("script-missing-prompt");
    });

    test("批次根节点只重试属于自己的失败子图", () => {
        const root = node("root", CanvasNodeType.Image, "error", { isBatchRoot: true, batchChildIds: ["success", "failed", "foreign"] });
        const nodes = [
            root,
            node("success", CanvasNodeType.Image, "success", { batchRootId: root.id }),
            node("failed", CanvasNodeType.Image, "error", { batchRootId: root.id }),
            node("foreign", CanvasNodeType.Image, "error", { batchRootId: "other" }),
        ];
        const plan = resolveCanvasNodeRetryPlan(root, nodes);
        expect(plan.kind).toBe("image-batch");
        if (plan.kind === "image-batch") {
            expect(plan.children.map((child) => child.id)).toEqual(["failed"]);
            expect(plan.announceCount).toBeTrue();
        }
    });

    test("批次子图回到所属根节点，普通节点进入通用生成重试", () => {
        const childPlan = resolveCanvasNodeRetryPlan(node("child", CanvasNodeType.Image, "error", { batchRootId: "root" }), []);
        expect(childPlan.kind).toBe("image-batch");
        if (childPlan.kind === "image-batch") expect(childPlan.announceCount).toBeFalse();
        expect(resolveCanvasNodeRetryPlan(node("video", CanvasNodeType.Video), []).kind).toBe("generation");
    });
});
