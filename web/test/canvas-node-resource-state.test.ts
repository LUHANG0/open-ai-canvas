import { describe, expect, test } from "bun:test";
import {
    beginCanvasNodeResourceRequest,
    createCanvasNodeResourceState,
    finishCanvasNodeResourceRequest,
    readCanvasNodeResourceState,
    type CanvasNodeResourceRequest,
    type CanvasNodeResourceSource,
} from "../src/lib/canvas/canvas-node-resource-state";

function resource(id: string, remote = true): CanvasNodeResourceSource {
    return { storageKey: remote ? `resource:${id}` : "", fallback: `/test-${id}.mp4`, remote };
}

function deferred() {
    let resolve!: (url: string) => void;
    const promise = new Promise<string>((done) => { resolve = done; });
    return { promise, resolve };
}

describe("画布节点资源 URL 状态", () => {
    test("同源在懒加载与主动加载之间切换，已解析 URL 始终连续", () => {
        const source = resource("video");
        let state = createCanvasNodeResourceState(source, false);
        const first = { source, download: false };
        state = beginCanvasNodeResourceRequest(state, first);
        state = finishCanvasNodeResourceRequest(state, first, "blob:video");
        const observed: string[] = [state.url];
        for (const download of [true, false, true]) {
            const request = { source, download };
            observed.push(readCanvasNodeResourceState(state, source, download).url);
            state = beginCanvasNodeResourceRequest(state, request);
            observed.push(state.url);
            expect(state.loading).toBe(false);
            state = finishCanvasNodeResourceRequest(state, request, "blob:video");
            observed.push(state.url);
        }
        expect(new Set(observed)).toEqual(new Set(["blob:video"]));
    });

    test("同源缓存未命中或读取失败不清除已解析 URL", () => {
        const source = resource("video");
        const first = { source, download: true };
        let state = finishCanvasNodeResourceRequest(beginCanvasNodeResourceRequest(createCanvasNodeResourceState(source, true), first), first, "blob:video");
        for (const download of [false, true]) {
            const request = { source, download };
            state = finishCanvasNodeResourceRequest(beginCanvasNodeResourceRequest(state, request), request, "");
            expect(state.url).toBe("blob:video");
            expect(state.loading).toBe(false);
        }
    });

    test("换远程资源的首次渲染立即隐藏旧 URL，不等待 effect 重置", () => {
        const oldSource = resource("old");
        const nextSource = resource("next");
        const oldRequest = { source: oldSource, download: true };
        const oldState = finishCanvasNodeResourceRequest(beginCanvasNodeResourceRequest(createCanvasNodeResourceState(oldSource, true), oldRequest), oldRequest, "blob:old");
        expect(readCanvasNodeResourceState(oldState, nextSource, true)).toMatchObject({ source: nextSource, url: "", loading: true });
        expect(readCanvasNodeResourceState(oldState, nextSource, false)).toMatchObject({ source: nextSource, url: "", loading: false });
        const localSource = resource("local", false);
        expect(readCanvasNodeResourceState(oldState, localSource, true)).toMatchObject({ source: localSource, url: "/test-local.mp4", loading: false });
    });

    test("旧源显式下载晚于新源完成，不能覆盖新源或清除其加载状态", async () => {
        const oldSource = resource("old");
        const nextSource = resource("next");
        const oldRequest = { source: oldSource, download: true };
        const nextRequest = { source: nextSource, download: true };
        const oldDownload = deferred();
        const nextDownload = deferred();
        let state = beginCanvasNodeResourceRequest(createCanvasNodeResourceState(oldSource, true), oldRequest);
        const oldCompletion = oldDownload.promise.then((url) => { state = finishCanvasNodeResourceRequest(state, oldRequest, url); });
        state = beginCanvasNodeResourceRequest(state, nextRequest);
        const nextCompletion = nextDownload.promise.then((url) => { state = finishCanvasNodeResourceRequest(state, nextRequest, url); });
        nextDownload.resolve("blob:next");
        await nextCompletion;
        oldDownload.resolve("blob:old");
        await oldCompletion;
        expect(state).toMatchObject({ source: nextSource, url: "blob:next", loading: false });

        const pendingRequest = { source: resource("pending"), download: true };
        state = beginCanvasNodeResourceRequest(state, pendingRequest);
        const pendingState = state;
        expect(finishCanvasNodeResourceRequest(state, oldRequest, "")).toBe(pendingState);
        expect(state.loading).toBe(true);
    });

    test("显式下载开始后，较早的缓存未命中结果不能结束当前加载", async () => {
        const source = resource("video");
        const cachedRequest = { source, download: false };
        const loadRequest = { source, download: true };
        const cached = deferred();
        let state = beginCanvasNodeResourceRequest(createCanvasNodeResourceState(source, false), cachedRequest);
        const cachedCompletion = cached.promise.then((url) => { state = finishCanvasNodeResourceRequest(state, cachedRequest, url); });
        state = beginCanvasNodeResourceRequest(state, loadRequest);
        cached.resolve("");
        await cachedCompletion;
        expect(state).toMatchObject({ url: "", loading: true, request: loadRequest });
        state = finishCanvasNodeResourceRequest(state, loadRequest, "blob:video");
        expect(state).toMatchObject({ url: "blob:video", loading: false, request: null });
    });

    test("同一资源离开再返回后，先前会话的结果仍不能接管新请求", () => {
        const oldSource = resource("video");
        const newSource = resource("video");
        const oldRequest = { source: oldSource, download: true };
        const currentRequest = { source: newSource, download: true };
        const current = beginCanvasNodeResourceRequest(createCanvasNodeResourceState(newSource, true), currentRequest);
        expect(finishCanvasNodeResourceRequest(current, oldRequest, "blob:old-session")).toBe(current);
    });

    test("远程资源只有主动下载失败时使用回退地址，缓存查询不提前加载", () => {
        const source = resource("video");
        for (const download of [false, true]) {
            const request: CanvasNodeResourceRequest = { source, download };
            const state = finishCanvasNodeResourceRequest(beginCanvasNodeResourceRequest(createCanvasNodeResourceState(source, download), request), request, "");
            expect(state.url).toBe(download ? "/test-video.mp4" : "");
            expect(state.loading).toBe(false);
        }
    });
});
