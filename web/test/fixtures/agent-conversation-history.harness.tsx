import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";
import type { ComponentProps } from "react";

const dom = new Window({ url: "http://localhost/", width: 1280, height: 900 });
const originals = new Map<string, PropertyDescriptor | undefined>();
const observers = new Set<() => void>();
class Observer {
    constructor(private callback: () => void) { observers.add(callback); }
    observe() {}
    unobserve() {}
    disconnect() { observers.delete(this.callback); }
}
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, Event: dom.Event, localStorage: dom.localStorage, getComputedStyle: dom.getComputedStyle.bind(dom), ResizeObserver: Observer, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const localforage = (await import("localforage")).default;
localforage.getItem = (async () => null) as typeof localforage.getItem;
localforage.setItem = (async (_key: string, value: unknown) => value) as typeof localforage.setItem;
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { AgentConversation } = await import("@/components/canvas/canvas-cloud-agent-panel-parts");
const { canvasThemes } = await import("@/lib/canvas-theme");
type Props = ComponentProps<typeof AgentConversation>;
const noop = () => {};
const rows = (count: number, prefix = "m"): Props["messages"] => Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}`, role: "user", text: `${prefix}正文${index}` }));
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture(messages = rows(200)) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    let props: Props = { theme: canvasThemes.light, messages, references: [], busy: false, approval: null, approvalSubmitting: false, nodeCount: 2, onChooseSkill: noop, onDraftPrompt: noop, onApprovalReasonChange: noop, onApprove: noop, onReject: noop };
    let conversation = "first";
    const render = async (patch: Partial<Props> = {}, nextConversation = conversation) => {
        props = { ...props, ...patch }; conversation = nextConversation;
        await act(async () => root.render(<AgentConversation key={conversation} {...props} />));
    };
    await render();
    const scroll = host.querySelector<HTMLElement>("[data-agent-conversation]")!;
    // HappyDOM has no layout: deterministic row geometry for the real scroll logic.
    Object.defineProperties(scroll, { clientHeight: { get: () => 300 }, scrollHeight: { get: () => host.querySelectorAll("[data-agent-feed-key]").length * 100 + 30 } });
    scroll.getBoundingClientRect = () => ({ top: 0, bottom: 300 } as DOMRect);
    const geometry = () => host.querySelectorAll<HTMLElement>("[data-agent-feed-key]").forEach((element) => { element.getBoundingClientRect = () => { const index = [...host.querySelectorAll("[data-agent-feed-key]")].indexOf(element); return { top: index * 100 + 30 - scroll.scrollTop, bottom: (index + 1) * 100 + 30 - scroll.scrollTop } as DOMRect; }; });
    const earlier = () => host.querySelector<HTMLButtonElement>(".agent-load-earlier");
    const load = async () => { geometry(); await act(async () => earlier()!.click()); geometry(); };
    const move = async (top: number) => { scroll.scrollTop = top; await act(async () => scroll.dispatchEvent(new dom.Event("scroll", { bubbles: true }) as unknown as Event)); };
    const resize = () => { for (const callback of observers) callback(); };
    const cleanup = async () => { await act(async () => root.unmount()); host.remove(); };
    return { host, scroll, render, earlier, load, move, resize, cleanup };
}

test("initial 4,000-row history is bounded; all older rows remain reachable in batches", async () => {
    const messages = rows(4000);
    const f = await fixture(messages);
    try {
        expect(f.host.textContent).not.toContain("m正文0");
        expect(f.host.textContent).toContain("m正文3999");
        expect(f.host.querySelectorAll("[data-agent-feed-key]")).toHaveLength(80);
        await f.load();
        expect(f.host.querySelectorAll("[data-agent-feed-key]")).toHaveLength(160);
        expect(messages).toHaveLength(4000);
    } finally { await f.cleanup(); }
});

test("loading older history preserves the reading anchor and disables bottom following", async () => {
    const f = await fixture();
    try {
        await f.move(130);
        await f.load();
        expect(f.scroll.scrollTop).toBe(8130);
        const top = f.scroll.scrollTop;
        f.resize();
        expect(f.scroll.scrollTop).toBe(top);
        expect(f.host.querySelectorAll("[data-agent-feed-key]")).toHaveLength(160);
        await f.move(0); await f.load();
        expect(f.host.textContent).toContain("m正文0");
        expect(f.earlier()).toBeNull();
    } finally { await f.cleanup(); }
});

test("reading old rows pins the first rendered row while assistant chunks append; new user input follows bottom", async () => {
    const messages = rows(200);
    const f = await fixture(messages);
    try {
        await f.move(230);
        const anchor = f.host.querySelector("[data-agent-feed-key]")!.getAttribute("data-agent-feed-key");
        const next: Props["messages"] = [...messages, { id: "reply", role: "assistant", text: "流式正文", streaming: true }];
        await f.render({ messages: next, busy: true });
        expect(f.host.querySelector("[data-agent-feed-key]")!.getAttribute("data-agent-feed-key")).toBe(anchor);
        expect(f.scroll.scrollTop).toBe(230);
        f.resize(); expect(f.scroll.scrollTop).toBe(230);
        await f.render({ messages: [...next, { id: "mine", role: "user", text: "继续" }] });
        expect(f.scroll.scrollTop).toBe(f.scroll.scrollHeight);
    } finally { await f.cleanup(); }
});

test("conversation identity resets expansion and keeps the last message visible", async () => {
    const f = await fixture();
    try {
        await f.load();
        await f.render({ messages: rows(200, "other") }, "second");
        expect(f.host.querySelectorAll("[data-agent-feed-key]")).toHaveLength(80);
        expect(f.host.textContent).toContain("other正文199");
        expect(f.host.textContent).not.toContain("m正文");
    } finally { await f.cleanup(); }
});

test("operation/reasoning groups remain intact and current approval actions stay outside history pagination", async () => {
    let approved = 0, rejected = 0;
    const messages: Props["messages"] = [...rows(200), { id: "r1", role: "assistant", text: "检查", reasoning: true }, { id: "r2", role: "assistant", text: "整理", reasoning: true }, { id: "t1", role: "tool", title: "canvas_get_state", text: "读取完成" }, { id: "t2", role: "tool", title: "model_list", text: "读取完成" }];
    const f = await fixture(messages);
    try {
        await f.render({ busy: true, approval: { approvalId: "isolated", detail: { toolName: "canvas_apply_ops", arguments: { operations: [] } }, reason: "" }, onApprove: () => approved++, onReject: () => rejected++ });
        const reasoning = f.host.querySelectorAll("details.agent-reasoning");
        expect(reasoning).toHaveLength(1);
        expect(reasoning[0].textContent).toContain("检查");
        expect(reasoning[0].textContent).toContain("整理");
        expect(f.host.querySelectorAll("[data-agent-operation-feed]")).toHaveLength(1);
        expect(f.host.querySelector("[data-agent-operation-feed]")?.classList.contains("is-live")).toBe(true);
        const approval = f.host.querySelector(".canvas-agent-approval-card")!;
        expect(approval.closest("[data-agent-feed-key]")).toBeNull();
        const buttons = [...approval.querySelectorAll<HTMLButtonElement>("button")];
        await act(async () => { buttons.find((button) => button.textContent?.includes("同意"))!.click(); });
        await act(async () => { buttons.find((button) => button.textContent?.includes("暂不执行"))!.click(); });
        expect(approved).toBe(1); expect(rejected).toBe(1);
        await f.render({ messages: [...messages, { id: "answer", role: "assistant", text: "处理结果" }] });
        expect(f.host.querySelector("[data-agent-operation-feed]")?.classList.contains("is-live")).toBe(false);
    } finally { await f.cleanup(); }
});

test("an empty conversation retains the welcome actions without a history button", async () => {
    const f = await fixture([]);
    try {
        expect(f.earlier()).toBeNull();
        expect(f.host.textContent).toContain("灵感");
        expect(f.host.querySelectorAll("[data-agent-feed-key]")).toHaveLength(0);
    } finally { await f.cleanup(); }
});
