import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { CanvasCompletionFeedbackLedger } from "@/lib/canvas/canvas-completion-feedback";
import { commitCanvasGenerationResult } from "@/lib/canvas/canvas-generation-result";
import { stampCanvasNodeChanges } from "@/lib/canvas/canvas-node-timestamps";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM and page modules must load after this isolated browser environment.
const { act, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasCompletionFeedbackProvider, useCanvasCompletionFeedback } = await import("@/components/canvas/canvas-completion-feedback");
const { recoverCanvasGenerationTaskNode } = await import("@/pages/canvas/use-canvas-generation");
const { useCanvasStore } = await import("@/stores/canvas/use-canvas-store");
const localforage = (await import("localforage")).default;
localforage.getItem = async () => null;
localforage.setItem = async (_key, value) => value;
localforage.removeItem = async () => {};

afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});
const sample = (type = CanvasNodeType.Text): CanvasNodeData => ({ id: "n", title: "fixture", type, position: { x: 0, y: 0 }, width: 240, height: 160, metadata: { taskId: "task", status: "loading", content: "same answer" } });

for (const status of ["loading", "error"] as const) {
    test(`text ${status} to same-content applied success needs no media proof and survives timestamp normalization`, () => {
        const ledger = new CanvasCompletionFeedbackLedger();
        const before = { ...sample(), metadata: { ...sample().metadata, status } };
        ledger.observe([before], 0);
        const applied = commitCanvasGenerationResult([before], before, { ...before, metadata: { ...before.metadata, status: "success" } }, "task");
        const normalized = stampCanvasNodeChanges([before], applied);
        ledger.observe(normalized, 100);
        expect(ledger.get("n")?.startedAt).toBe(100);
        ledger.observe([{ ...normalized[0], metadata: { ...normalized[0].metadata, content: "user edits answer" } }], 500);
        expect(ledger.get("n")?.startedAt).toBe(100);
    });
}

test("real storyboard recovery producer completes rows without content, resultRecord or attach-node", async () => {
    const ledger = new CanvasCompletionFeedbackLedger();
    const before = sample(CanvasNodeType.Script);
    before.metadata = { taskId: "story-task", status: "loading", storyboard: { rows: [], visibleColumns: [] } };
    ledger.observe([before], 0);
    const nodesRef = { current: [before] };
    useCanvasStore.setState({ projects: [] });
    await recoverCanvasGenerationTaskNode({
        projectId: "local",
        node: before,
        completed: {
            id: "story-task",
            projectId: "local",
            type: "canvas_text",
            operation: "storyboard",
            status: "succeeded",
            prompt: "Local fixture",
            attempts: 1,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
            resultJson: JSON.stringify({ text: JSON.stringify({ title: "Shots", rows: [{ id: "shot-a", scene: "Room", description: "An empty room" }] }) }),
        },
        continuationOnly: false,
        nodesRef,
        setNodes: (update) => {
            nodesRef.current = typeof update === "function" ? update(nodesRef.current) : update;
        },
        applyGenerationTaskResult: async () => {
            throw new Error("storyboard must use its actual producer");
        },
        signal: new AbortController().signal,
    });
    expect(nodesRef.current[0].metadata?.status).toBe("success");
    expect(nodesRef.current[0].metadata?.storyboard?.rows[0].description).toBe("An empty room");
    ledger.observe(nodesRef.current, 100);
    expect(ledger.get("n")?.startedAt).toBe(100);
});

test("inactive hydration, StrictMode, rerender, LOD remount, expiry and account/project remount preserve the window", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const reactRoot = createRoot(host);
    const originalNow = performance.now;
    let now = 0;
    performance.now = () => now;
    let nodes = [sample()];
    let active = false;
    let mounted = true;
    let scope = "a:p";
    function Badge() {
        const completion = useCanvasCompletionFeedback("n");
        return completion ? <div data-completion style={{ animationDelay: `-${completion.elapsed}ms` }} /> : null;
    }
    const render = () =>
        act(async () =>
            reactRoot.render(
                <StrictMode>
                    <CanvasCompletionFeedbackProvider key={scope} nodes={nodes} active={active}>
                        {mounted ? <Badge /> : null}
                    </CanvasCompletionFeedbackProvider>
                </StrictMode>,
            ),
        );
    try {
        await render();
        active = true;
        await render();
        const before = nodes[0];
        now = 100;
        nodes = commitCanvasGenerationResult(nodes, before, { ...before, metadata: { ...before.metadata, status: "success" } }, "task");
        await render();
        const badge = host.querySelector<HTMLElement>("[data-completion]")!;
        expect(badge.style.animationDelay).toBe("-0ms");
        now = 600;
        await render();
        expect(host.querySelector("[data-completion]")).toBe(badge);
        expect(badge.style.animationDelay).toBe("-0ms");
        mounted = false;
        await render();
        now = 900;
        mounted = true;
        await render();
        expect(host.querySelector<HTMLElement>("[data-completion]")!.style.animationDelay).toBe("-800ms");
        mounted = false;
        await render();
        now = 2200;
        mounted = true;
        await render();
        expect(host.querySelector("[data-completion]")).toBeNull();
        scope = "b:p";
        await render();
        expect(host.querySelector("[data-completion]")).toBeNull();
        scope = "b:q";
        await render();
        expect(host.querySelector("[data-completion]")).toBeNull();
    } finally {
        await act(async () => reactRoot.unmount());
        performance.now = originalNow;
        host.remove();
    }
});
