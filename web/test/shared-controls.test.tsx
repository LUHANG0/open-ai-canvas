import { afterAll, expect, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Element: dom.Element, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
const { act, createRef, useState } = await import("react");
const { createRoot } = await import("react-dom/client");
const { Plus } = await import("lucide-react");
const { IconButton, ToolButton } = await import("@/components/ui/base/buttons");
const { SegmentedControl } = await import("@/components/ui/base/segmented-control");

afterAll(() => {
    dom.happyDOM.abort();
    for (const [key, value] of originals) {
        if (value) Object.defineProperty(globalThis, key, value);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("icon commands forward native ref and handlers, retain toggle false, and block loading activation", async () => {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host); const ref = createRef<HTMLButtonElement>();
    const events: string[] = [];
    await act(async () => root.render(<IconButton ref={ref} icon={Plus} aria-label="新增" active={false} onClick={() => events.push("click")} onKeyDown={() => events.push("key")} />));
    const button = host.querySelector("button")!;
    expect(ref.current).toBe(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await act(async () => { button.focus(); button.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })); button.click(); });
    expect(document.activeElement).toBe(button);
    expect(events).toEqual(["key", "click"]);
    await act(async () => root.render(<IconButton ref={ref} icon={Plus} aria-label="新增" loading onClick={() => events.push("unexpected")} />));
    button.click();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.hasAttribute("aria-pressed")).toBe(false);
    expect(events).not.toContain("unexpected");
    await act(async () => root.unmount()); host.remove();
});

test("tool commands preserve child content and distinguish collapsed panels from unpressed toggles", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    await act(async () => root.render(<><ToolButton active={false} label="全部" count={0} /><ToolButton expands active={false}>面板</ToolButton><ToolButton><Plus data-test-icon /></ToolButton></>));
    const buttons = host.querySelectorAll("button");
    expect(buttons[0].getAttribute("aria-pressed")).toBe("false");
    expect(buttons[0].querySelector('[data-slot="control-count"]')?.textContent).toBe("0");
    expect(buttons[1].getAttribute("aria-expanded")).toBe("false");
    expect(buttons[1].hasAttribute("aria-pressed")).toBe(false);
    expect(buttons[1].textContent).toBe("面板");
    expect(buttons[2].querySelector("svg[data-test-icon]")).not.toBeNull();
    expect(buttons[2].hasAttribute("aria-pressed")).toBe(false);
    await act(async () => root.unmount()); host.remove();
});

test("radio segments skip disabled options and keep focus and selection together for arrows and boundaries", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    function Harness() {
        const [value, setValue] = useState("a");
        return <SegmentedControl ariaLabel="模式" value={value} onChange={setValue} options={[{ value: "a", label: "甲" }, { value: "b", label: "乙", disabled: true }, { value: "c", label: "丙" }]} />;
    }
    await act(async () => root.render(<Harness />));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    const key = async (index: number, key: string) => act(async () => { radios[index].dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
    await key(0, "ArrowRight");
    expect(document.activeElement).toBe(radios[2]); expect(radios[2].getAttribute("aria-checked")).toBe("true");
    await key(2, "ArrowRight");
    expect(document.activeElement).toBe(radios[0]);
    await key(0, "End"); expect(document.activeElement).toBe(radios[2]);
    await key(2, "Home"); expect(document.activeElement).toBe(radios[0]);
    expect(radios[1].tabIndex).toBe(-1);
    await act(async () => root.unmount()); host.remove();
});

test("a disabled selection retains its value but leaves a usable keyboard entry, and whole-group disable removes it", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const options = [{ value: "a", label: "甲", disabled: true }, { value: "b", label: "乙" }];
    await act(async () => root.render(<SegmentedControl value="a" options={options} />));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    expect(radios[0].getAttribute("aria-checked")).toBe("true"); expect(radios[1].tabIndex).toBe(0);
    await act(async () => root.render(<SegmentedControl disabled value="a" options={options} />));
    expect(radios[0].getAttribute("aria-checked")).toBe("true"); expect([...radios].every((radio) => radio.disabled && radio.tabIndex === -1)).toBe(true);
    await act(async () => root.unmount()); host.remove();
});

test("radio segments notify only changed values while same-value clicks and boundary keys retain focus", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    function Harness() {
        const [value, setValue] = useState("a");
        return <SegmentedControl value={value} onChange={(next) => { changes.push(next); setValue(next); }} options={[{ value: "a", label: "甲" }, { value: "b", label: "乙", disabled: true }, { value: "c", label: "丙" }]} />;
    }
    await act(async () => root.render(<Harness />));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    const key = async (index: number, key: string) => act(async () => { radios[index].dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
    await act(async () => radios[0].click());
    await key(0, "Home");
    expect(changes).toEqual([]); expect(document.activeElement).toBe(radios[0]);
    await key(0, "End");
    expect(changes).toEqual(["c"]); expect(document.activeElement).toBe(radios[2]);
    await key(2, "End");
    await act(async () => { radios[2].click(); radios[1].click(); });
    expect(changes).toEqual(["c"]);
    await key(2, "ArrowLeft");
    expect(changes).toEqual(["c", "a"]); expect(document.activeElement).toBe(radios[0]);
    await act(async () => radios[2].click());
    expect(changes).toEqual(["c", "a", "c"]);
    await act(async () => root.unmount()); host.remove();
});

test("a single enabled radio does not notify for arrows or Home/End, and a disabled group never notifies", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const changes: string[] = [];
    const options = [{ value: "a", label: "甲" }, { value: "b", label: "乙", disabled: true }];
    const onChange = (next: string) => changes.push(next);
    await act(async () => root.render(<SegmentedControl value="a" options={options} onChange={onChange} />));
    const radios = host.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
        await act(async () => { radios[0].dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
        expect(document.activeElement).toBe(radios[0]);
    }
    await act(async () => { radios[0].click(); radios[1].click(); });
    expect(changes).toEqual([]);
    await act(async () => root.render(<SegmentedControl disabled value="b" options={options} onChange={onChange} />));
    await act(async () => { radios[0].click(); radios[1].click(); radios[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true })); });
    expect(changes).toEqual([]);
    await act(async () => root.unmount()); host.remove();
});
