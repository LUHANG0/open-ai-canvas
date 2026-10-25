import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLInputElement: dom.HTMLInputElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, MutationObserver: dom.MutationObserver, ResizeObserver: dom.ResizeObserver, getComputedStyle: dom.getComputedStyle.bind(dom), requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) { originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }); }
const { act } = await import("react"); const { createRoot } = await import("react-dom/client"); const { renderToStaticMarkup } = await import("react-dom/server");
const { ImageParameterFields, ImageParameterInput } = await import("../src/components/image-parameter-fields");
const { ImageSettingsPanel } = await import("../src/components/image-settings-panel");
const { VideoSettingsPanel } = await import("../src/components/video-settings-panel");
const { defaultConfig, createModelChannel, encodeChannelModel } = await import("../src/stores/use-config-store");
const { defaultModelCapabilityConfig, defaultImageCapabilityConfig } = await import("../src/lib/model-capabilities");
const { imageParameterRequest, projectImageParameters } = await import("../src/lib/image-parameters");
const { canvasThemes } = await import("../src/lib/canvas-theme");
import type { ImageParameter } from "../src/lib/image-parameters";
import type { AiConfig } from "../src/stores/use-config-store";

const roots: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];
function mount() { const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); roots.push({ root, host }); return { host, root }; }
afterEach(async () => { for (const { root, host } of roots.splice(0)) { await act(async () => root.unmount()); host.remove(); } });
const fields: ImageParameter[] = [
    { name: "quality", label: "质量 / 档位", type: "string", values: ["low", "medium", "high", "xhigh", "max"], default: "medium", pricing: true, description: "超高、最高只在当前线路支持时使用；本模型最多3张。" },
    { name: "finish", label: "表面", type: "string", values: ["high", "matte"], default: "high", description: "保留自定义说明" },
    { name: "responseFormat", label: "响应格式", type: "string", binding: "providerOptions.fixture.response_format", values: ["url", "b64_json", "auto"], default: "url" },
    { name: "count", label: "生成数量", type: "integer", min: 1, max: 3, step: 1, default: 1 },
    { name: "size", label: "画幅", type: "string", encoding: "ratio", values: ["16:9", "9:16"], default: "16:9" },
];
function imageFixture() { return projectImageParameters(defaultImageCapabilityConfig(), fields); }
function configFor(protocol: string, model: string, capability: "image" | "video", patch: Record<string, unknown> = {}) {
    const profile = defaultModelCapabilityConfig(protocol, model);
    const channel = createModelChannel({ id: "fixture", models: [model], modelCosts: [{ model, protocol, capability, capabilityConfig: profile, billingMode: "fixed_request", unitPriceMicrocredits: 1, priceConfigured: true, ...patch }] });
    const selected = encodeChannelModel(channel.id, model);
    return { ...defaultConfig, channels: [channel], model: selected, imageModel: selected, videoModel: selected, size: "16:9", quality: "medium", vquality: "720p", videoSeconds: "6", count: "1" } as AiConfig;
}

test("the actual dynamic schema shows Chinese quality but keeps typed payload, custom enums and required descriptions", async () => {
    const profile = imageFixture(), config = { ...defaultConfig, size: "16:9", quality: "medium", count: "1" }; const before = JSON.stringify(profile); const changes: Array<[string, string]> = [];
    const { host, root } = mount();
    await act(async () => root.render(<ImageParameterFields profile={profile} config={config} onChange={(key, value) => changes.push([key, value])} />));
    expect(changes).toEqual([]); expect(host.textContent).toContain("图像质量"); expect(host.textContent).toContain("超高"); expect(host.textContent).toContain("最高");
    expect(host.textContent).toContain("本模型最多3张"); expect(host.textContent).toContain("保留自定义说明");
    expect(host.querySelector('[aria-label="表面"]')?.textContent).toContain("high");
    const quality = host.querySelector('[aria-label="图像质量"]')!;
    const high = [...quality.querySelectorAll("button")].find((button) => button.textContent === "高")!;
    await act(async () => high.click()); expect(changes).toEqual([["quality", "high"]]);
    const requested = imageParameterRequest(profile, { ...config, quality: changes[0][1] }, true)!;
    expect(requested.quality).toBe("high"); expect(typeof requested.count).toBe("number");
    expect(requested.responseFormat).toBe("url"); expect(JSON.stringify(profile)).toBe(before);
});

