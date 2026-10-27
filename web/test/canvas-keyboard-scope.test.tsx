import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasNodeData } from "@/types/canvas";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useCanvasKeyboard } = await import("@/pages/canvas/use-canvas-keyboard");

afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(options: { focusMode?: boolean; selectedIds?: string[]; connectionId?: string | null } = {}) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const calls = {
        setSelectedNodeIds: mock(() => {}), setSelectedConnectionId: mock(() => {}), setContextMenu: mock(() => {}),
        setShortcutRequestNonce: mock(() => {}), setInfoNodeId: mock(() => {}), setCropNodeId: mock(() => {}),
        setMaskEditNodeId: mock(() => {}), setAnnotationNodeId: mock(() => {}), saveCanvasProject: mock(() => {}),
        zoomToActualSize: mock(() => {}), fitCanvasContent: mock(() => {}), fitCanvasSelection: mock(() => {}),
        undoCanvas: mock(() => {}), redoCanvas: mock(() => {}), cancelSelectionBox: mock(() => {}),
        copySelectedNodes: mock(() => {}), pasteCopiedNodes: mock(() => true), restoreCopiedNodesFromText: mock(() => false),
        shouldPreferCopiedNodes: mock(() => true), pasteSystemClipboard: mock(() => true), deleteNodes: mock(() => {}),
        deleteConnection: mock(() => {}), deselectCanvas: mock(() => {}), zoomCanvasIn: mock(() => {}),
        zoomCanvasOut: mock(() => {}), exitFocusMode: mock(() => {}), toggleFocusMode: mock(() => {}),
        onOpenSearch: mock(() => {}), beginBatchConnection: mock(() => {}),
    };
    function Harness() {
        useCanvasKeyboard({ ...calls, nodesRef: { current: [{ id: "note" }] as CanvasNodeData[] }, selectedNodeIdsRef: { current: new Set(options.selectedIds ?? ["note"]) }, selectedConnectionId: options.connectionId ?? null, focusMode: options.focusMode ?? false });
        return <div tabIndex={0} data-testid="canvas" />;
    }
    await act(async () => { root.render(<Harness />); });
    const canvas = host.firstElementChild as HTMLElement;
    const key = (target: Element, value: string, ctrlKey = false, shiftKey = false, options: { metaKey?: boolean; code?: string; altKey?: boolean; repeat?: boolean } = {}) => {
        const event = new dom.KeyboardEvent("keydown", { key: value, ctrlKey, shiftKey, bubbles: true, cancelable: true, ...options });
        target.dispatchEvent(event as unknown as Event);
        return event;
    };
    const paste = (target: Element) => {
        const data = new dom.DataTransfer(); data.setData("text/plain", "copied nodes");
        const event = new dom.ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data });
        target.dispatchEvent(event as unknown as Event);
        return event;
    };
    const add = (html: string) => { const wrapper = document.createElement("div"); wrapper.innerHTML = html; host.append(wrapper); return wrapper.firstElementChild as HTMLElement; };
    const cleanup = async () => { await act(async () => { root.unmount(); }); host.remove(); };
    return { calls, canvas, key, paste, add, cleanup };
}

const blockedKeys: [string, boolean, boolean?][] = [["Delete", false], ["Backspace", false], ["z", true], ["z", true, true], ["y", true], ["a", true], ["c", true], ["v", true], ["+", true], ["=", true], ["-", true], ["_", true], ["0", true], ["1", true], ["2", true], ["3", true], ["?", false], ["Escape", false]];
const backgroundCalls = ["deleteNodes", "deleteConnection", "undoCanvas", "redoCanvas", "setSelectedNodeIds", "copySelectedNodes", "pasteCopiedNodes", "restoreCopiedNodesFromText", "shouldPreferCopiedNodes", "pasteSystemClipboard", "zoomCanvasIn", "zoomCanvasOut", "zoomToActualSize", "fitCanvasContent", "fitCanvasSelection", "deselectCanvas", "setShortcutRequestNonce", "setInfoNodeId", "setCropNodeId", "setMaskEditNodeId", "setAnnotationNodeId", "exitFocusMode", "onOpenSearch", "toggleFocusMode"] as const;

