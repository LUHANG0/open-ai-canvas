import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
const { act } = await import("react"); const { createRoot } = await import("react-dom/client");
const { CanvasImageSettingsPopover } = await import("../src/components/canvas/canvas-image-settings-popover");
const { CanvasVideoSettingsPopover } = await import("../src/components/canvas/canvas-video-settings-popover");
const { createModelChannel, defaultConfig, encodeChannelModel } = await import("../src/stores/use-config-store");
const { defaultModelCapabilityConfig, defaultImageCapabilityConfig } = await import("../src/lib/model-capabilities");
const { projectImageParameters } = await import("../src/lib/image-parameters");
import type { ImageParameter } from "../src/lib/image-parameters";
import type { AiConfig } from "../src/stores/use-config-store";
const settle = () => new Promise((resolve) => setTimeout(resolve, 80));
function fixture(mode: "image" | "video", dynamic = false) {
    const model = mode === "image" ? "gpt-image-1" : "fixture-video", protocol = mode === "image" ? "openai-image" : "openai-video";
    const profile = defaultModelCapabilityConfig(protocol, model);
    if (dynamic) profile.image = projectImageParameters(defaultImageCapabilityConfig(), [
        { name: "quality", label: "质量", type: "string", values: ["low", "medium", "high"], default: "medium" },
        { name: "responseFormat", label: "响应格式", type: "string", binding: "fixture.response_format", values: ["url", "b64_json"], default: "url" },
    ] as ImageParameter[]);
    const channel = createModelChannel({ id: "fixture", models: [model], modelCosts: [{ model, protocol, capability: mode, capabilityConfig: profile, billingMode: "fixed_request", unitPriceMicrocredits: 1 }] });
    const selected = encodeChannelModel(channel.id, model);
    return { ...defaultConfig, channels: [channel], model: selected, imageModel: selected, videoModel: selected, quality: "medium", count: "1", size: mode === "image" ? "1024x1024" : "16:9", videoSeconds: "6", vquality: "720p", imageParameters: JSON.stringify({ responseFormat: "b64_json" }) } as AiConfig;
}

test("the actual popover and dynamic panel open, expand, resize, Escape and reopen with zero configuration writes", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const changes: Array<[string, string]> = []; let bubbled = 0;
    const config = fixture("image", true), before = JSON.stringify(config);
    try {
        await act(async () => root.render(<div onWheel={() => bubbled++} onKeyDown={() => bubbled++}><CanvasImageSettingsPopover config={config} onConfigChange={(key, value) => changes.push([key, value])} /></div>));
        const trigger = host.querySelector<HTMLButtonElement>(".canvas-generation-settings-trigger")!;
        expect(document.activeElement?.closest("section.canvas-image-settings-popover")).toBeNull();
        await act(async () => { trigger.click(); await settle(); });
        const panel = document.querySelector<HTMLElement>("section.canvas-image-settings-popover")!;
        expect(panel).not.toBeNull(); expect(panel.contains(document.activeElement)).toBe(true);
        expect(trigger.getAttribute("aria-controls")).toBe(panel.id);
        const advanced = panel.querySelector<HTMLDetailsElement>("details.generation-settings-advanced")!; advanced.open = true; advanced.dispatchEvent(new dom.Event("toggle"));
        expect(advanced.querySelector("summary")?.textContent).toContain("图片数据");
        await act(async () => { Object.defineProperty(dom, "innerWidth", { configurable: true, value: 390 }); dom.dispatchEvent(new dom.Event("resize")); await settle(); });
        panel.dispatchEvent(new dom.Event("wheel", { bubbles: true }));
        expect(changes).toEqual([]); expect(bubbled).toBe(0);
        await act(async () => { panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle(); });
        expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute("aria-expanded")).toBe("false");
        await act(async () => { trigger.click(); await settle(); });
        const reopened = document.querySelector<HTMLElement>("section.canvas-image-settings-popover")!;
        expect(reopened.contains(document.activeElement)).toBe(true);
        expect(reopened.querySelector("summary")?.textContent).toContain("图片数据"); expect(changes).toEqual([]); expect(JSON.stringify(config)).toBe(before);
    } finally { await act(async () => root.unmount()); host.remove(); Object.defineProperty(dom, "innerWidth", { configurable: true, value: 1024 }); }
});

test("real fallback image and video popovers do not write when their numeric control is focused and dismissed untouched", async () => {
    for (const mode of ["image", "video"] as const) {
        const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const changes: Array<[string, string]> = [];
        const config = fixture(mode);
        try {
            await act(async () => root.render(mode === "image" ? <CanvasImageSettingsPopover config={config} onConfigChange={(key, value) => changes.push([key, value])} /> : <CanvasVideoSettingsPopover config={config} onConfigChange={(key, value) => changes.push([key, value])} />));
            const trigger = host.querySelector<HTMLButtonElement>(".canvas-generation-settings-trigger")!;
            await act(async () => { trigger.click(); await settle(); });
            const panel = document.querySelector<HTMLElement>("section.canvas-image-settings-popover")!;
            const numeric = panel.querySelector<HTMLInputElement>('input[type="number"]');
            if (numeric) await act(async () => numeric.focus());
            await act(async () => { panel.dispatchEvent(new dom.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await settle(); });
            expect(changes).toEqual([]); expect(document.activeElement).toBe(trigger);
        } finally { await act(async () => root.unmount()); host.remove(); }
    }
});

afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
