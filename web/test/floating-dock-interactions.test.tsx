import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
// Happy DOM 的 WAAPI cancel 会拒绝 finished；使用真实 Motion 的 JS fallback，避免模拟器异常。
const animationDescriptor = Object.getOwnPropertyDescriptor(dom.Element.prototype, "animate");
Reflect.deleteProperty(dom.Element.prototype, "animate");
const originals = new Map<string, PropertyDescriptor | undefined>();
let reduce = false; let coarse = false;
const media = new Map<string, MediaQueryList>();
dom.matchMedia = ((query: string) => {
    if (!media.has(query)) {
        const target = new dom.EventTarget();
        Object.defineProperties(target, { media: { value: query }, matches: { get: () => query.includes("prefers-reduced-motion") ? reduce : query.includes("pointer: coarse") ? coarse : false } });
        Object.assign(target, { addListener: (listener: EventListener) => target.addEventListener("change", listener), removeListener: (listener: EventListener) => target.removeEventListener("change", listener) });
        media.set(query, target as unknown as MediaQueryList);
    }
    return media.get(query)!;
}) as typeof dom.matchMedia;
for (const [key, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, SVGElement: dom.SVGElement, Node: dom.Node,
    Event: dom.Event, MouseEvent: dom.MouseEvent, KeyboardEvent: dom.KeyboardEvent,
    requestAnimationFrame: dom.requestAnimationFrame.bind(dom), cancelAnimationFrame: dom.cancelAnimationFrame.bind(dom),
    getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true,
})) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, createRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { FloatingDock } = await import("@/components/ui/aceternity/floating-dock");
type Entry = import("@/components/ui/aceternity/floating-dock").FloatingDockEntry;

