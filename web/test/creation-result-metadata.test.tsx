import { afterAll, expect, spyOn, test } from "bun:test";
import { Window } from "happy-dom";
const dom = new Window({ url: "http://localhost/" });
const originals = new Map<string, PropertyDescriptor | undefined>();
for (const [key, value] of Object.entries({ window: dom, document: dom.document, navigator: dom.navigator, localStorage: dom.localStorage, HTMLElement: dom.HTMLElement, SVGElement: dom.SVGElement, Element: dom.Element, Node: dom.Node, ShadowRoot: dom.ShadowRoot, getComputedStyle: dom.getComputedStyle.bind(dom), IS_REACT_ACT_ENVIRONMENT: true })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
afterAll(() => { for (const [key, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, key, descriptor) : Reflect.deleteProperty(globalThis, key); dom.happyDOM.abort(); });
// Test loading boundary: DOM globals must exist before React DOM and UI modules initialize.
const { act } = await import("react");
const { createRoot } = await import("react-dom/client");
const { MediaResult } = await import("../src/pages/create/creation-workspace-messages");
const images = await import("../src/services/image-storage");
import type { CreationMessage } from "../src/pages/create/creation-types";
const files = await import("../src/services/file-storage");
const noop = () => {};

import { GenerationResultMetadata } from "../src/components/ai/generation-result-metadata";

test("compact facts preserve task scope, exact settled cost and full accessible time semantics", async () => {
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const record = { model: "Public model", facts: ["2K", "本次任务合计 · 总耗时 1分23秒", "本次任务合计 · 8.800001积分"], details: ["2560×1440 · 16:9", "任务 ID：task-a"] };
    const original = structuredClone(record);
    try {
        await act(async () => root.render(<GenerationResultMetadata record={record} />));
        expect(Array.from(host.querySelectorAll(".generation-result-metadata-value"), (el) => el.textContent)).toEqual(["2K", "合计 1分23秒", "合计 8.800001积分"]);
        const description = [record.model, ...record.facts, ...record.details].join(" · ");
        expect(host.firstElementChild?.getAttribute("title")).toBe(description);
        expect(host.firstElementChild?.getAttribute("aria-label")).toBe(description);
        expect(record).toEqual(original);
        await act(async () => root.render(<GenerationResultMetadata record={{ model: "", facts: ["", "费用未知"], details: [] }} />));
        expect(host.textContent).toBe("费用未知");
        expect(host.firstElementChild?.getAttribute("aria-label")).toBe("费用未知");
        await act(async () => root.render(<GenerationResultMetadata record={{ model: "Model only", facts: [], details: [] }} />));
        expect(host.textContent).toBe("Model only");
    } finally { await act(async () => root.unmount()); host.remove(); }
});

test("conversation batch shows one summary line and preserves secondary facts in a tooltip", async () => {
    const resolve = spyOn(images, "resolveImageUrl").mockImplementation(async (_key, fallback) => fallback || "/fixture.png");
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const item: CreationMessage = { id: "reply", role: "assistant", mode: "image", content: "", status: "done", model: "old-selector", createdAt: "2026-10-25T00:00:00Z", taskIds: ["task-a"], resultUrls: ["/a.png", "/b.png"], resultStorageKeys: ["local-a", "local-b"], settings: { ratio: "9:16", seconds: "90", quality: "4k", videoQuality: "4k", count: "2" }, resultRecords: ["local-a", "local-b"].map((mediaKey) => ({ mediaKey, taskId: "task-a", model: "Public model", outputCount: 2, createdAt: "2026-10-25T00:00:00Z", completedAt: "2026-10-25T00:02:00Z", includesSave: true, billing: { actualAmountMicrocredits: 8800000, scope: "task" } })) };
    try {
        await act(async () => root.render(<MediaResult item={item} onRetryFailure={noop} onCreateVariant={noop} onContinueCanvas={noop} openingCanvas={false} />));
        expect(host.querySelectorAll(".generation-result-metadata").length).toBe(1);
        const metadata = host.querySelector(".generation-result-metadata")!;
        expect(metadata.textContent?.match(/8.8积分/g)).toHaveLength(1);
        expect(metadata.textContent?.match(/Public model/g)).toHaveLength(1);
        expect(metadata.textContent).not.toContain("4K");
        const image = host.querySelector(".creation-image-result img")!;
        Object.defineProperty(image, "naturalWidth", { value: 1280 }); Object.defineProperty(image, "naturalHeight", { value: 720 });
        await act(async () => image.dispatchEvent(new dom.Event("load")));
        expect(metadata.textContent).toContain("1280×720");
        expect(metadata.textContent).not.toContain("old-selector");
        expect(metadata.querySelector("details, summary, button, [tabindex]")).toBeNull();
        expect(metadata.getAttribute("title")).toContain("task-a");
        expect(metadata.getAttribute("title")).toContain("16:9");
        expect(metadata.querySelector("dl, br, .generation-result-metadata-detail-list")).toBeNull();
    } finally { await act(async () => root.unmount()); host.remove(); resolve.mockRestore(); }
});

test("video metadata uses decoded dimensions and duration while pending cost later becomes explicit settled zero", async () => {
    const resolve = spyOn(files, "resolveMediaUrl").mockResolvedValue("/fixture.mp4");
    const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    const snapshot = { mediaKey: "video:fixture", taskId: "video-task", model: "Public video model", outputCount: 1, billingStatus: "pending" as const };
    const item: CreationMessage = { id: "video-reply", role: "assistant", mode: "video", status: "done", content: "", createdAt: "2026-10-25T00:00:00Z", taskIds: [snapshot.taskId], resultStorageKeys: [snapshot.mediaKey], resultRecords: [snapshot], settings: { ratio: "1:1", seconds: "30", quality: "4k", videoQuality: "4k", count: "1" } };
    try {
        const render = (value: CreationMessage) => root.render(<MediaResult item={value} onRetryFailure={noop} onCreateVariant={noop} onContinueCanvas={noop} openingCanvas={false} />);
        await act(async () => render(item));
        const video = host.querySelector("video")!;
        Object.defineProperty(video, "videoWidth", { value: 720 }); Object.defineProperty(video, "videoHeight", { value: 1280 }); Object.defineProperty(video, "duration", { value: 6 });
        await act(async () => video.dispatchEvent(new dom.Event("loadedmetadata")));
        const metadata = host.querySelector(".generation-result-metadata")!;
        expect(metadata.textContent).toContain("720P");
        expect(metadata.getAttribute("title")).toContain("9:16");
        expect(metadata.textContent).toContain("9:16");
        expect(metadata.getAttribute("title")).toContain("时长 6秒");
        expect(metadata.textContent).toContain("结算中");
        expect(metadata.textContent).not.toContain("30秒");
        expect(metadata.textContent).not.toContain("4K");
        await act(async () => render({ ...item, resultRecords: [{ ...snapshot, billingStatus: undefined, billing: { actualAmountMicrocredits: 0, scope: "result" } }] }));
        expect(metadata.textContent).toContain("0积分");
        expect(metadata.textContent).not.toContain("结算中");
    } finally { await act(async () => root.unmount()); host.remove(); resolve.mockRestore(); }
});
