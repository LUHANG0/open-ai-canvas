import { afterAll, afterEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";
import type { ModelProtocolDefinition } from "../src/lib/model-protocols";
import type { LogicalModelQuote, ModelQuoteRequest } from "../src/services/api/logical-models";
const dom = new Window({ url: "http://localhost/create" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { appQueryClient } = await import("../src/lib/query-client");
const { createModelChannel, defaultConfig } = await import("../src/stores/use-config-store");
const { useUserStore } = await import("../src/stores/use-user-store");
const catalogAPI = await import("../src/services/api/plugin-catalog");
const quoteAPI = await import("../src/services/api/logical-models");
let catalogImpl: (signal?: AbortSignal) => Promise<ModelProtocolDefinition[]>;
let quoteImpl: (request: ModelQuoteRequest, signal?: AbortSignal) => Promise<{ quote: LogicalModelQuote }>;
mock.module("../src/services/api/plugin-catalog", () => ({ ...catalogAPI, fetchPluginProviderCatalog: (_scope: string, _capability: unknown, signal?: AbortSignal) => catalogImpl(signal) }));
mock.module("../src/services/api/logical-models", () => ({ ...quoteAPI, quoteModel: (request: ModelQuoteRequest, signal?: AbortSignal) => quoteImpl(request, signal) }));
const { useGenerationReadiness } = await import("../src/hooks/use-generation-readiness");
const { GenerationStatusNotice } = await import("../src/components/generation-status");
const originalUser = useUserStore.getState();
afterEach(() => { appQueryClient.clear(); useUserStore.setState(originalUser); });
afterAll(() => { mock.restore(); dom.happyDOM.abort(); for (const [key, desc] of originals) { if (desc) Object.defineProperty(globalThis, key, desc); else Reflect.deleteProperty(globalThis, key); } });
const user = (id: string) => ({ id, username: id, displayName: id, role: "user" as const, status: "active" as const });
const protocol: ModelProtocolDefinition = { value: "openai-image", label: "OpenAI Images", capability: "image", create: "POST /v1/images/generations", contentType: "application/json", media: "fixture" };
const config = (scope: "system" | "user", logicalModelId = "quote-A") => ({ ...defaultConfig, model: "fixture::gpt-image-1", channels: [createModelChannel({ id: "fixture", name: "Fixture", scope, baseUrl: "https://fixture.invalid", apiKey: "fixture", models: ["gpt-image-1"], modelCosts: [{ model: "gpt-image-1", capability: "image" as const, protocol: "openai-image", billingMode: "fixed_request" as const, unitPriceMicrocredits: 0, ...(scope === "system" ? { logicalModelId } : {}) }] })] });
const quote = (amountMicrocredits: number): { quote: LogicalModelQuote } => ({ quote: { logicalModelId: "quote", billingMode: "fixed_request", quantity: 1, amountMicrocredits, estimated: false } });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); }); };
async function mount(initial = config("user")) {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); let current = initial;
    let status!: ReturnType<typeof useGenerationReadiness>;
    function Harness() { status = useGenerationReadiness(current, current.model, "image"); return <><GenerationStatusNotice status={status} /><button data-submit disabled={!status.canSubmit}>提交</button></>; }
    const render = async (next = current) => { current = next; await act(async () => root.render(<Harness />)); await settle(); };
    await render();
    return { host, status: () => status, render, dispose: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test("protocol catalog failure disables submission, exposes retry, and restores supplier billing after recovery", async () => {
    useUserStore.setState({ user: user("catalog-account") });
    catalogImpl = async () => { throw new Error("fixture outage"); }; let quoteCalls = 0;
    quoteImpl = async () => { quoteCalls++; return quote(0); };
    const f = await mount();
    try {
        await settle(); expect(f.status().canSubmit).toBe(false); expect(f.host.textContent).toContain("目录读取失败");
        expect(f.host.querySelector<HTMLButtonElement>("[data-submit]")!.disabled).toBe(true);
        catalogImpl = async () => [protocol]; await act(async () => f.status().retry()); await settle();
        expect(f.status().canSubmit).toBe(true); expect(f.host.textContent).toContain("供应商计费"); expect(quoteCalls).toBe(0);
    } finally { await f.dispose(); }
});
test("a required quote failure cannot reuse the cached zero and retry restores the exact quote", async () => {
    useUserStore.setState({ user: user("quote-account") }); catalogImpl = async () => [];
    quoteImpl = async () => { throw new Error("fixture quote outage"); };
    const f = await mount(config("system"));
    try {
        await settle(); expect(f.status().canSubmit).toBe(false); expect(f.status().fee.credits).toBeNull(); expect(f.host.textContent).toContain("报价读取失败");
        quoteImpl = async () => quote(0); await act(async () => f.status().retry()); await settle();
        expect(f.status().canSubmit).toBe(true); expect(f.status().fee.credits).toBe(0); expect(f.host.textContent).toContain("0 积分");
    } finally { await f.dispose(); }
});
test("late quote responses cannot overwrite a different model's current price", async () => {
    useUserStore.setState({ user: user("late-quote-account") }); const old = deferred<{ quote: LogicalModelQuote }>();
    quoteImpl = (request) => request.logicalModelID === "quote-A" ? old.promise : Promise.resolve(quote(9_000_000));
    const f = await mount(config("system"));
    try {
        expect(f.status().fee.credits).toBeNull(); expect(f.status().canSubmit).toBe(false);
        await f.render(config("system", "quote-B")); await settle(); expect(f.status().fee.credits).toBe(9);
        old.resolve(quote(0)); await settle(); expect(f.status().fee.credits).toBe(9); expect(f.host.textContent).not.toContain("0 积分");
    } finally { await f.dispose(); }
});
test("account change discards a late old-account protocol catalog", async () => {
    useUserStore.setState({ user: user("catalog-A") }); const old = deferred<ModelProtocolDefinition[]>(); let oldSignal: AbortSignal | undefined;
    catalogImpl = (signal) => { if (useUserStore.getState().user?.id === "catalog-A") { oldSignal = signal; return old.promise; } return Promise.resolve([]); };
    const f = await mount();
    try {
        expect(f.status().canSubmit).toBe(false);
        await act(async () => useUserStore.setState({ user: user("catalog-B") })); await settle();
        expect(f.host.textContent).toContain("未安装或未启用"); expect(oldSignal?.aborted).toBe(true);
        old.resolve([protocol]); await settle(); expect(f.status().canSubmit).toBe(false); expect(f.host.textContent).toContain("未安装或未启用");
    } finally { await f.dispose(); }
});