test("advanced native disclosure changes no config and preserves a chosen response value when reopened", async () => {
    const { host, root } = mount(); const changes: Array<[string, string]> = []; const profile = imageFixture();
    const config = { ...defaultConfig, size: "16:9", quality: "medium", count: "1", imageParameters: JSON.stringify({ responseFormat: "b64_json", customZero: 0 }) };
    await act(async () => root.render(<ImageParameterFields profile={profile} config={config} onChange={(key, value) => changes.push([key, value])} />));
    const details = host.querySelector<HTMLDetailsElement>("details.generation-settings-advanced")!;
    expect(details.querySelector("summary")?.textContent).toContain("高级设置"); expect(details.querySelector("summary")?.textContent).toContain("图片数据");
    details.open = true; details.dispatchEvent(new dom.Event("toggle")); details.open = false; details.dispatchEvent(new dom.Event("toggle")); details.open = true;
    expect(changes).toEqual([]);
    expect([...details.querySelectorAll("button")].find((button) => button.textContent === "图片数据")?.getAttribute("aria-pressed")).toBe("true");
    const auto = [...details.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "自动")!;
    await act(async () => auto.click());
    expect(changes[0][0]).toBe("imageParameters"); expect(JSON.parse(changes[0][1])).toEqual({ responseFormat: "auto", customZero: 0 });
});

test("the protocol editor retains original enum and label instead of using the generation presentation", () => {
    const html = renderToStaticMarkup(<ImageParameterInput field={fields[0]} value="medium" inlineChoices onChange={() => {}} />);
    expect(html).toContain('aria-label="质量 / 档位"');
    expect(html).toContain(">high<"); expect(html).toContain(">xhigh<"); expect(html).not.toContain(">超高<");
});

test("fallback image settings remain ordered and untouched count blur is not a configuration write", async () => {
    const config = configFor("openai-image", "gpt-image-1", "image"); const changes: Array<[string, string]> = [];
    const { host, root } = mount(); await act(async () => root.render(<ImageSettingsPanel config={config} theme={canvasThemes.light} onConfigChange={(key, value) => changes.push([key, value])} />));
    expect(changes).toEqual([]);
    const text = host.textContent!; expect(text.indexOf("画幅")).toBeLessThan(text.indexOf("图像质量"));
    const count = host.querySelector<HTMLInputElement>('input[aria-label="自定义生成张数"]');
    if (count) { await act(async () => { count.focus(); count.blur(); }); expect(changes).toEqual([]); }
    const transparent = host.querySelector('[aria-label="透明背景"]'); if (transparent) expect(transparent.getAttribute("role")).toBe("switch");
});

