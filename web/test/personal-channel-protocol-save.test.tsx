import { afterAll, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/settings?section=channels" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider } = await import("antd");
const { createModelChannel, defaultConfig, normalizeConfigSnapshot, resolveModelRequestConfig } = await import("../src/stores/use-config-store");
const { defaultModelCapabilityConfig } = await import("../src/lib/model-capabilities");
const catalogAPI = await import("../src/services/api/plugin-catalog");
mock.module("../src/services/api/plugin-catalog", () => ({ ...catalogAPI, fetchPluginProviderCatalog: async () => [{ value: "openai-image", label: "OpenAI Images", capability: "image", create: "POST /v1/images/generations", contentType: "application/json", media: "Isolated fixture", vendor: "Fixture", enabled: true }] }));
const { ChannelModelSettings } = await import("../src/pages/settings/channel-video-pricing");
type Channel = ReturnType<typeof createModelChannel>;
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); } });

async function fixture(initial: Channel) {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let current = initial; let changes = 0;
    function Harness() {
        const [channel, setChannel] = useState(initial);
        return <ConfigProvider theme={{ token: { motion: false } }}><App><ChannelModelSettings channel={channel} onChange={(modelCosts) => { changes++; current = { ...channel, modelCosts }; setChannel(current); }} /></App></ConfigProvider>;
    }
    await act(async () => root.render(<Harness />));
    const open = async () => { await act(async () => [...host.querySelectorAll("button")].find(b => b.textContent?.includes("配置使用"))!.click()); };
    const close = async () => { await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent?.replace(/\s/g, "") === "完成")!.click()); };
    const dispose = async () => { await act(async () => root.unmount()); host.remove(); };
    return { host, open, close, dispose, current: () => current, changes: () => changes };
}
const unconfigured = () => createModelChannel({ id: "personal", name: "隔离个人渠道", models: ["gpt-image-1"], baseUrl: "https://fixture.invalid", apiKey: "fixture-only" });

test("an unconfigured model never appears selected; its first explicit protocol click persists and survives rehydration", async () => {
    const f = await fixture(unconfigured());
    try {
        expect(f.host.textContent).toContain("待配置请求协议");
        await f.open();
        expect(document.querySelectorAll('[role="dialog"] input[type="radio"]:checked').length).toBe(0);
        expect(f.changes()).toBe(0);
        await act(async () => document.querySelector<HTMLInputElement>('[role="dialog"] input[type="radio"][value="openai-image"]')!.click());
        expect(f.changes()).toBe(1);
        expect(f.current().modelCosts?.[0]?.protocol).toBe("openai-image");
        await f.close();
        const persisted = JSON.parse(JSON.stringify({ ...defaultConfig, channels: [f.current()], model: "personal::gpt-image-1", imageModel: "personal::gpt-image-1" }));
        const restored = normalizeConfigSnapshot({ config: persisted }).config;
        expect(resolveModelRequestConfig(restored, restored.imageModel).interfaceType).toBe("openai-image");
        await f.open();
        expect(document.querySelector<HTMLInputElement>('[role="dialog"] input[value="openai-image"]')!.checked).toBe(true);
    } finally { await f.dispose(); }
});

test("closing an unconfigured editor does not silently assign a guessed protocol or enable protocol-dependent controls", async () => {
    const f = await fixture(unconfigured());
    try {
        await f.open();
        await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent === "能力与参数")!.click());
        expect(document.querySelector('[role="dialog"]')?.textContent).toContain("请先在基本信息中选择请求协议");
        await f.close();
        expect(f.changes()).toBe(0);
        expect(f.current().modelCosts).toBeUndefined();
    } finally { await f.dispose(); }
});

test("opening and closing an existing personal protocol preserves its stored price and capability configuration", async () => {
    const channel = unconfigured();
    channel.modelCosts = [{ model: "gpt-image-1", capability: "image", protocol: "openai-image", billingMode: "fixed_request", unitPriceMicrocredits: 13725, capabilityConfig: defaultModelCapabilityConfig("openai-image", "gpt-image-1") }];
    const original = JSON.stringify(channel.modelCosts); const f = await fixture(channel);
    try {
        await f.open();
        expect(document.querySelector<HTMLInputElement>('[role="dialog"] input[value="openai-image"]')!.checked).toBe(true);
        await f.close();
        expect(f.changes()).toBe(0);
        expect(JSON.stringify(f.current().modelCosts)).toBe(original);
    } finally { await f.dispose(); }
});
