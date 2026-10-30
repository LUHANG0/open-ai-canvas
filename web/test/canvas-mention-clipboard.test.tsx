import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({
    window: dom,
    document: dom.document,
    navigator: dom.navigator,
    HTMLElement: dom.HTMLElement,
    HTMLTextAreaElement: dom.HTMLTextAreaElement,
    Element: dom.Element,
    Node: dom.Node,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom),
    cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CanvasResourceMentionTextarea } = await import("../src/components/canvas/canvas-resource-mention-textarea");
const { setEditableSelection, serializeEditableValue } = await import("../src/components/canvas/canvas-mention-editable");
import type { CanvasResourceReference } from "../src/lib/canvas/canvas-resource-references";

afterAll(() => {
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

const reference: CanvasResourceReference = { id: "image", nodeId: "", assetId: "asset-image", kind: "image", label: "参考图1", title: "图片", active: true };
const token = "@[asset:asset-image]";
const value = `前文 ${token} 后文\n第二行`;

async function withEditor(run: (editor: HTMLElement, changed: string[]) => Promise<void>, readOnly = false, references = [reference]) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const changed: string[] = [];
    try {
        await act(async () =>
            root.render(
                <CanvasResourceMentionTextarea
                    aria-label="引用输入"
                    value={value}
                    references={references}
                    readOnly={readOnly}
                    onChange={(next) => {
                        changed.push(next);
                    }}
                />,
            ),
        );
        await run(host.querySelector<HTMLElement>("[role=textbox], textarea")!, changed);
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
}

async function clipboard(editor: HTMLElement, type: "copy" | "cut") {
    const data = new dom.DataTransfer();
    const event = new dom.ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data });
    await act(async () => {
        editor.dispatchEvent(event);
    });
    return { data, event };
}

test("copy retains reference tokens, adjacent text and line breaks without editing the prompt", async () => {
    await withEditor(async (editor, changed) => {
        editor.focus();
        setEditableSelection(editor, 0, value.length);
        const { data, event } = await clipboard(editor, "copy");
        expect(event.defaultPrevented).toBe(true);
        expect(data.getData("text/plain")).toBe(value);
        expect(serializeEditableValue(editor)).toBe(value);
        expect(changed).toEqual([]);
    });
});

test("copying part of a reference label preserves its complete token", async () => {
    await withEditor(async (editor, changed) => {
        const chip = editor.querySelector<HTMLElement>("[data-mention-token]")!;
        const label = document.createTreeWalker(chip, dom.NodeFilter.SHOW_TEXT).nextNode()!;
        const range = document.createRange();
        range.setStart(label, 0);
        range.setEnd(label, 1);
        window.getSelection()!.removeAllRanges();
        window.getSelection()!.addRange(range);
        const { data, event } = await clipboard(editor, "copy");
        expect(event.defaultPrevented).toBe(true);
        expect(data.getData("text/plain")).toBe(token);
        expect(changed).toEqual([]);
    });
});

test("copying ordinary text within the rich editor excludes unselected references", async () => {
    await withEditor(async (editor, changed) => {
        setEditableSelection(editor, 0, 2);
        const { data } = await clipboard(editor, "copy");
        expect(data.getData("text/plain")).toBe("前文");
        expect(changed).toEqual([]);
    });
});

test("cut writes the original reference token and removes only the selected token", async () => {
    await withEditor(async (editor, changed) => {
        editor.focus();
        setEditableSelection(editor, 3, 3 + token.length);
        const { data, event } = await clipboard(editor, "cut");
        expect(event.defaultPrevented).toBe(true);
        expect(data.getData("text/plain")).toBe(token);
        expect(changed).toEqual(["前文  后文\n第二行"]);
    });
});

test("read-only cut copies the reference but never modifies the prompt", async () => {
    await withEditor(async (editor, changed) => {
        setEditableSelection(editor, 0, value.length);
        const { data } = await clipboard(editor, "cut");
        expect(data.getData("text/plain")).toBe(value);
        expect(changed).toEqual([]);
    }, true);
});

test("collapsed or outside selection leaves native clipboard behavior untouched", async () => {
    await withEditor(async (editor, changed) => {
        setEditableSelection(editor, 3);
        expect((await clipboard(editor, "copy")).event.defaultPrevented).toBe(false);
        const outside = document.createTextNode("其他控件");
        document.body.append(outside);
        try {
            const range = document.createRange();
            range.selectNode(outside);
            window.getSelection()!.removeAllRanges();
            window.getSelection()!.addRange(range);
            expect((await clipboard(editor, "cut")).event.defaultPrevented).toBe(false);
            expect(changed).toEqual([]);
        } finally {
            outside.remove();
        }
    });
});

test("plain textarea keeps its native clipboard behavior", async () => {
    await withEditor(
        async (editor, changed) => {
            (editor as HTMLTextAreaElement).select();
            expect((await clipboard(editor, "copy")).event.defaultPrevented).toBe(false);
            expect(changed).toEqual([]);
        },
        false,
        [],
    );
});