afterAll(() => {
    dom.happyDOM.abort();
    if (animationDescriptor) Object.defineProperty(dom.Element.prototype, "animate", animationDescriptor);
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

async function fixture({ reduced = false, pointer = false, width = 1280 } = {}) {
    reduce = reduced; coarse = pointer; Object.defineProperty(dom, "innerWidth", { configurable: true, value: width });
    for (const target of media.values()) target.dispatchEvent(new window.Event("change"));
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    return {
        host,
        render: async (element: React.ReactNode) => { await act(async () => root.render(element)); },
        dispose: async () => { await act(async () => root.unmount()); host.remove(); },
    };
}
const key = async (target: HTMLElement, value: string) => act(async () => { target.dispatchEvent(new window.KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
const mouse = async (target: HTMLElement, type: string) => act(async () => { target.dispatchEvent(new window.MouseEvent(type, { bubbles: true })); });
const frame = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });

test("real dock forwards root ref, native click currentTarget and command state while disabled commands stay inactive", async () => {
    for (const showLabels of [false, true]) {
        const f = await fixture(); const ref = createRef<HTMLDivElement>(); const clicks: HTMLButtonElement[] = [];
        const items: Entry[] = [
            { id: "active", label: "选择", displayLabel: "选", icon: <span data-icon>+</span>, active: true, badge: 2, wide: true, quiet: true, onClick: event => clicks.push(event.currentTarget) },
            { kind: "separator", id: "separator" },
            { id: "panel", label: "设置", icon: <span>⚙</span>, expands: true, active: true },
            { id: "delete", label: "删除", icon: <span>×</span>, danger: true, disabled: true, onClick: event => clicks.push(event.currentTarget) },
        ];
        try {
            await f.render(<FloatingDock ref={ref} items={items} size="compact" embedded showLabels={showLabels} ariaLabel="实际工具" className="caller-position" style={{ left: 12 }} />);
            const toolbar = f.host.querySelector<HTMLElement>('[role="toolbar"]')!; const buttons = f.host.querySelectorAll<HTMLButtonElement>("button");
            expect(ref.current).toBe(toolbar); expect(toolbar.classList.contains("caller-position")).toBe(true);
            expect(toolbar.style.left).toBe("12px"); expect(toolbar.style.getPropertyValue("--dock-item-size")).toBe("28px");
            expect([...buttons].map(button => button.getAttribute("aria-label"))).toEqual(["选择", "设置", "删除"]);
            await act(async () => buttons[0].querySelector<HTMLElement>("[data-icon]")!.click());
            expect(clicks).toEqual([buttons[0]]); expect(buttons[0].getAttribute("aria-pressed")).toBe("true");
            expect(buttons[1].getAttribute("aria-expanded")).toBe("true"); expect(buttons[1].hasAttribute("aria-pressed")).toBe(false);
            await act(async () => buttons[2].click()); expect(clicks.length).toBe(1);
            expect(buttons[2].closest(".aceternity-dock-danger-group")).not.toBeNull();
            expect([...buttons].every(button => !button.style.transform)).toBe(true);
            if (showLabels) expect(buttons[0].querySelector(".aceternity-dock-command-badge")?.textContent).toBe("2");
        } finally { await f.dispose(); }
    }
});

test("real radio arrows move focus with controlled selection; same-value and single-option input do not notify", async () => {
    const f = await fixture(); const changes: string[] = [];
    const options = [{ id: "move", value: "move", label: "移动", icon: <span>+</span> }, { id: "scale", value: "scale", label: "缩放", icon: <span>×</span> }];
    function Controlled() {
        const [value, setValue] = useState("move");
        return <FloatingDock items={[{ kind: "switch", id: "mode", label: "视口模式", value, options, onChange: next => { changes.push(next); setValue(next); } }]} />;
    }
    try {
        await f.render(<Controlled />);
        const radios = f.host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        const persistentThumbs = [...f.host.querySelectorAll<HTMLElement>(".aceternity-dock-switch-thumb")];
        expect(persistentThumbs.length).toBe(radios.length);
        expect(persistentThumbs.every(thumb => thumb.getAttribute("aria-hidden") === "true" && thumb.classList.contains("pointer-events-none"))).toBe(true);
        await act(async () => radios[0].focus()); await key(radios[0], "ArrowRight");
        expect([...f.host.querySelectorAll(".aceternity-dock-switch-thumb")].every((thumb, index) => thumb === persistentThumbs[index])).toBe(true);
        expect(document.activeElement === radios[1]).toBe(true); expect(radios[1].getAttribute("aria-checked")).toBe("true");
        expect(radios[1].tabIndex).toBe(0); expect(radios[0].tabIndex).toBe(-1); expect(changes).toEqual(["scale"]);
        await act(async () => radios[1].click()); expect(changes).toEqual(["scale"]);
        await key(radios[1], "ArrowLeft"); expect(document.activeElement === radios[0]).toBe(true); expect(changes).toEqual(["scale", "move"]);
        expect([...f.host.querySelectorAll(".aceternity-dock-switch-thumb")].every((thumb, index) => thumb === persistentThumbs[index])).toBe(true);
        const thumb = f.host.querySelector<HTMLElement>(".aceternity-dock-switch-thumb")!;
        expect(thumb.getAttribute("aria-hidden")).toBe("true"); expect(thumb.classList.contains("pointer-events-none")).toBe(true);
        expect(thumb.classList.contains("inset-0")).toBe(true); expect(thumb.style.transform).toBe("");
        await f.render(<FloatingDock items={[{ kind: "switch", id: "single", label: "单项模式", value: "scale", options: [options[1]], onChange: next => changes.push(next) }]} />);
        const single = f.host.querySelector<HTMLButtonElement>('[role="radio"]')!;
        await key(single, "ArrowRight"); await key(single, "ArrowLeft"); await act(async () => single.click());
        expect(document.activeElement === single).toBe(true); expect(changes).toEqual(["scale", "move"]);
    } finally { await f.dispose(); }
});

test("radio focus moves without inventing an uncontrolled selected value when the caller rejects a change", async () => {
    const f = await fixture(); const changes: string[] = [];
    try {
        await f.render(<FloatingDock items={[{ kind: "switch", id: "mode", label: "模式", value: "a", options: [{ id: "a", value: "a", label: "甲", icon: "+" }, { id: "b", value: "b", label: "乙", icon: "×" }], onChange: next => changes.push(next) }]} />);
        const radios = f.host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
        await key(radios[0], "ArrowRight"); expect(document.activeElement === radios[1]).toBe(true);
        expect(changes).toEqual(["b"]); expect(radios[0].getAttribute("aria-checked")).toBe("true"); expect(radios[1].getAttribute("aria-checked")).toBe("false");
        await f.render(<FloatingDock items={[{ kind: "switch", id: "empty", label: "空组", value: "", options: [], onChange: next => changes.push(next) }]} />);
        await key(f.host.querySelector<HTMLElement>('[role="radiogroup"]')!, "ArrowRight"); expect(changes).toEqual(["b"]);
    } finally { await f.dispose(); }
});

test("tooltip keeps its position and follows hover / keyboard-visible focus with immediate exit", async () => {
    const f = await fixture();
    try {
        await f.render(<FloatingDock items={[{ id: "tip", label: "提示命令", icon: "+" }]} />);
        const button = f.host.querySelector<HTMLButtonElement>("button")!;
        await mouse(button, "mouseover");
        let tip = f.host.querySelector<HTMLElement>(".aceternity-dock-tooltip")!;
        expect(tip).not.toBeNull(); expect(tip.classList.contains("bottom-full")).toBe(true); expect(tip.classList.contains("left-1/2")).toBe(true); expect(tip.classList.contains("-translate-x-1/2")).toBe(true);
        expect(tip.style.transform.includes("translateY")).toBe(false);
        await mouse(button, "mouseout"); await frame(); expect(f.host.querySelector(".aceternity-dock-tooltip")).toBeNull();
        const matches = button.matches.bind(button); button.matches = selector => selector === ":focus-visible" || matches(selector);
        await act(async () => button.focus()); expect(f.host.querySelector(".aceternity-dock-tooltip")).not.toBeNull();
        await mouse(button, "mousedown"); await frame(); expect(f.host.querySelector(".aceternity-dock-tooltip")).toBeNull();
    } finally { await f.dispose(); }
});

test("reduced tooltip resolves opacity immediately and coarse/narrow pointers retain native title and hit size", async () => {
    const reduced = await fixture({ reduced: true });
    try {
        await reduced.render(<FloatingDock items={[{ id: "tip", label: "减少动态", icon: "+" }, { id: "disabled", label: "禁用", icon: "×", disabled: true }]} />);
        await mouse(reduced.host.querySelector<HTMLButtonElement>("button")!, "mouseover"); await frame();
        const tip = reduced.host.querySelector<HTMLElement>(".aceternity-dock-tooltip")!;
        expect(tip.style.opacity).toBe("1"); expect(tip.style.transform).toBe("");
        await mouse(reduced.host.querySelectorAll<HTMLButtonElement>("button")[1], "mouseover");
        expect([...reduced.host.querySelectorAll(".aceternity-dock-tooltip")].some(node => node.textContent === "禁用")).toBe(false);
    } finally { await reduced.dispose(); }
    for (const setup of [{ pointer: true, width: 1280 }, { pointer: false, width: 390 }]) {
        const f = await fixture(setup);
        try {
            await f.render(<FloatingDock size="compact" items={[{ id: "tip", label: "原生提示", icon: "+" }]} />);
            const button = f.host.querySelector<HTMLButtonElement>("button")!;
            expect(button.title).toBe("原生提示"); await mouse(button, "mouseover"); expect(f.host.querySelector(".aceternity-dock-tooltip")).toBeNull();
            const toolbar = f.host.querySelector<HTMLElement>('[role="toolbar"]')!;
            expect(toolbar.classList.contains("overflow-x-auto")).toBe(true); expect(toolbar.style.getPropertyValue("--dock-item-size")).toBe(setup.pointer ? "36px" : "28px");
        } finally { await f.dispose(); }
    }
});
