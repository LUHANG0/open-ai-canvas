import { describe, expect, test } from "bun:test";
import { syncCanvasLiveProjectRefs } from "../src/pages/canvas/use-canvas-live-project";
import type { CanvasAssistantSession, CanvasConnection, CanvasNodeData, ViewportTransform } from "../src/types/canvas";

describe("画布实时项目状态桥接", () => {
    test("一次提交同步节点、连线、会话、选择与视口引用", () => {
        const refs = {
            nodesRef: { current: [] as CanvasNodeData[] },
            connectionsRef: { current: [] as CanvasConnection[] },
            chatSessionsRef: { current: [] as CanvasAssistantSession[] },
            activeChatIdRef: { current: null as string | null },
            selectedNodeIdsRef: { current: new Set<string>() },
            viewportRef: { current: { x: 0, y: 0, k: 1 } as ViewportTransform },
        };
        const snapshot = {
            nodes: [{ id: "node-1" }] as CanvasNodeData[],
            connections: [{ id: "edge-1" }] as CanvasConnection[],
            chatSessions: [{ id: "chat-1" }] as CanvasAssistantSession[],
            activeChatId: "chat-1",
            selectedNodeIds: new Set(["node-1"]),
            viewport: { x: 120, y: 80, k: 0.8 },
        };

        syncCanvasLiveProjectRefs(refs, snapshot);

        expect(refs.nodesRef.current).toBe(snapshot.nodes);
        expect(refs.connectionsRef.current).toBe(snapshot.connections);
        expect(refs.chatSessionsRef.current).toBe(snapshot.chatSessions);
        expect(refs.activeChatIdRef.current).toBe("chat-1");
        expect(refs.selectedNodeIdsRef.current).toBe(snapshot.selectedNodeIds);
        expect(refs.viewportRef.current).toBe(snapshot.viewport);
    });

    test("页面入口不再直接注册实时生成项目", async () => {
        const source = await Bun.file(new URL("../src/pages/canvas/project.tsx", import.meta.url)).text();
        expect(source).toContain("useCanvasLiveProject({");
        expect(source).not.toContain("registerCanvasGenerationLiveProject({");
        expect(source).not.toContain("createCanvasGenerationLiveProjectAdapter({");
    });
});
