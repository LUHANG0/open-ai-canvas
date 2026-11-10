import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasNode } from "../src/components/canvas/canvas-node";
import { canvasNodeCanResyncTask } from "../src/lib/canvas/canvas-task-state";
import { subscribeTaskTicker } from "../src/lib/canvas/task-ticker";
import { CanvasNodeType, type CanvasNodeData } from "../src/types/canvas";

const noop = () => {};
const createdAt = () => new Date(Date.now() - 103_000).toISOString();
// 服务端渲染读取的是共享时钟的快照，只有被订阅时才会走动；整套测试里该模块可能早已加载，
// 渲染前先让它走一下，否则“已用时”会按模块加载时刻计算，测试结果取决于前面跑了多久。
const refreshTaskTicker = () => subscribeTaskTicker(() => {})();

function renderNode(metadata: CanvasNodeData["metadata"], type: CanvasNodeData["type"] = CanvasNodeType.Image) {
    refreshTaskTicker();
    return renderToStaticMarkup(
        <CanvasNode
            data={{ id: "node", type, title: "去掉水印", position: { x: 0, y: 0 }, width: 240, height: 420, metadata }}
            scale={1}
            isSelected={false}
            isRelated={false}
            isFocusRelated={false}
            isConnectionTarget={false}
            showImageInfo={false}
            onMouseDown={noop}
            onHoverStart={noop}
            onHoverEnd={noop}
            onConnectStart={noop}
            onResize={noop}
            onContentChange={noop}
            onContextMenu={noop}
            onOpenTaskDetails={noop}
            onRetry={noop}
            onReloadResource={noop}
        />,
    );
}

describe("画布节点生成中：保留梦层简洁低开销呈现", () => {
    test("保存阶段保留作品已生成的语义和任务详情，不为每个节点运行耗时计时器", () => {
        const markup = renderNode({ status: "loading", taskId: "task", taskStatus: "running", taskStage: "作品已生成，正在保存", taskMediaStage: "upload", taskCreatedAt: createdAt() });
        expect(markup).toContain('data-minimal="true"');
        expect(markup).toContain("作品已生成，正在保存");
        expect(markup).toContain('role="status"');
        expect(markup).toContain("查看详情");
        expect(markup).not.toContain("已用时");
        expect(markup).not.toContain("canvas-node-status-chip");
    });

    test("保存重试继续表达作品已生成，不显示普通生成失败", () => {
        const markup = renderNode({ status: "loading", taskId: "task", taskStatus: "running", taskStage: "作品已生成，保存遇到问题，正在自动恢复", taskMediaStage: "download", taskCreatedAt: createdAt() });
        expect(markup).toContain("作品已生成，正在保存");
        expect(markup).not.toContain("生成失败");
        expect(markup).toContain("查看详情");
    });

    test("排队和供应商阶段使用可读文案，无任务 ID 不出现详情入口", () => {
        const queued = renderNode({ status: "loading", taskId: "task", taskStatus: "queued", taskStage: "等待队列调度" });
        expect(queued).toContain("排队中");
        const submitting = renderNode({ status: "loading", taskStage: "正在准备生成任务" });
        expect(submitting).toContain("正在准备");
        expect(submitting).not.toContain("查看详情");
        const provider = renderNode({ status: "loading", taskId: "task", taskStatus: "running", taskStage: "provider_processing" });
        expect(provider).toContain("生成中");
        expect(provider).not.toContain("provider_processing");
    });

    test("恢复诊断保留在可访问状态中，任务详情仍可打开", () => {
        const markup = renderNode({ status: "loading", taskId: "task", taskStatus: "running", errorDetails: "任务恢复暂不可用，请到任务中心核对。" });
        expect(markup).toContain('aria-live="polite"');
        expect(markup).toContain("任务恢复暂不可用，请到任务中心核对。");
        expect(markup).toContain('aria-label="查看任务详情"');
    });

    test("视频仅在真实进度存在时显示可访问百分比", () => {
        const markup = renderNode({ status: "loading", taskId: "task", taskStatus: "running", taskProgress: 42 }, CanvasNodeType.Video);
        expect(markup).toContain('role="progressbar"');
        expect(markup).toContain('aria-valuenow="42"');
        expect(renderNode({ status: "loading", taskId: "task", taskStatus: "running" }, CanvasNodeType.Video)).not.toContain('role="progressbar"');
    });
});

