import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CreationMessageView } from "@/pages/create/creation-workspace-messages";
import type { CreationMessage } from "@/pages/create/creation-types";

const message: CreationMessage = {
    id: "message-state-test",
    role: "assistant",
    mode: "text",
    content: "",
    createdAt: "2026-10-22T01:00:00Z",
};
const noop = () => {};

function renderMessage(update: Partial<CreationMessage>) {
    return renderToStaticMarkup(<CreationMessageView item={{ ...message, ...update }} shotNumber={0} onRetryFailure={noop} onCreateVariant={noop} onEditUserMessage={noop} onContinueCanvas={noop} openingCanvas={false} />);
}

describe("创作消息状态展示", () => {
    test("等待和流式首字前保留可见加载文字与忙碌语义", () => {
        for (const status of ["pending", "streaming"] as const) {
            const html = renderMessage({ status });
            expect(html).toContain('aria-busy="true"');
            expect(html).toContain('role="status"');
            expect(html).toContain("正在生成…");
        }
    });

    test("失败的空文本显示错误与重试，不再冒充生成中", () => {
        for (const error of [undefined, "测试失败原因"]) {
            const html = renderMessage({ status: "error", error });
            expect(html).toContain("生成失败");
            expect(html).toContain("重新生成");
            expect(html).not.toContain("正在生成…");
            expect(html).toContain('aria-busy="false"');
        }
    });

    test("已停止与空的完成结果不显示忙碌占位", () => {
        const cancelled = renderMessage({ status: "cancelled" });
        expect(cancelled).toContain("已停止");
        expect(cancelled).not.toContain("正在生成…");
        const completed = renderMessage({ status: "done" });
        expect(completed).toContain("已完成");
        expect(completed).toContain("没有返回文本内容");
        expect(completed).not.toContain("正在生成…");
    });

    test("已有文本在失败或停止后仍保留供阅读", () => {
        for (const status of ["done", "error", "cancelled"] as const) {
            const html = renderMessage({ status, content: "已输出的故事内容" });
            expect(html).toContain("已输出的故事内容");
            expect(html).not.toContain("正在生成…");
        }
    });

    test("媒体生成保留原比例和可见文字，结果解析与生成状态分开", () => {
        const pending = renderMessage({ status: "pending", mode: "video", settings: { ratio: "16:9", seconds: "6", quality: "auto", videoQuality: "720p", count: "1" } });
        expect(pending).toContain("aspect-ratio:16 / 9");
        expect(pending).toContain("正在生成视频");
        const resolving = renderMessage({ status: "done", mode: "video", resultStorageKeys: ["resource:video-test"], resultUrls: ["/api/resources/video-test/file"] });
        expect(resolving).toContain("正在加载生成结果…");
        expect(resolving).not.toContain("没有返回可预览结果");
        expect(resolving).not.toContain("<video");
    });
});