test("general video keeps real duration bounds/step, price disabled state, reference pixels and output callbacks", async () => {
    const profile = defaultModelCapabilityConfig("openai-video", "fixture-video"); profile.video!.duration = { selection: "range", min: 4, max: 12, step: 2, default: 6 }; profile.video!.resolutions = ["720p", "1080p"]; profile.video!.ratios = ["16:9", "auto"]; profile.video!.generateAudio = { supported: true, default: false }; profile.video!.watermark = { supported: true, default: true };
    const config = configFor("openai-video", "fixture-video", "video", { capabilityConfig: profile, logicalPriceTiers: [{ id: "tier", selector: { vquality: "720p", videoSeconds: "6" }, unitPriceMicrocredits: 1, billingMode: "fixed_request", enabled: true, priceConfigured: true }] });
    const changes: Array<[string, string]> = []; const { host, root } = mount(); await act(async () => root.render(<VideoSettingsPanel config={config} theme={canvasThemes.dark} onConfigChange={(key, value) => changes.push([key, value])} />));
    expect(changes).toEqual([]); expect(host.textContent).toContain("像素换算参考：1280 × 720");
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!; expect([range.min, range.max, range.step]).toEqual(["4", "12", "2"]);
    const duration = host.querySelector<HTMLInputElement>('input[type="number"]')!; expect(duration.step).toBe("2"); await act(async () => { duration.focus(); duration.blur(); }); expect(changes).toEqual([]);
    const resolution = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "1080P")!; expect(resolution.disabled).toBe(true); await act(async () => resolution.click()); expect(changes).toEqual([]);
    const initialAudioConfig = "true";
    expect(defaultConfig.videoGenerateAudio).toBe(initialAudioConfig); expect(config.videoGenerateAudio).toBe(initialAudioConfig); expect(profile.video!.generateAudio.default).toBe(false);
    const audio = host.querySelector<HTMLButtonElement>('[aria-label="生成声音"]')!; expect(audio.getAttribute("aria-checked")).toBe("true");
    await act(async () => audio.click()); expect(changes).toEqual([["videoGenerateAudio", "false"]]);
    await act(async () => root.render(<VideoSettingsPanel config={{ ...config, size: "auto" }} theme={canvasThemes.dark} onConfigChange={(key, value) => changes.push([key, value])} />));
    expect(host.textContent).not.toContain("像素换算参考"); expect(config.size).toBe("16:9");
    const enabledByCapability = structuredClone(profile); enabledByCapability.video!.generateAudio.default = true;
    const explicitOffConfig = { ...configFor("openai-video", "fixture-video", "video", { capabilityConfig: enabledByCapability }), videoGenerateAudio: "false" };
    await act(async () => root.render(<VideoSettingsPanel config={explicitOffConfig} theme={canvasThemes.dark} onConfigChange={(key, value) => changes.push([key, value])} />));
    const explicitOff = host.querySelector<HTMLButtonElement>('[aria-label="生成声音"]')!; expect(explicitOffConfig.videoGenerateAudio).toBe("false"); expect(enabledByCapability.video!.generateAudio.default).toBe(true); expect(explicitOff.getAttribute("aria-checked")).toBe("false");
    await act(async () => explicitOff.click()); expect(changes).toEqual([["videoGenerateAudio", "false"], ["videoGenerateAudio", "true"]]);
});

test("manual video duration uses the existing range step and bound normalization without a new default", async () => {
    const profile = defaultModelCapabilityConfig("openai-video", "fixture-video"); profile.video!.duration = { selection: "range", min: 4, max: 12, step: 2, default: 6 };
    const config = configFor("openai-video", "fixture-video", "video", { capabilityConfig: profile }); const changes: Array<[string, string]> = [];
    const { host, root } = mount(); await act(async () => root.render(<VideoSettingsPanel config={config} theme={canvasThemes.light} onConfigChange={(key, value) => changes.push([key, value])} />));
    const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    const edit = async (value: string) => { await act(async () => { input.focus(); Object.getOwnPropertyDescriptor(dom.HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new dom.Event("input", { bubbles: true })); }); await act(async () => input.blur()); };
    await edit("9"); expect(changes).toEqual([["videoSeconds", "10"]]);
    await edit("99"); expect(changes.at(-1)).toEqual(["videoSeconds", "12"]);
    expect(config.videoSeconds).toBe("6");
});

test("JiMeng keeps discrete duration and Seedance keeps fast limits plus the explicit rights-confirmation switch", () => {
    const jimeng = configFor("volcengine-jimeng-video", "fixture-jimeng", "video"); jimeng.videoSeconds = "5";
    const jimengHtml = renderToStaticMarkup(<VideoSettingsPanel config={jimeng} theme={canvasThemes.light} onConfigChange={() => {}} />);
    expect(jimengHtml).toContain("5秒"); expect(jimengHtml).toContain("10秒"); expect(jimengHtml).toContain("分辨率"); expect(jimengHtml).not.toContain('type="range"');
    const seedance = configFor("volcengine-ark-video", "doubao-seedance-1-0-pro-fast", "video");
    const html = renderToStaticMarkup(<VideoSettingsPanel config={seedance} theme={canvasThemes.dark} onConfigChange={() => {}} />);
    expect(html).toContain("自动同步可信素材（确认拥有使用权）"); expect(html).toContain('aria-label="自动同步可信素材（确认拥有使用权）"');
    expect(html).toMatch(/disabled=""[^>]*>1080P<\/button>/);
    expect(html.indexOf("画幅")).toBeLessThan(html.indexOf("分辨率"));
});

afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