for (const markup of ['<div class="ant-modal-wrap"><button>Close</button></div>', '<div role="dialog"><button>Close</button></div>', '<div class="ant-dropdown"><button>Menu</button></div>', '<div role="alertdialog"><button>Close</button></div>', '<div class="ant-select-dropdown"><button>Option</button></div>', '<div class="ant-popover"><button>Close</button></div>', '<div data-canvas-context-menu><button>Menu</button></div>']) {
    test(`visible overlay isolates the actual keyboard and capture paste hook: ${markup}`, async () => {
        const f = await fixture();
        try {
            const overlay = f.add(markup);
            const close = overlay.querySelector("button")!; close.focus();
            for (const [key, ctrl, shift] of blockedKeys) f.key(close, key, ctrl, shift);
            for (const code of ["NumpadAdd", "NumpadSubtract", "Numpad0"]) {
                expect(f.key(close, "Unidentified", false, false, { code, metaKey: true }).defaultPrevented).toBe(false);
            }
            expect(f.key(close, "s", true).defaultPrevented).toBe(false);
            expect(f.key(close, "f", true).defaultPrevented).toBe(false);
            expect(f.calls.saveCanvasProject).not.toHaveBeenCalled();
            expect(f.paste(close).defaultPrevented).toBe(false);
            // An open overlay owns the scope even if focus is still on the canvas.
            f.key(f.canvas, "Delete"); f.key(f.canvas, "=", true); f.paste(f.canvas);
            for (const name of backgroundCalls) expect(f.calls[name]).not.toHaveBeenCalled();
            let escaped = false;
            overlay.addEventListener("keydown", event => { if ((event as KeyboardEvent).key === "Escape") { escaped = true; overlay.remove(); } });
            f.key(close, "Escape");
            expect(escaped).toBe(true);
            expect(f.calls.deselectCanvas).not.toHaveBeenCalled();
            f.key(f.canvas, "Delete");
            expect(f.calls.deleteNodes).toHaveBeenCalledWith(new Set(["note"]));
        } finally { await f.cleanup(); }
    });
}

