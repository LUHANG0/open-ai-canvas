import { describe, expect, test } from "bun:test";

const readSource = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

describe("PC 画布 Agent 侧栏生命周期", () => {
    test("网站模式首开不会同步拉取本机 Agent，切换后才按需加载并保留状态", async () => {
        const source = await readSource("../src/components/canvas/canvas-assistant-panel.tsx");

        expect(source).not.toContain('import { CanvasLocalAgentPanel } from "./canvas-local-agent-panel"');
        expect(source).toContain('import("./canvas-local-agent-panel").then((module) => ({ default: module.CanvasLocalAgentPanel }))');
        expect(source).toContain("const CanvasLocalAgentPanel = lazy(loadCanvasLocalAgentPanel)");
        expect(source).toContain('const [localAgentMounted, setLocalAgentMounted] = useState(agentMode === "local")');
        expect(source).toContain('if (agentMode === "local") setLocalAgentMounted(true)');
        expect(source).toContain("{localAgentMounted ? (");
        expect(source).toContain("<Suspense");
        expect(source).toContain('autoConnect={autoConnectLocal && agentMode === "local"}');
        expect(source).toContain('data-canvas-agent-mode="online"');
        expect(source).toContain('data-canvas-agent-mode="local"');
    });

    test("收起或卸载时会终止宽度拖拽，并恢复拖拽前的页面样式", async () => {
        const source = await readSource("../src/pages/canvas/canvas-assistant-panel-column.tsx");

        expect(source).toContain("const resizeCleanupRef = useRef<(() => void) | null>(null)");
        expect(source).toContain("if (closing) {");
        expect(source).toContain("resizeCleanupRef.current?.()");
        expect(source).toContain("const previousCursor = document.body.style.cursor");
        expect(source).toContain("const previousUserSelect = document.body.style.userSelect");
        expect(source).toContain("document.body.style.cursor = previousCursor");
        expect(source).toContain("document.body.style.userSelect = previousUserSelect");
        expect(source).toContain('document.removeEventListener("mousemove", move)');
        expect(source).toContain('document.removeEventListener("mouseup", stop)');
    });

    test("首次挂载、收起保活、聚焦模式和空白点击的既有路由保持不变", async () => {
        const [visibility, workspace, focus] = await Promise.all([
            readSource("../src/pages/canvas/use-canvas-assistant-visibility.ts"),
            readSource("../src/pages/canvas/use-canvas-workspace-shell.ts"),
            readSource("../src/pages/canvas/use-canvas-node-focus.ts"),
        ]);

        expect(visibility).toContain("setAssistantMounted(true)");
        expect(visibility).toContain("setAssistantOpen(false)");
        expect(visibility).not.toContain("setAssistantMounted(false)");
        expect(workspace).toContain('if (action === "set-local-mode") setAgentMode("local")');
        expect(workspace).toContain('if (action === "open-local-agent") openAgent("local")');
        expect(workspace).toContain("if (!enteredFocus) return");
        expect(focus).toContain("applyCanvasBlankClick(handleCanvasDeselect, closeAgent)");
    });
});
