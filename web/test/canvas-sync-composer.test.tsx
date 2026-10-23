import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentChatComposer } from "../src/components/canvas/canvas-cloud-agent-composer";
import { canvasThemes } from "../src/lib/canvas-theme";
import { CanvasSyncStatus } from "../src/pages/canvas/canvas-sync-status";
import { useSyncProgressStore } from "../src/stores/use-sync-progress-store";

test("unconfirmed sync prevents sending without disabling the real Agent input", () => {
    const markup = renderToStaticMarkup(<AgentChatComposer prompt="Keep this draft" submitDisabled placeholder="Compose" theme={canvasThemes.dark} onPromptChange={() => {}} onSubmit={() => {}} />);
    const sendButton = markup.match(/<button[^>]*aria-label="发送"[^>]*>/)?.[0];
    expect(sendButton).toBeDefined();
    expect(sendButton).toContain("disabled");
    expect(markup).toContain('aria-label="Agent 输入"');
    expect(markup).not.toContain('contenteditable="false"');
});

test("real sync status has no recovery card, buttons or alternate-canvas actions", () => {
    useSyncProgressStore.getState().setProjectProgress("status-test", { phase: "pending", errorKind: "network", message: "画布同步失败：连接中断" });
    try {
        const markup = renderToStaticMarkup(<CanvasSyncStatus projectId="status-test" />);
        expect(markup).toContain('role="status"');
        expect(markup).not.toContain("<button");
        expect(markup).not.toContain("采用云端");
        expect(markup).not.toContain("另存");
        expect(markup).not.toContain("导出");
    } finally {
        useSyncProgressStore.getState().setProjectProgress("status-test", null);
    }
});

test("local persistence, cloud waiting and failures have distinct truthful status labels", async () => {
    const { Window } = await import("happy-dom");
    const dom = new Window({ url: "http://localhost/" });
    const originals = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, IS_REACT_ACT_ENVIRONMENT: true })) {
        originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const cases = [
        { patch: { phase: "done", localPhase: "pending" }, label: "正在保存到本地", spinning: false },
        { patch: { phase: "local", localPhase: "saved" }, label: "已保存到本地，尚未确认云端", spinning: false },
        { patch: { phase: "pending", localPhase: "saved" }, label: "等待同步到云端", spinning: false },
        { patch: { phase: "saving", localPhase: "saved" }, label: "正在同步画布", spinning: true },
        { patch: { phase: "uploading", localPhase: "saved" }, label: "正在上传画布媒体", spinning: true },
        { patch: { phase: "pending", errorKind: "network", message: "画布同步失败：网络中断" }, label: "画布同步失败：网络中断", spinning: false },
        { patch: { phase: "done", localPhase: "error", localError: "空间不足" }, label: "本地保存失败：空间不足", spinning: false },
        { patch: { phase: "done", localPhase: "saved" }, label: "已同步", spinning: false },
    ] as const;
    try {
        for (const { patch, label, spinning } of cases) {
            await act(async () => {
                useSyncProgressStore.getState().setProjectProgress("status-stages", null);
                useSyncProgressStore.getState().setProjectProgress("status-stages", patch);
                root.render(<CanvasSyncStatus projectId="status-stages" />);
            });
            const markup = host.innerHTML;
            expect(markup).toContain(`aria-label="${label}"`);
            expect(markup.includes("animate-spin")).toBe(spinning);
        }
    } finally {
        await act(async () => root.unmount());
        useSyncProgressStore.getState().setProjectProgress("status-stages", null);
        await dom.happyDOM.abort();
        for (const [key, descriptor] of originals) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else Reflect.deleteProperty(globalThis, key);
        }
    }
});
