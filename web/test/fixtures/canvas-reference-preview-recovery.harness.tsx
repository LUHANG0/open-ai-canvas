import { afterAll, expect, mock, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
import type { CanvasResourceReference } from "../../src/lib/canvas/canvas-resource-references";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
let resolveImage = (key?: string) => Promise.resolve(`/expired-${key}.png`);
const imageCalls: string[] = [];
const refreshCalls: { key: string; forceRefresh: boolean }[] = [];
mock.module("../../src/services/image-storage", () => ({ resolveImageUrl: (key: string) => { imageCalls.push(key); return resolveImage(key); } }));
mock.module("../../src/services/api/resources", () => ({
    resourceIdFromStorageKey: (key?: string) => key?.startsWith("resource:") ? key.slice(9) : "",
    getResourceAccess: async (key: string, _purpose: string, _variant: string, _name: string, options?: { forceRefresh?: boolean }) => {
        refreshCalls.push({ key, forceRefresh: Boolean(options?.forceRefresh) });
        return { url: `/fresh-${key}.png` };
    },
    resolveResourceAccessURL: (url: string) => url,
}));
mock.module("../../src/lib/canvas/canvas-drawing-storage", () => ({ loadCanvasDrawingPreview: async () => null }));
const { act, useEffect, useRef } = await import("react");
const { createRoot } = await import("react-dom/client");
const { useResolvedCanvasResourceReferences } = await import("../../src/components/canvas/use-resolved-canvas-resource-references");
const { createInlineMentionChip, syncInlineMentionPreviews } = await import("../../src/components/canvas/canvas-mention-chips");
const { setActiveUserScope } = await import("../../src/lib/user-scope");
const ref = (name: string) => ({ id: name, kind: "image", label: "角色参考", storageKey: `resource:${name}` }) as CanvasResourceReference;
function Fixture({ reference }: { reference: CanvasResourceReference }) {
    const resolved = useResolvedCanvasResourceReferences([reference]);
    const host = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!host.current) return;
        if (!host.current.firstChild) host.current.append(createInlineMentionChip(resolved[0], `@[image:${reference.id}]`));
        syncInlineMentionPreviews(host.current, resolved);
    }, [reference.id, resolved]);
    return <div ref={host} contentEditable suppressContentEditableWarning />;
}
async function mount(reference: CanvasResourceReference) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<Fixture reference={reference} />));
    return { host, render: async () => { await act(async () => root.render(<Fixture reference={reference} />)); }, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("expired inline thumbnails recover without replacing the mention token or editable DOM", async () => {
    setActiveUserScope("preview-recovery");
    const fixture = await mount(ref("recover"));
    try {
        const chip = fixture.host.querySelector<HTMLElement>("[data-mention-token]")!;
        const token = chip.dataset.mentionToken;
        const image = chip.querySelector("img")!;
        expect(image.getAttribute("src")).toBe("/expired-resource:recover.png");
        await act(async () => image.dispatchEvent(new dom.Event("error")));
        expect(fixture.host.querySelector("[data-mention-token]")).toBe(chip);
        expect(chip.dataset.mentionToken).toBe(token);
        expect(chip.querySelector("img")?.getAttribute("src")).toBe("/fresh-resource:recover.png");
        expect(refreshCalls.at(-1)).toEqual({ key: "resource:recover", forceRefresh: true });
        const count = refreshCalls.length;
        await act(async () => chip.querySelector("img")!.dispatchEvent(new dom.Event("error")));
        expect(chip.querySelector("img")).toBeNull();
        expect(refreshCalls.length).toBe(count);
    } finally { await fixture.close(); }
});

test("reopening a reference after cache expiry resolves its address again", async () => {
    setActiveUserScope("preview-expiry");
    const now = spyOn(Date, "now").mockReturnValue(1_000_000);
    const reference = ref("expires");
    try {
        const first = await mount(reference); await first.close();
        const count = imageCalls.filter((key) => key === reference.storageKey).length;
        now.mockReturnValue(1_061_000);
        const second = await mount(reference); await second.close();
        expect(imageCalls.filter((key) => key === reference.storageKey).length).toBe(count + 1);
    } finally { now.mockRestore(); }
});

test("account switches resolve independently and ignore the previous account's late response", async () => {
    const pending: ((url: string) => void)[] = [];
    resolveImage = () => new Promise<string>((resolve) => pending.push(resolve));
    setActiveUserScope("account-a");
    const fixture = await mount(ref("same-resource"));
    try {
        expect(pending.length).toBe(1);
        setActiveUserScope("account-b");
        await fixture.render();
        expect(pending.length).toBe(2);
        await act(async () => pending[1]("/account-b.png"));
        await act(async () => pending[0]("/account-a.png"));
        expect(fixture.host.querySelector("img")?.getAttribute("src")).toBe("/account-b.png");
    } finally { await fixture.close(); resolveImage = (key) => Promise.resolve(`/expired-${key}.png`); }
});

afterAll(async () => {
    mock.restore(); await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key);
});
