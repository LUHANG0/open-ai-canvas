import { mock } from "bun:test";
import { Window } from "happy-dom";

self.onmessage = async () => {
    const dom = new Window({ url: "http://localhost/" });
    let root: import("react-dom/client").Root | undefined;
    try {
        for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
            Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
        }
        let scope = "account-a";
        const loads: { src: string; resolve: (image: HTMLImageElement) => void; reject: (error: Error) => void }[] = [];
        const accesses: unknown[][] = [];
        mock.module("../../src/lib/user-scope", () => ({ getActiveUserScope: () => scope }));
        mock.module("../../src/services/canvas-image-loader", () => ({ prepareCanvasImage: (src: string) => {
            const { promise, resolve, reject } = Promise.withResolvers<HTMLImageElement>();
            loads.push({ src, resolve, reject });
            return promise;
        } }));
        mock.module("../../src/services/api/resources", () => ({
            resourceIdFromStorageKey: (key?: string) => key?.startsWith("resource:") ? key.slice(9) : "",
            resolveResourceAccessURL: (url: string) => url,
            getResourceAccess: async (...args: unknown[]) => { accesses.push(args); return { url: `/fresh-${accesses.length}.png`, originalWidth: 2448, originalHeight: 3264 }; },
        }));
        const { act } = await import("react");
        const { createRoot } = await import("react-dom/client");
        const { RetainedCanvasImage } = await import("../../src/components/canvas/canvas-retained-image");
        const { canvasThemes } = await import("../../src/lib/canvas-theme");
        const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
        let leaked = 0;
        const fitSizes: number[] = [];
        const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };
        const text = () => host.textContent || "";
        const image = () => host.querySelector("img")!;
        const render = async (id: string, src: string, sourceError = false, width = 2448) => act(async () => root!.render(
            <div onClick={() => leaked++} onPointerDown={() => leaked++} onWheel={() => leaked++} onKeyDown={() => leaked++}>
                <RetainedCanvasImage identity={`${scope}:${id}`} retentionKey={`${scope}:node-1`} src={src} storageKey="resource:fixture" sourceError={sourceError} originalSize={{ width, height: 3264 }} bytes={9937640} completed fitToImage={(img) => fitSizes.push(img.naturalWidth)} className="test-image" loading={false} theme={canvasThemes.dark} />
            </div>,
        ));
        const resolveLast = async () => act(async () => loads.at(-1)!.resolve({ naturalWidth: 2448, naturalHeight: 3264 } as HTMLImageElement));
        await render("a", "/original-a.png");
        assert(text().includes("生成完成，原图加载中") && text().includes("2448 × 3264") && !text().includes("%"), "missing truthful loading state and dimensions");
        assert(image().style.visibility === "hidden", "unprepared original became visible");
        await resolveLast();
        assert(image().getAttribute("src") === "/original-a.png" && !host.querySelector('[role="status"]'), "decoded original did not replace loading state");
        await render("b", "/original-b.png");
        assert(image().getAttribute("src") === "/original-a.png" && text().includes("保留已有预览"), "previous node preview disappeared during replacement");
        await act(async () => loads.at(-1)!.reject(new Error("expired address")));
        assert(loads.at(-1)!.src === "/fresh-1.png", "failed address was not refreshed");
        await act(async () => loads.at(-1)!.reject(new Error("offline")));
        assert(text().includes("原图加载失败") && image().getAttribute("src") === "/original-a.png", "failure discarded existing decoded preview");
        const retryButton = host.querySelector("button")!;
        await act(async () => {
            retryButton.dispatchEvent(new dom.Event("pointerdown", { bubbles: true }));
            retryButton.dispatchEvent(new dom.Event("wheel", { bubbles: true }));
            retryButton.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
            retryButton.click();
        });
        assert(leaked === 0, "retry interaction leaked into canvas gestures");
        assert(loads.at(-1)!.src === "/fresh-2.png" && (accesses.at(-1)![4] as { forceRefresh: boolean }).forceRefresh === true && accesses.at(-1)![2] === "original", "retry did not request a fresh original");
        await resolveLast();
        assert(image().getAttribute("src") === "/fresh-2.png" && !host.querySelector("button"), "retry did not recover image");
        const loadedCount = loads.length;
        await render("b", "/original-b.png", false, 4096);
        assert(loads.length === loadedCount, "persisting decoded dimensions reloaded an already prepared original");
        const accessCount = accesses.length;
        await render("c", "/original-c.png");
        const stale = loads.at(-1)!;
        assert(stale.src === "/original-c.png" && accesses.length === accessCount, "retry state leaked into next generation result");
        scope = "account-b";
        await render("d", "/original-d.png");
        assert(image().style.visibility === "hidden" && !image().getAttribute("src"), "previous account image leaked through retention");
        await act(async () => stale.resolve({ naturalWidth: 17, naturalHeight: 19 } as HTMLImageElement));
        assert(!fitSizes.includes(17) && image().style.visibility === "hidden", "late result crossed account/source boundary");
        await resolveLast();
        assert(image().getAttribute("src") === "/original-d.png", "current account original did not load");
        await render("access-failed", "", true);
        assert(text().includes("原图加载失败"), "failed access request became an endless waiting state");
        await act(async () => host.querySelector<HTMLButtonElement>("button")!.click());
        assert(loads.at(-1)!.src === "/fresh-3.png", "missing URL could not be retried");
        await resolveLast();
        assert(image().getAttribute("src") === "/fresh-3.png" && !host.querySelector("button"), "access failure retry failed");
        self.postMessage({ loading: true, retained: true, retried: true, isolated: true, lateIgnored: true, accessRetried: true, sourceRetryReset: true, eventsContained: true });
        await act(async () => root!.unmount()); root = undefined;
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.stack : String(error) });
    } finally {
        mock.restore();
        dom.happyDOM.abort();
    }
};