describe("画布节点失败态按下一步动作分类", () => {
    test("轮询中断时任务仍在跑：只建议重新获取，不把等待中断说成生成失败", () => {
        const markup = renderNode({ status: "error", taskId: "task", taskStatus: "running", errorDetails: "网络异常。" });
        expect(markup).toContain("状态同步中断");
        expect(markup).toContain("重新获取");
        expect(markup).toContain("重新生成");
        expect(markup).not.toContain("生成失败");
    });

    test("结果已生成但回写失败：提示作品已生成，可重新获取", () => {
        const markup = renderNode({ status: "error", taskId: "task", taskStatus: "succeeded", resourceReloadAvailable: true, errorDetails: "结果已生成，应用结果失败：资源读取失败（503）" });
        expect(markup).toContain("作品载入失败");
        expect(markup).toContain("重新获取");
    });

    test("作品已生成但保存失败：重新保存，不重新生成", () => {
        const markup = renderNode({ status: "error", taskId: "task", taskStatus: "failed", taskMediaStage: "upload", taskCanRecoverMedia: true, errorDetails: "作品已生成，但保存未完成：上传 OSS" });
        expect(markup).toContain("作品保存未完成");
        expect(markup).toContain("重新保存");
        expect(markup).not.toContain("重新获取");
    });

    test("后端确认失败才建议重新生成", () => {
        const markup = renderNode({ status: "error", taskId: "task", taskStatus: "failed", errorDetails: "模型服务处理失败，请稍后重试或换用其他模型。" });
        expect(markup).toContain("生成失败");
        expect(markup).toContain("重新生成");
        expect(markup).not.toContain("重新获取");
    });

    test("可重新获取的判定只认后端没确认失败的任务", () => {
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "running" })).toBe(true);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "queued" })).toBe(true);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "succeeded", resourceReloadAvailable: true })).toBe(true);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "succeeded" })).toBe(true);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "failed" })).toBe(false);
        expect(canvasNodeCanResyncTask({ status: "error", taskStatus: "running" })).toBe(false);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "running", taskStage: "submission_unknown" })).toBe(false);
        expect(canvasNodeCanResyncTask({ status: "error", taskId: "task", taskStatus: "running", isBatchRoot: true })).toBe(false);
        expect(canvasNodeCanResyncTask({ status: "loading", taskId: "task", taskStatus: "running" })).toBe(false);
    });
});

describe("画布节点完成反馈", () => {
    test("刷新或重新挂载的已完成节点不重放完成徽章和出现动画", () => {
        const markup = renderNode({ status: "success", taskId: "task", taskStatus: "succeeded", content: "/image.png", storageKey: "resource:image" });
        expect(markup).not.toContain("canvas-node-status-chip");
        expect(markup).not.toContain("已完成");
        expect(markup).not.toContain("data-generation-reveal");
    });

    test("真实 DOM：生成中转为完成只播放一次完成反馈，窗口结束后自行撤掉", () => {
        const result = Bun.spawnSync([process.execPath, "test", "./test/fixtures/canvas-node-generation-reveal.harness.tsx"], { cwd: resolve(import.meta.dir, ".."), timeout: 15000 });
        const output = new TextDecoder().decode(result.stdout) + new TextDecoder().decode(result.stderr);
        expect(output).toContain("0 fail");
        expect(result.exitCode, output).toBe(0);
    });
});
