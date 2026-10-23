import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLAnchorElement: dom.HTMLAnchorElement, HTMLInputElement: dom.HTMLInputElement, HTMLButtonElement: dom.HTMLButtonElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { ConfigProvider, Form } = await import("antd");
const { WorkspaceWalletTabs } = await import("@/components/layout/workspace-wallet-tabs");
const { handleAdminRadioKeyDown } = await import("@/pages/admin/ui/radio-navigation");
const { BannerNoticeTypeSelector } = await import("@/pages/admin/components/banner-notice-type-selector");
const { AnnouncementEditor } = await import("@/pages/admin/components/admin-announcement-editor");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("wallet tabs preserve order, one Tab entry and labelled panels while keyboard changes selection once", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    function Harness() {
        const [value, setValue] = useState<"topup" | "redeem" | "history">("topup");
        return <><WorkspaceWalletTabs value={value} idPrefix="wallet-test" onChange={(next) => { changes.push(next); setValue(next); }} />{["topup", "redeem", "history"].map((tab) => <div key={tab} role="tabpanel" id={`wallet-test-panel-${tab}`} aria-labelledby={`wallet-test-tab-${tab}`} hidden={value !== tab} />)}</>;
    }
    try {
        await act(async () => root.render(<Harness />));
        const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        expect(tabs.map((tab) => tab.textContent)).toEqual(["充值", "兑换", "积分消耗历史"]);
        const key = async (index: number, key: string) => act(async () => { tabs[index].dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
        await act(async () => tabs[0].click()); await key(0, "Home"); expect(changes).toEqual([]);
        await key(0, "ArrowRight"); expect(changes).toEqual(["redeem"]); expect(document.activeElement).toBe(tabs[1]);
        await key(1, "End"); await key(2, "End"); expect(changes).toEqual(["redeem", "history"]);
        await key(2, "ArrowRight"); expect(changes.at(-1)).toBe("topup");
        await key(0, "ArrowLeft"); expect(changes.at(-1)).toBe("history");
        expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[2]]);
        for (const tab of tabs) {
            const panel = document.getElementById(tab.getAttribute("aria-controls")!);
            expect(panel?.getAttribute("role")).toBe("tabpanel"); expect(panel?.getAttribute("aria-labelledby")).toBe(tab.id);
            expect(panel?.hidden).toBe(tab.getAttribute("aria-selected") !== "true");
        }
        expect(changes).toHaveLength(4);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("admin card navigation skips disabled cards, ignores adjacent commands and does not repeat a selected action", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    function Harness() {
        const [selected, setSelected] = useState("a");
        return <div role="radiogroup" onKeyDown={handleAdminRadioKeyDown}>{["a", "b", "c"].map((id) => <button key={id} type="button" role="radio" aria-checked={selected === id} tabIndex={selected === id ? 0 : -1} disabled={id === "b"} onClick={() => { changes.push(id); setSelected(id); }}>{id}</button>)}<button type="button">复制</button></div>;
    }
    try {
        await act(async () => root.render(<Harness />));
        const cards = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
        const key = async (target: HTMLElement, key: string) => act(async () => { target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
        await key(cards[0], "ArrowRight"); expect(changes).toEqual(["c"]); expect(document.activeElement).toBe(cards[2]);
        await key(cards[2], "End"); expect(changes).toEqual(["c"]);
        await key(cards[2], "ArrowDown"); expect(changes).toEqual(["c", "a"]);
        await key(host.querySelector<HTMLButtonElement>('button:not([role])')!, "End"); expect(changes).toEqual(["c", "a"]);
        await key(cards[0], "ArrowUp"); expect(changes.at(-1)).toBe("c");
        await key(cards[2], "Home"); expect(changes.at(-1)).toBe("a");
        expect(cards.filter((card) => card.tabIndex === 0)).toEqual([cards[0]]);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("real banner type cards apply keyboard navigation through their existing onChange path", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    function Harness() { const [value, setValue] = useState("notice"); return <BannerNoticeTypeSelector value={value} onChange={(next) => { changes.push(next); setValue(next); }} />; }
    try {
        await act(async () => root.render(<Harness />));
        const cards = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
        const first = cards.find((card) => card.getAttribute("aria-checked") === "true")!;
        await act(async () => first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true })));
        expect(changes).toHaveLength(1); expect(document.activeElement).toBe(cards.at(-1)!);
        expect(cards.at(-1)?.getAttribute("aria-checked")).toBe("true");
        expect(cards.filter((card) => card.tabIndex === 0)).toEqual([cards.at(-1)!]);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("real announcement editor retains its force-rendered form node and draft across close and reopen", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let formInstance: ReturnType<typeof Form.useForm>[0];
    let previews = 0; let confirmations = 0;
    function Harness({ open }: { open: boolean }) {
        const [form] = Form.useForm(); formInstance = form;
        const imageInputRef = useRef<HTMLInputElement>(null);
        return <ConfigProvider theme={{ token: { motion: false } }}><AnnouncementEditor open={open} editingAnnouncement={null} form={form} pending={null} saving={false} publishBlocked={false} returnFocusElement={null} imagePreviewUrl="" imageUploading={false} imageInputRef={imageInputRef} onClose={() => {}} onPreview={() => { previews += 1; }} onPendingChange={() => {}} onUploadImage={() => {}} onClearImage={() => {}} onConfirm={() => { confirmations += 1; }} /></ConfigProvider>;
    }
    try {
        await act(async () => root.render(<Harness open={false} />));
        const field = document.querySelector<HTMLInputElement>('input[placeholder="例如：视频模型已恢复正常使用"]')!;
        expect(field).not.toBeNull();
        await act(async () => formInstance!.setFieldsValue({ title: "测试草稿" }));
        await act(async () => root.render(<Harness open />));
        await act(async () => root.render(<Harness open={false} />));
        await act(async () => root.render(<Harness open />));
        expect(document.querySelector('input[placeholder="例如：视频模型已恢复正常使用"]')).toBe(field);
        expect(field.value).toBe("测试草稿"); expect(previews).toBe(0); expect(confirmations).toBe(0);
        expect(document.querySelector('.admin-modal-root.admin-announcement-editor-modal')).not.toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); }
});
