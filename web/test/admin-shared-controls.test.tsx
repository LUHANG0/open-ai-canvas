import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, HTMLAnchorElement: dom.HTMLAnchorElement, HTMLInputElement: dom.HTMLInputElement, HTMLButtonElement: dom.HTMLButtonElement, SVGElement: dom.SVGElement, ShadowRoot: dom.ShadowRoot, Element: dom.Element, Node: dom.Node, ResizeObserver: dom.ResizeObserver, MutationObserver: dom.MutationObserver, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, useEffect, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { App, ConfigProvider, Form } = await import("antd");
const { AdminSegmented } = await import("@/pages/admin/ui/controls");
const { AdminDrawer, AdminModal } = await import("@/pages/admin/ui/overlays");
const { AdminRowActions } = await import("@/pages/admin/components/admin-ui");
const { getIsolatedAdminAntTheme } = await import("@/pages/admin/theme/admin-ant-theme");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("admin radios skip disabled items and do not repeat change callbacks for current selections", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    function Harness() {
        const [value, setValue] = useState("a");
        return <AdminSegmented ariaLabel="后台视图" value={value} onChange={(next) => { changes.push(next); setValue(next); }} options={[{ value: "a", label: "甲" }, { value: "b", label: "乙", disabled: true }, { value: "c", label: "丙" }]} />;
    }
    try {
        await act(async () => root.render(<Harness />));
        const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        const key = async (index: number, value: string) => act(async () => { radios[index].dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
        await act(async () => radios[0].click()); await key(0, "Home");
        expect(changes).toEqual([]); expect(document.activeElement).toBe(radios[0]);
        await key(0, "ArrowRight"); expect(changes).toEqual(["c"]); expect(document.activeElement).toBe(radios[2]);
        await key(2, "End"); await act(async () => radios[2].click()); expect(changes).toEqual(["c"]);
        await key(2, "ArrowRight"); expect(changes).toEqual(["c", "a"]);
        expect([...radios].filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
        expect(radios[1].disabled).toBe(true);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("admin radios retain Form injected names and values while inheriting the disabled form context", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: unknown[] = [];
    try {
        await act(async () => root.render(<Form disabled initialValues={{ mode: "b" }} onValuesChange={(value) => changes.push(value)}><Form.Item name="mode" label="后台模式"><AdminSegmented block options={[{ value: "a", label: "甲" }, { value: "b", label: "乙" }]} /></Form.Item></Form>));
        const group = host.querySelector('[role="radiogroup"]')!;
        const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        expect(group.id).toBe("mode"); expect(group.getAttribute("aria-disabled")).toBe("true");
        expect(radios[1].getAttribute("aria-checked")).toBe("true");
        expect([...radios].every((radio) => radio.disabled && radio.tabIndex === -1)).toBe(true);
        await act(async () => radios[0].click()); expect(changes).toEqual([]);
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("explicit persistent AdminModal content survives close and reopen without remounting its draft", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let mounts = 0;
    function Draft() { useEffect(() => { mounts += 1; }, []); return <input aria-label="测试草稿" defaultValue="draft" />; }
    const view = (open: boolean) => <ConfigProvider theme={{ token: { motion: false } }}><AdminModal open={open} destroyOnHidden={false} title="测试编辑器" footer={null}><Draft /></AdminModal></ConfigProvider>;
    try {
        await act(async () => root.render(view(true)));
        const field = document.querySelector<HTMLInputElement>('input[aria-label="测试草稿"]')!;
        await act(async () => root.render(view(false)));
        await act(async () => root.render(view(true)));
        expect(document.querySelector('input[aria-label="测试草稿"]')).toBe(field);
        expect(mounts).toBe(1);
        expect(field.value).toBe("draft");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("admin theme keeps neutral independent surfaces and density while reducing all motion tokens to zero", () => {
    for (const dark of [false, true]) {
        const normal = getIsolatedAdminAntTheme(dark);
        const reduced = getIsolatedAdminAntTheme(dark, true);
        expect(normal.token?.controlHeight).toBe(32); expect(normal.token?.borderRadius).toBe(6);
        expect(normal.token?.colorBgBase).toBe(dark ? "#0f0f0f" : "#f5f5f5");
        expect(normal.token?.colorPrimary).toBe(dark ? "#f5f5f5" : "#111111");
        expect(normal.token?.motionDurationFast).toBe("0.15s"); expect(normal.token?.motionDurationSlow).toBe("0.15s");
        expect(reduced.token?.motion).toBe(false);
        expect(reduced.token?.motionDurationFast).toBe("0s"); expect(reduced.token?.motionDurationMid).toBe("0s"); expect(reduced.token?.motionDurationSlow).toBe("0s");
    }
});

test("a menu action hands focus to its persistent trigger before opening a drawer", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    let actionCount = 0;
    function Harness() {
        const [open, setOpen] = useState(false);
        return <><AdminRowActions visibleActionCount={0} actions={[{ key: "edit", label: "编辑测试", onClick: () => { actionCount += 1; setOpen(true); } }]} /><AdminDrawer open={open} title="测试详情" onClose={() => setOpen(false)}><button onClick={() => setOpen(false)}>关闭测试详情</button></AdminDrawer></>;
    }
    try {
        await act(async () => root.render(<ConfigProvider theme={{ token: { motion: false } }}><App><Harness /></App></ConfigProvider>));
        const trigger = host.querySelector<HTMLButtonElement>('button[aria-label="更多操作"]')!;
        await act(async () => trigger.click());
        const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent === "编辑测试")!;
        await act(async () => { item.focus(); item.click(); });
        expect(actionCount).toBe(1);
        const close = [...document.querySelectorAll<HTMLButtonElement>("button")].find((element) => element.textContent === "关闭测试详情")!;
        await act(async () => close.click());
        expect(document.activeElement).toBe(trigger);
    } finally { await act(async () => root.unmount()); host.remove(); }
});
