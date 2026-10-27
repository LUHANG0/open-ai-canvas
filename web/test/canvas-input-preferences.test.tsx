import { afterAll, afterEach, expect, test } from "bun:test";
import { Window } from "happy-dom";
import { act } from "react";

import { scopedStorageKey } from "../src/lib/user-scope";
import { useUserStore, type LocalUser } from "../src/stores/use-user-store";
import {
    CANVAS_INPUT_PREFERENCES_KEY,
    DEFAULT_CANVAS_INPUT_PREFERENCES,
    canvasInputPreferencesStore,
    useCanvasInputEntry,
    useCanvasInputPreferences,
} from "../src/stores/canvas/use-canvas-input-preferences";

const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
// React DOM must initialize after the test installs its browser globals.
const { createRoot } = await import("react-dom/client");

const state = canvasInputPreferencesStore.getState;
function login(id: string | null) {
    useUserStore.setState({ hydrated: false });
    useUserStore.setState({ user: id ? { id } as LocalUser : null });
    useUserStore.setState({ hydrated: true });
}
const key = (scope: string) => scopedStorageKey(CANVAS_INPUT_PREFERENCES_KEY, scope);

afterEach(() => {
    useUserStore.setState({ hydrated: false, user: null });
    dom.localStorage.clear();
});
afterAll(async () => {
    await dom.happyDOM.abort();
    for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
    }
});

test("defaults preserve box selection and wheel zoom, and blank drag applies immediately", () => {
    login("one");
    expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    expect(state().canvasTool).toBe("box-select");
    state().updatePreferences({ blankDrag: "pan", mouseWheel: "pan" });
    expect(state().canvasTool).toBe("move");
    expect(JSON.parse(dom.localStorage.getItem(key("one"))!).preferences.blankDrag).toBe("pan");
});

test("remembered tool wins only on entry while disabling remember uses configured default next entry", () => {
    login("one");
    state().updatePreferences({ blankDrag: "pan", rememberTool: true });
    state().setCanvasTool("box-select");
    login("one");
    state().initializeEntry();
    expect(state().canvasTool).toBe("box-select");
    state().updatePreferences({ rememberTool: false });
    expect(state().canvasTool).toBe("box-select");
    state().initializeEntry();
    expect(state().canvasTool).toBe("move");
    state().updatePreferences({ blankDrag: "box-select", rememberTool: true });
    expect(state().canvasTool).toBe("box-select");
    state().updatePreferences({ blankDrag: "pan" });
    expect(state().canvasTool).toBe("move");
});

test("reset removes remembered tool and persists defaults across re-entry", () => {
    login("one");
    state().updatePreferences({ rememberTool: true, blankDrag: "pan", mouseWheel: "pan" });
    state().setCanvasTool("move");
    state().resetPreferences();
    expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    expect(state().lastTool).toBeNull();
    expect(dom.localStorage.getItem(key("one"))).toBeNull();
    login("one");
    state().initializeEntry();
    expect(state().canvasTool).toBe("box-select");
    expect(state().lastTool).toBeNull();
});

test("pending session hides old preferences and does not read the prematurely switched storage scope", () => {
    login("one");
    state().updatePreferences({ blankDrag: "pan", rememberTool: true });
    dom.localStorage.setItem("yingce:active-user-scope", "one");
    useUserStore.setState({ hydrated: false });
    expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    expect(state().scope).toBeNull();
    state().updatePreferences({ mouseWheel: "pan" });
    useUserStore.setState({ user: { id: "two" } as LocalUser });
    expect(state().scope).toBeNull();
    useUserStore.setState({ hydrated: true });
    expect(state().scope).toBe("two");
    expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    state().updatePreferences({ mouseWheel: "pan" });
    login("one");
    expect(state().preferences.blankDrag).toBe("pan");
    expect(state().preferences.mouseWheel).toBe("zoom");
    login(null);
    expect(state().scope).toBe("guest");
    expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    state().updatePreferences({ mouseWheel: "pan" });
    login("two");
    expect(state().preferences.blankDrag).toBe("box-select");
    login(null);
    expect(state().preferences.mouseWheel).toBe("pan");
});

test("malformed storage is normalized without trusting invalid tools or types", () => {
    for (const raw of ["{broken", "null", "[]", JSON.stringify({ preferences: { blankDrag: "fly", mouseWheel: 1, rememberTool: "yes" }, lastTool: "fly" })]) {
        useUserStore.setState({ hydrated: false });
        dom.localStorage.setItem(key("one"), raw);
        login("one");
        expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
        expect(state().lastTool).toBeNull();
        expect(dom.localStorage.getItem(key("one"))).toBe(raw);
    }
});

test("blocked storage never breaks input, account switching, or reset", () => {
    const descriptor = Object.getOwnPropertyDescriptor(dom, "localStorage");
    Object.defineProperty(dom, "localStorage", { configurable: true, get() { throw new Error("blocked"); } });
    try {
        expect(() => login("one")).not.toThrow();
        state().updatePreferences({ blankDrag: "pan", rememberTool: true });
        state().setCanvasTool("box-select");
        state().initializeEntry();
        expect(state().canvasTool).toBe("box-select");
        expect(state().preferences.blankDrag).toBe("pan");
        expect(() => state().resetPreferences()).not.toThrow();
        expect(state().lastTool).toBeNull();
        expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
        state().updatePreferences({ mouseWheel: "pan" });
        login("two");
        expect(state().preferences).toEqual(DEFAULT_CANVAS_INPUT_PREFERENCES);
    } finally {
        if (descriptor) Object.defineProperty(dom, "localStorage", descriptor);
        else Reflect.deleteProperty(dom, "localStorage");
    }
});

test("modal subscriptions do not reset active tool; route unmount/reentry initializes it", async () => {
    login("one");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    function Route({ entryKey }: { entryKey: string }) {
        useCanvasInputEntry(entryKey);
        const { canvasTool } = useCanvasInputPreferences();
        return <span>{canvasTool}</span>;
    }
    function Modal() {
        const { preferences } = useCanvasInputPreferences();
        return <aside>{preferences.blankDrag}</aside>;
    }
    try {
        await act(async () => { root.render(<><Route entryKey="project-one" /></>); });
        await act(async () => { state().setCanvasTool("move"); });
        await act(async () => { root.render(<><Route entryKey="project-one" /><Modal /></>); });
        expect(state().canvasTool).toBe("move");
        await act(async () => { root.render(<><Route entryKey="project-one" /></>); });
        expect(state().canvasTool).toBe("move");
        await act(async () => { root.render(null); });
        await act(async () => { root.render(<Route entryKey="project-one" />); });
        expect(state().canvasTool).toBe("box-select");
        await act(async () => {
            state().updatePreferences({ rememberTool: true });
            state().setCanvasTool("move");
        });
        await act(async () => { root.render(null); });
        await act(async () => { root.render(<Route entryKey="project-two" />); });
        expect(state().canvasTool).toBe("move");
    } finally {
        await act(async () => { root.unmount(); });
        host.remove();
    }
});
