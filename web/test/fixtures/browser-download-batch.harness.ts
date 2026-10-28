import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { Window } from "happy-dom";

const dom = new Window({ url: "http://localhost/" });
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "window", { configurable: true, value: dom });
Object.defineProperty(globalThis, "document", { configurable: true, value: dom.document });
const { setActiveUserScope } = await import("../../src/lib/user-scope");
const lookups: { key: string; purpose: string; variant: string; name: string }[] = [];
const clicks: { href: string; name: string }[] = [];
let lookup = (key: string): Promise<{ url: string }> => Promise.resolve({ url: `https://media.example/${key}` });
let onClick = () => {};
const suppress = mock(() => {});
mock.module("../../src/stores/use-sync-progress-store", () => ({ suppressBeforeUnloadGuard: suppress }));
mock.module("../../src/services/api/resources", () => ({
    resourceIdFromStorageKey: (key?: string) => key?.startsWith("resource:") ? key.slice(9) : "",
    resolveResourceAccessURL: (url: string) => url,
    getResourceAccess: (key: string, purpose: string, variant: string, name: string) => { lookups.push({ key, purpose, variant, name }); return lookup(key); },
}));
const { downloadBrowserMediaBatch, downloadBrowserMedia, startBrowserDownload } = await import("../../src/services/browser-download");
const originalClick = dom.HTMLAnchorElement.prototype.click;
dom.HTMLAnchorElement.prototype.click = function () { onClick(); clicks.push({ href: this.getAttribute("href")!, name: this.download }); };
const item = (index: number) => ({ storageKey: `resource:${index}`, fileName: `媒体-${index}.png` });
beforeEach(() => { setActiveUserScope("user-a"); lookups.length = 0; clicks.length = 0; suppress.mockClear(); onClick = () => {}; lookup = (key) => Promise.resolve({ url: `https://media.example/${key}` }); });

test("single downloads keep server download access and browser handoff", async () => {
    await downloadBrowserMedia(item(1));
    expect(lookups).toEqual([{ key: "resource:1", purpose: "download", variant: "original", name: "媒体-1.png" }]);
    expect(clicks).toEqual([{ href: "https://media.example/resource:1", name: "媒体-1.png" }]);
    expect(suppress).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll("a").length).toBe(0);
});
test("batch downloads use bounded signing windows, preserve order and continue after a denied resource", async () => {
    const lookupCountsAtClick: number[] = [];
    onClick = () => lookupCountsAtClick.push(lookups.length);
    lookup = async (key) => { if (key === "resource:2") throw new Error("denied"); return { url: `https://media.example/${key}` }; };
    const result = await downloadBrowserMediaBatch([item(1), item(2), item(3), item(4)]);
    expect(result).toEqual({ started: 3, failed: 1, cancelled: false });
    expect(clicks.map((click) => click.name)).toEqual(["媒体-1.png", "媒体-3.png", "媒体-4.png"]);
    expect(lookupCountsAtClick).toEqual([3, 3, 4]);
});
test("cancelling a pending lookup releases the operation immediately and ignores late signed URLs", async () => {
    const pending: ((value: { url: string }) => void)[] = [];
    lookup = () => new Promise((resolve) => pending.push(resolve));
    const controller = new AbortController();
    const request = downloadBrowserMediaBatch([item(1), item(2), item(3), item(4)], { signal: controller.signal });
    expect(lookups.length).toBe(3);
    controller.abort();
    expect(await request).toEqual({ started: 0, failed: 0, cancelled: true });
    pending.forEach((resolve) => resolve({ url: "https://media.example/late" }));
    await Promise.resolve(); await Promise.resolve();
    expect(clicks).toEqual([]); expect(lookups.length).toBe(3);
});
test("an already cancelled batch never requests a download address", async () => {
    const controller = new AbortController(); controller.abort();
    expect(await downloadBrowserMediaBatch([item(1)], { signal: controller.signal })).toEqual({ started: 0, failed: 0, cancelled: true });
    expect(lookups).toEqual([]); expect(clicks).toEqual([]);
});

test("an account change between browser handoffs stops the remaining files", async () => {
    onClick = () => { setTimeout(() => setActiveUserScope("user-b"), 10); };
    const result = await downloadBrowserMediaBatch([item(1), item(2), item(3), item(4)]);
    expect(result).toEqual({ started: 1, failed: 0, cancelled: true });
    expect(clicks.length).toBe(1); expect(lookups.length).toBe(3);
});
test("single-file lookup cannot hand credentials to a different account", async () => {
    lookup = async () => { setActiveUserScope("user-b"); return { url: "https://media.example/old-account" }; };
    await expect(downloadBrowserMedia(item(1))).rejects.toMatchObject({ name: "AbortError" });
    expect(clicks).toEqual([]);
});
test("unsupported active URL schemes never reach a browser handoff", async () => {
    await expect(downloadBrowserMedia({ fileName: "unsafe.png", url: "javascript:void(0)" })).rejects.toThrow("下载地址无效");
    expect(clicks).toEqual([]);
});

test("browser handoff errors do not leave anchors or stop unrelated batch files", async () => {
    let attempt = 0;
    onClick = () => { if (++attempt === 1) throw new Error("blocked"); };
    expect(await downloadBrowserMediaBatch([item(1), item(2)])).toEqual({ started: 1, failed: 1, cancelled: false });
    expect(document.querySelectorAll("a").length).toBe(0);
    expect(() => { onClick = () => { throw new Error("blocked"); }; startBrowserDownload("blob:local", "local.png"); }).toThrow("blocked");
    expect(document.querySelectorAll("a").length).toBe(0);
});

afterAll(async () => {
    dom.HTMLAnchorElement.prototype.click = originalClick;
    mock.restore(); await dom.happyDOM.abort();
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow); else Reflect.deleteProperty(globalThis, "window");
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument); else Reflect.deleteProperty(globalThis, "document");
});
