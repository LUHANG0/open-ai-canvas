import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";

const dom = new Window({ url: "http://localhost/create" });
const globals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, sessionStorage: dom.sessionStorage, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, HTMLTextAreaElement: dom.HTMLTextAreaElement, IS_REACT_ACT_ENVIRONMENT: true, Element: dom.Element, SVGElement: dom.SVGElement, Node: dom.Node, ShadowRoot: dom.ShadowRoot, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom) })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(async () => { mock.restore(); await dom.happyDOM.abort(); for (const [key, desc] of globals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); } });
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const catalogAPI = await import("../src/services/api/plugin-catalog");
mock.module("../src/services/api/plugin-catalog", () => ({ ...catalogAPI, fetchPluginProviderCatalog: async () => [] }));
const { appQueryClient } = await import("../src/lib/query-client");
const { CreationComposer } = await import("../src/pages/create/creation-workspace");
const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
const { defaultConfig } = await import("../src/stores/use-config-store");
const { useUserStore } = await import("../src/stores/use-user-store");
const original = useUserStore.getState();
afterEach(() => { useUserStore.setState(original); appQueryClient.clear(); });
const noop = () => {};
function fixture(mode: "image" | "video" | "text" = "image"): ComponentProps<typeof CreationComposer> {
    const capabilities = defaultModelCapabilityConfig();
    return { variant: "empty", mode, prompt: "登录后继续这条创作想法", setPrompt: noop, busy: false, generationActive: false, referenceReplacementBusy: false, attachments: [], maxReferences: 16, references: [], onRemoveAttachment: noop, onClearAttachments: noop, onClearComposer: noop, onReorderAttachments: noop, onReplaceAttachment: noop, onReplaceReferenceFiles: noop, onOpenLibrary: noop, onModeChange: noop, model: "", modelRequirements: { capability: mode }, imageProfile: capabilities.image!, videoProfile: capabilities.video!, config: { ...defaultConfig, channels: [], models: [] }, onModelChange: noop, ratio: "1:1", setRatio: noop, seconds: "5", setSeconds: noop, quality: "auto", setQuality: noop, imageResolution: "1k", setImageResolution: noop, setImageParameters: noop, setTransparentBackground: noop, videoQuality: "720", setVideoQuality: noop, count: "1", setCount: noop, textStreaming: true, setTextStreaming: noop, textThinkingLevels: ["off", "medium"], textThinkingLevel: "off", textThinkingRequest: "auto", setTextThinkingLevel: noop, promptOptimizerProvider: null, composerFocusRef: { current: null }, onPromptFocus: noop, onSubmit: noop };
}
const render = (props = fixture()) => renderToStaticMarkup(<CreationComposer {...props} />);
const sendButton = (html: string) => { const tag = html.match(/<button\b[^>]*aria-label="发送"[^>]*>/)?.[0]; expect(tag).toBeDefined(); return tag!; };

test("guests can reach the existing login-on-send path before choosing a model in every creation mode", () => {
    useUserStore.setState({ user: null });
    for (const mode of ["image", "video", "text"] as const) {
        const html = render(fixture(mode));
        expect(sendButton(html)).not.toContain("disabled");
        expect(html).toContain("登录后选择模型并查看费用");
        expect(html).not.toContain("检查设置");
    }
});
test("empty prompts and busy state still block guests", () => {
    useUserStore.setState({ user: null });
    for (const patch of [{ prompt: " " }, { busy: true }, { referenceReplacementBusy: true }]) {
        const button = render({ ...fixture(), ...patch }).match(/<button\b(?=[^>]*class="[^"]*creation-submit)[^>]*>/)?.[0];
        expect(button).toBeDefined(); expect(button).toContain("disabled");
    }
    expect(sendButton(render({ ...fixture(), prompt: " " }))).toContain("disabled");
});
test("signed-in creators remain blocked when model configuration is not ready", async () => {
    useUserStore.setState({ user: { id: "signed-in-readiness", username: "fixture", displayName: "Fixture", role: "user", status: "active" } });
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    try {
        await act(async () => root.render(<CreationComposer {...fixture()} />));
        expect(host.querySelector<HTMLButtonElement>("button.creation-submit")?.disabled).toBe(true);
        expect(host.textContent).toContain("请先选择模型");
    } finally { await act(async () => root.unmount()); host.remove(); }
});