test("retained hidden overlays do not block normal canvas shortcuts or paste", async () => {
    const f = await fixture();
    try {
        f.add('<div hidden><div role="dialog"></div></div>');
        f.add('<div style="display:none"><div class="ant-modal-wrap"></div></div>');
        f.add('<div aria-hidden="true"><div role="menu"></div></div>');
        f.add('<div class="ant-dropdown ant-dropdown-hidden"></div>');
        f.add('<div style="visibility:hidden"><div class="ant-popover"></div></div>');
        f.add('<div inert><div role="dialog"></div></div>');
        f.add('<div style="content-visibility:hidden"><div role="dialog"></div></div>');
        f.add('<div class="ant-select-dropdown ant-select-dropdown-hidden"></div>');
        f.add('<div class="ant-popover ant-popover-hidden"></div>');
        f.add('<div style="opacity:0"><div role="dialog"></div></div>');
        f.add('<dialog role="dialog"></dialog>');
        f.key(f.canvas, "Delete"); f.key(f.canvas, "z", true); f.key(f.canvas, "z", true, true);
        f.key(f.canvas, "a", true); f.key(f.canvas, "c", true); f.key(f.canvas, "v", true);
        expect(f.key(f.canvas, "=", true).defaultPrevented).toBe(true);
        f.key(f.canvas, "2", true); f.key(f.canvas, "Escape");
        expect(f.paste(f.canvas).defaultPrevented).toBe(true);
        expect(f.calls.deleteNodes).toHaveBeenCalledTimes(1); expect(f.calls.undoCanvas).toHaveBeenCalledTimes(1);
        expect(f.calls.redoCanvas).toHaveBeenCalledTimes(1); expect(f.calls.setSelectedNodeIds).toHaveBeenCalledTimes(1);
        expect(f.calls.copySelectedNodes).toHaveBeenCalledTimes(1); expect(f.calls.pasteCopiedNodes).toHaveBeenCalledTimes(2);
        expect(f.calls.zoomCanvasIn).toHaveBeenCalledTimes(1); expect(f.calls.fitCanvasContent).toHaveBeenCalledTimes(1);
        expect(f.calls.deselectCanvas).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
});

for (const markup of ['<input />', '<textarea></textarea>', '<select><option>One</option></select>', '<div contenteditable=""><span>Editing</span></div>', '<div contenteditable="plaintext-only"><span>Editing</span></div>', '<div data-canvas-no-zoom><button>Toolbar</button></div>', '<button>Control</button>', '<a href="#">Link</a>', '<div class="canvas-node-toolbar"><button>Node tool</button></div>', '<div class="canvas-node-toolbar-menu"><button>Node menu</button></div>']) {
    test(`text and control scope preserves native keys and local actions: ${markup}`, async () => {
        const f = await fixture();
        try {
            const scope = f.add(markup); const target = scope.querySelector("span,button") ?? scope;
            let localKeys = 0;
            target.addEventListener("keydown", () => { localKeys += 1; });
            for (const [key, ctrl, shift] of blockedKeys) f.key(target, key, ctrl, shift);
            expect(localKeys).toBe(blockedKeys.length);
            expect(f.paste(target).defaultPrevented).toBe(false);
            for (const name of backgroundCalls) expect(f.calls[name]).not.toHaveBeenCalled();
            const native = f.key(target, "z", true); expect(native.defaultPrevented).toBe(false);
            let clicked = false; target.addEventListener("click", () => { clicked = true; });
            (target as HTMLElement).click(); expect(clicked).toBe(true);
            // Canvas-wide save remains available while typing (node toolbars retain their own scope).
            if (!scope.matches(".canvas-node-toolbar, .canvas-node-toolbar-menu")) {
                expect(f.key(target, "s", true).defaultPrevented).toBe(true);
                expect(f.calls.saveCanvasProject).toHaveBeenCalledWith({ requireRemote: false });
                expect(f.key(target, "=", true).defaultPrevented).toBe(true);
            }
        } finally { await f.cleanup(); }
    });
}

test("normal canvas keeps all zoom, history, selection, save and search commands", async () => {
    const f = await fixture();
    try {
        for (const key of ["+", "=", "-", "_", "0", "1", "2", "3"]) {
            expect(f.key(f.canvas, key, true).defaultPrevented).toBe(true);
        }
        f.key(f.canvas, "y", true); f.key(f.canvas, "a", true);
        f.key(f.canvas, "s", true); f.key(f.canvas, "f", true); f.key(f.canvas, "f", true, true);
        expect(f.calls.zoomCanvasIn).toHaveBeenCalledTimes(2);
        expect(f.calls.zoomCanvasOut).toHaveBeenCalledTimes(2);
        expect(f.calls.zoomToActualSize).toHaveBeenCalledTimes(2);
        expect(f.calls.fitCanvasContent).toHaveBeenCalledTimes(1);
        expect(f.calls.fitCanvasSelection).toHaveBeenCalledTimes(1);
        expect(f.calls.redoCanvas).toHaveBeenCalledTimes(1);
        expect(f.calls.setSelectedNodeIds).toHaveBeenCalledWith(new Set(["note"]));
        expect(f.calls.setSelectedConnectionId).toHaveBeenCalledWith(null);
        expect(f.calls.cancelSelectionBox).toHaveBeenCalledTimes(1);
        expect(f.calls.saveCanvasProject).toHaveBeenCalledWith({ requireRemote: false });
        expect(f.calls.onOpenSearch).toHaveBeenCalledTimes(1);
        expect(f.calls.toggleFocusMode).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
});

test("canvas copy leaves an actual browser text selection alone", async () => {
    const f = await fixture();
    try {
        const text = f.add('<p>Selected text</p>');
        const range = document.createRange(); range.selectNodeContents(text);
        window.getSelection()!.addRange(range);
        expect(f.key(f.canvas, "c", true).defaultPrevented).toBe(false);
        expect(f.calls.copySelectedNodes).not.toHaveBeenCalled();
    } finally { window.getSelection()!.removeAllRanges(); await f.cleanup(); }
});

test("canvas paste captures system clipboard only in canvas scope", async () => {
    const f = await fixture();
    try {
        f.calls.shouldPreferCopiedNodes.mockImplementation(() => false);
        expect(f.paste(f.canvas).defaultPrevented).toBe(true);
        expect(f.calls.restoreCopiedNodesFromText).toHaveBeenCalledWith("copied nodes");
        expect(f.calls.pasteSystemClipboard).toHaveBeenCalledTimes(1);
        expect(f.calls.pasteCopiedNodes).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});

test("Escape preserves focus mode and selection until the visible overlay closes", async () => {
    const f = await fixture({ focusMode: true, selectedIds: [] });
    try {
        const overlay = f.add('<div role="dialog"><button>Close</button></div>');
        f.key(f.canvas, "Escape");
        expect(f.calls.exitFocusMode).not.toHaveBeenCalled();
        expect(f.calls.deselectCanvas).not.toHaveBeenCalled();
        overlay.remove();
        f.key(f.canvas, "Escape");
        expect(f.calls.exitFocusMode).toHaveBeenCalledTimes(1);
        expect(f.calls.deselectCanvas).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});

test("connection deletion stays isolated while a modal is visible", async () => {
    const f = await fixture({ selectedIds: [], connectionId: "connection" });
    try {
        const overlay = f.add('<div role="dialog"></div>');
        f.key(f.canvas, "Backspace");
        expect(f.calls.deleteConnection).not.toHaveBeenCalled();
        overlay.hidden = true;
        f.key(f.canvas, "Backspace");
        expect(f.calls.deleteConnection).toHaveBeenCalledWith("connection");
    } finally { await f.cleanup(); }
});

test("numpad and Meta zoom use canvas commands without browser page zoom", async () => {
    const f = await fixture();
    try {
        for (const code of ["NumpadAdd", "NumpadSubtract", "Numpad0"]) {
            expect(f.key(f.canvas, "Unidentified", false, false, { code, metaKey: true }).defaultPrevented).toBe(true);
        }
        expect(f.calls.zoomCanvasIn).toHaveBeenCalledTimes(1);
        expect(f.calls.zoomCanvasOut).toHaveBeenCalledTimes(1);
        expect(f.calls.zoomToActualSize).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
});

test("save prevents browser save but does not repeat, and controls retain native find", async () => {
    const f = await fixture();
    try {
        const input = f.add('<input />');
        expect(f.key(input, "s", false, false, { metaKey: true }).defaultPrevented).toBe(true);
        expect(f.key(input, "s", false, false, { metaKey: true, repeat: true }).defaultPrevented).toBe(true);
        expect(f.calls.saveCanvasProject).toHaveBeenCalledTimes(1);
        expect(f.key(input, "f", true).defaultPrevented).toBe(false);
        expect(f.calls.onOpenSearch).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});
