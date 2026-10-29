import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLTextAreaElement: dom.HTMLTextAreaElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasResourceMentionTextarea } = await import("../src/components/canvas/canvas-resource-mention-textarea");
const { getEditableSelection, setEditableSelection, serializeEditableValue } = await import("../src/components/canvas/canvas-mention-editable");
import type { CanvasResourceReference } from "../src/lib/canvas/canvas-resource-references";

afterAll(() => {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

const reference: CanvasResourceReference = { id: "async-skill", nodeId: "", kind: "skill", label: "分镜", title: "分镜", active: true };
const draft = Array.from({ length: 40 }, (_, i) => `第${i + 1}段：粘贴后继续编辑长文本。`).join("\n");

async function withEditor(run: (render: (references: CanvasResourceReference[], value?: string, disabled?: boolean) => Promise<void>, host: HTMLDivElement) => Promise<void>) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const render = async (references: CanvasResourceReference[], value = draft, disabled = false) => {
        await act(async () => root.render(<CanvasResourceMentionTextarea aria-label="创作输入" value={value} references={references} disabled={disabled} onChange={() => {}} />));
    };
    try { await run(render, host); }
    finally { await act(async () => root.unmount()); host.remove(); }
}

test("async skills preserve focused long draft, selection and scroll through both editor modes", async () => {
    await withEditor(async (render, host) => {
        await render([]);
        const plain = host.querySelector("textarea")!;
        plain.focus(); plain.setSelectionRange(28, 66); plain.scrollTop = 220;
        await render([reference]);
        const rich = host.querySelector<HTMLDivElement>('[role="textbox"]')!;
        expect(document.activeElement === rich).toBe(true);
        expect(serializeEditableValue(rich)).toBe(draft);
        expect(getEditableSelection(rich)).toEqual({ start: 28, end: 66 });
        expect(rich.scrollTop).toBe(220);
        setEditableSelection(rich, 77, 92); rich.scrollTop = 310;
        await render([]);
        const next = host.querySelector("textarea")!;
        expect(document.activeElement === next).toBe(true);
        expect([next.selectionStart, next.selectionEnd]).toEqual([77, 92]);
        expect(next.scrollTop).toBe(310);
        expect(next.value).toBe(draft);
    });
});

test("empty first focus and concurrent text updates keep their insertion point", async () => {
    await withEditor(async (render, host) => {
        await render([], "");
        host.querySelector("textarea")!.focus();
        await render([reference], "");
        const rich = host.querySelector<HTMLDivElement>('[role="textbox"]')!;
        expect(document.activeElement === rich).toBe(true);
        expect(getEditableSelection(rich)).toEqual({ start: 0, end: 0 });
        await render([], draft);
        const plain = host.querySelector("textarea")!;
        plain.setSelectionRange(28, 66);
        await render([reference], `前缀${draft}`);
        const updated = host.querySelector<HTMLDivElement>('[role="textbox"]')!;
        expect(document.activeElement === updated).toBe(true);
        expect(getEditableSelection(updated)).toEqual({ start: 30, end: 68 });
        expect(serializeEditableValue(updated)).toBe(`前缀${draft}`);
    });
});

test("reference hydration never takes focus from another control or focuses disabled input", async () => {
    await withEditor(async (render, host) => {
        await render([]);
        host.querySelector("textarea")!.focus();
        const other = document.createElement("button"); host.append(other); other.focus();
        await render([reference]);
        expect(document.activeElement === other).toBe(true);
        await render([]);
        host.querySelector("textarea")!.focus();
        await render([reference], draft, true);
        expect(document.activeElement === host.querySelector('[role="textbox"]')).toBe(false);
        other.remove();
    });
});

test("Chinese composition finishes in the original control before skills change the editor mode", async () => {
    await withEditor(async (render, host) => {
        await render([]);
        const plain = host.querySelector("textarea")!;
        plain.focus();
        await act(async () => plain.dispatchEvent(new dom.CompositionEvent("compositionstart", { bubbles: true })));
        await render([reference]);
        expect(host.querySelector("textarea") === plain).toBe(true);
        expect(document.activeElement === plain).toBe(true);
        await act(async () => plain.dispatchEvent(new dom.CompositionEvent("compositionend", { bubbles: true, data: "中文" })));
        const rich = host.querySelector<HTMLDivElement>('[role="textbox"]')!;
        expect(document.activeElement === rich).toBe(true);
        await act(async () => rich.dispatchEvent(new dom.CompositionEvent("compositionstart", { bubbles: true })));
        await render([]);
        expect(host.querySelector('[role="textbox"]') === rich).toBe(true);
        await act(async () => rich.dispatchEvent(new dom.CompositionEvent("compositionend", { bubbles: true, data: "中文" })));
        expect(document.activeElement === host.querySelector("textarea")).toBe(true);
    });
});
