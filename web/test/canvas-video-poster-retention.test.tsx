import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const pending = new Map<string, { resolve: () => void; reject: () => void }>();
mock.module("../src/services/canvas-image-loader", () => ({ prepareCanvasImage: (src: string) => new Promise<void>((resolve, reject) => pending.set(src, { resolve, reject: () => reject(new Error("image unavailable")) })) }));
mock.module("../src/services/image-storage", () => ({ resolveImageUrl: async (_key: string, src: string) => src }));
mock.module("../src/services/api/resources", () => ({ resourceIdFromStorageKey: () => null, getResourceAccess: async () => ({ url: "" }), resolveResourceAccessURL: (url: string) => url }));
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { CachedResourceImage } = await import("../src/components/cached-resource-image");
const { setActiveUserScope } = await import("../src/lib/user-scope");
afterAll(() => {
    setActiveUserScope(null);
    for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key);
    dom.happyDOM.abort();
});

test("poster upgrade keeps the decoded old image until replacement is ready and respects media/account identity", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    setActiveUserScope("poster-user");
    const render = async (src: string, key = "node:video") => {
        await act(async () => root.render(<CachedResourceImage src={src} retentionKey={key} alt="poster" />));
    };
    try {
        await render("/small.jpg");
        await act(async () => pending.get("/small.jpg")!.resolve());
        const image = host.querySelector("img")!;
        expect(image.getAttribute("src")).toBe("/small.jpg");
        await render("/hd.jpg");
        expect(host.querySelector("img")).toBe(image);
        expect(image.getAttribute("src")).toBe("/small.jpg");
        await act(async () => pending.get("/hd.jpg")!.resolve());
        expect(image.getAttribute("src")).toBe("/hd.jpg");
        await render("/unavailable.jpg");
        await act(async () => pending.get("/unavailable.jpg")!.reject());
        expect(image.getAttribute("src")).toBe("/hd.jpg");
        await render("/other.jpg", "node:other-video");
        expect(image.getAttribute("src")).toBeNull();
        await act(async () => pending.get("/other.jpg")!.resolve());
        expect(image.getAttribute("src")).toBe("/other.jpg");
        setActiveUserScope("other-account");
        await render("/other-account.jpg", "node:other-video");
        expect(image.getAttribute("src")).toBeNull();
    } finally {
        await act(async () => root.unmount());
        host.remove();
    }
});
