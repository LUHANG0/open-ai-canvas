import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Window } from "happy-dom";
import { MengCengMark } from "../src/components/brand/brand-mark";
import { BrandLogo } from "../src/components/brand/brand-logo";
import { applyAppearanceMetadata, normalizePublicAppearance, useAppearanceStore } from "../src/stores/use-appearance-store";

test("the approved portal paths match the favicon and gradient IDs remain unique", async () => {
    const markup = renderToStaticMarkup(<><MengCengMark /><MengCengMark /></>);
    const dom = new Window();
    dom.document.body.innerHTML = markup;
    try {
        const ids = [...dom.document.querySelectorAll("linearGradient")].map((gradient) => gradient.id);
        expect(new Set(ids).size).toBe(2);
        for (const group of dom.document.querySelectorAll("g")) expect(ids).toContain(group.getAttribute("fill")!.slice(5, -1));
        const staticDOM = new Window();
        staticDOM.document.body.innerHTML = await Bun.file(new URL("../public/logo.svg", import.meta.url)).text();
        expect([...staticDOM.document.querySelectorAll("path")].map((path) => path.getAttribute("d"))).toEqual([...dom.document.querySelector("svg")!.querySelectorAll("path")].map((path) => path.getAttribute("d")));
        expect(staticDOM.document.querySelector("rect")).toBeNull();
        expect(markup).toContain("#29d2cf");
        expect(markup).toContain("#9b4eff");
        staticDOM.happyDOM.abort();
    } finally { dom.happyDOM.abort(); }
});

test("built-in marks stay colorful while configured logos keep their own source and failure boundary", async () => {
    const previous = useAppearanceStore.getState();
    const dom = new Window({ url: "http://localhost/" });
    const globals = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, HTMLElement: dom.HTMLElement, Node: dom.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
        globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
        Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const { act } = await import("react");
    const { createRoot } = await import("react-dom/client");
    const host = dom.document.createElement("div"); dom.document.body.append(host);
    const root = createRoot(host);
    try {
        useAppearanceStore.setState({ appearance: normalizePublicAppearance({ logoConfigured: false }) });
        await act(async () => root.render(<BrandLogo theme="dark" fallback={<span>fallback</span>} />));
        const builtin = host.innerHTML;
        expect(builtin).toContain("linearGradient");
        expect(builtin).not.toContain("currentColor");
        await act(async () => useAppearanceStore.setState({ appearance: normalizePublicAppearance({ logoConfigured: true, logoUrl: "/custom-light.png", darkLogoUrl: "/custom-dark.png" }) }));
        const custom = host.innerHTML;
        expect(custom).toContain('src="/custom-dark.png"');
        expect(custom).not.toContain("linearGradient");
        await act(async () => host.querySelector("img")!.dispatchEvent(new dom.Event("error", { bubbles: true })));
        expect(host.querySelector("svg")).toBeNull();
        expect(host.querySelector("img")).toBeNull();
    } finally {
        await act(async () => root.unmount()); useAppearanceStore.setState(previous); dom.happyDOM.abort();
        for (const [key, descriptor] of globals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
    }
});

test("metadata uses the crawlable PNG favicon without forcing its type or dimensions on custom images", () => {
    const dom = new Window({ url: "http://localhost/" });
    try {
        applyAppearanceMetadata(normalizePublicAppearance({ logoConfigured: false }), dom.document as unknown as Document);
        const icon = dom.document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;
        expect(icon.href).toBe("http://localhost/favicon.png");
        expect(icon.type).toBe("image/png");
        expect(icon.getAttribute("sizes")).toBe("192x192");
        applyAppearanceMetadata(normalizePublicAppearance({ logoConfigured: true, logoUrl: "/custom.png" }), dom.document as unknown as Document);
        expect(icon.href).toBe("http://localhost/custom.png");
        expect(icon.getAttribute("type")).toBeNull();
        expect(icon.getAttribute("sizes")).toBeNull();
    } finally { dom.happyDOM.abort(); }
});
