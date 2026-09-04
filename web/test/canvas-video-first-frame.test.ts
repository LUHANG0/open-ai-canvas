import { describe, expect, test } from "bun:test";

import { waitForCanvasVideoFirstFrame } from "../src/lib/canvas/canvas-video-first-frame";

class FakeVideo extends EventTarget {
    src = "https://media.invalid/first.mp4";
    currentSrc = this.src;
    currentTime = 0;
    readyState = 0;
    videoWidth = 0;
    videoHeight = 0;
    seeking = false;
    paused = false;
    error: MediaError | null = null;
    totalVideoFrames = 0;
    videoFrames = new Map<number, VideoFrameRequestCallback>();
    cancelledFrames: number[] = [];
    private nextFrame = 0;
    requestVideoFrameCallback?: (callback: VideoFrameRequestCallback) => number;

    constructor(supportsVideoFrames = true) {
        super();
        if (supportsVideoFrames) this.requestVideoFrameCallback = (callback) => {
            const handle = this.nextFrame++;
            this.videoFrames.set(handle, callback);
            return handle;
        };
    }

    cancelVideoFrameCallback = (handle: number) => {
        this.cancelledFrames.push(handle);
        this.videoFrames.delete(handle);
    };
    getVideoPlaybackQuality = () => ({ totalVideoFrames: this.totalVideoFrames }) as VideoPlaybackQuality;
    emit(type: string) { this.dispatchEvent(new Event(type)); }
    loadFrame() {
        this.readyState = 2;
        this.videoWidth = 864;
        this.videoHeight = 496;
    }
    present(mediaTime = this.currentTime) {
        const next = this.videoFrames.entries().next().value;
        if (!next) throw new Error("No requested video frame");
        const [handle, callback] = next;
        this.videoFrames.delete(handle);
        callback(0, { mediaTime } as VideoFrameCallbackMetadata);
    }
}

function frameHarness() {
    let nextHandle = 0;
    const pending = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];
    const scheduler = {
        request: (callback: FrameRequestCallback) => {
            const handle = nextHandle++;
            pending.set(handle, callback);
            return handle;
        },
        cancel: (handle: number) => { cancelled.push(handle); pending.delete(handle); },
    };
    const step = () => {
        const next = pending.entries().next().value;
        if (!next) throw new Error("No requested animation frame");
        const [handle, callback] = next;
        pending.delete(handle);
        callback(0);
    };
    return { scheduler, pending, cancelled, step };
}

function observe(video: FakeVideo) {
    const frames = frameHarness();
    let readyCount = 0;
    const cancel = waitForCanvasVideoFirstFrame(video as unknown as HTMLVideoElement, () => { readyCount++; }, frames.scheduler);
    return { frames, cancel, readyCount: () => readyCount };
}

describe("canvas video first presented frame", () => {
    test("媒体事件或帧回调在readyState不足时不能揭开封面", () => {
        const video = new FakeVideo();
        video.readyState = 1;
        video.videoWidth = 864;
        video.videoHeight = 496;
        const watcher = observe(video);
        for (const type of ["loadeddata", "canplay", "playing", "seeked"]) video.emit(type);
        video.present();
        expect(watcher.readyCount()).toBe(0);
        expect(watcher.frames.pending.size).toBe(0);
        expect(video.videoFrames.size).toBe(1);
        video.readyState = 2;
        video.emit("loadeddata");
        video.present();
        expect(watcher.readyCount()).toBe(1);
    });

    test("RVFC确认当前帧后只回调一次并释放监听", () => {
        const video = new FakeVideo();
        video.loadFrame();
        const watcher = observe(video);
        video.emit("canplay");
        expect(watcher.readyCount()).toBe(0);
        expect(video.videoFrames.size).toBe(1);
        video.present();
        expect(watcher.readyCount()).toBe(1);
        expect(video.videoFrames.size).toBe(0);
        for (const type of ["loadeddata", "canplay", "playing", "seeked"]) video.emit(type);
        expect(video.videoFrames.size).toBe(0);
        expect(watcher.frames.pending.size).toBe(0);
        watcher.cancel();
        expect(watcher.readyCount()).toBe(1);
    });

    for (const invalid of ["width", "height", "seeking", "error"] as const) {
        test(`${invalid}无效时即使收到RVFC也继续保留封面`, () => {
            const video = new FakeVideo();
            video.loadFrame();
            if (invalid === "width") video.videoWidth = 0;
            if (invalid === "height") video.videoHeight = 0;
            if (invalid === "seeking") video.seeking = true;
            if (invalid === "error") video.error = { code: 3 } as MediaError;
            const watcher = observe(video);
            video.present();
            expect(watcher.readyCount()).toBe(0);
            video.loadFrame();
            video.seeking = false;
            video.error = null;
            video.present();
            expect(watcher.readyCount()).toBe(1);
        });
    }

    test("seek期间和seek完成后迟到的旧帧都不能代替目标帧", () => {
        const video = new FakeVideo();
        video.loadFrame();
        const watcher = observe(video);
        video.currentTime = 6;
        video.seeking = true;
        video.present(0);
        expect(watcher.readyCount()).toBe(0);
        video.seeking = false;
        video.emit("seeked");
        video.present(0);
        expect(watcher.readyCount()).toBe(0);
        video.present(6);
        expect(watcher.readyCount()).toBe(1);
    });

    test("离开后取消RVFC，即使回调迟到也不能揭开封面或重新排队", () => {
        const video = new FakeVideo();
        video.loadFrame();
        const watcher = observe(video);
        const lateFrame = [...video.videoFrames.values()][0];
        watcher.cancel();
        watcher.cancel();
        expect(video.cancelledFrames).toEqual([0]);
        lateFrame(0, { mediaTime: 0 } as VideoFrameCallbackMetadata);
        video.emit("canplay");
        expect(watcher.readyCount()).toBe(0);
        expect(video.videoFrames.size).toBe(0);
    });

    for (const type of ["loadstart", "emptied"]) {
        test(`${type}使旧源观察失效，新源可以独立确认首帧`, () => {
            const video = new FakeVideo();
            video.loadFrame();
            const previous = observe(video);
            const lateFrame = [...video.videoFrames.values()][0];
            video.emit(type);
            video.src = video.currentSrc = "https://media.invalid/replacement.mp4";
            lateFrame(0, { mediaTime: 0 } as VideoFrameCallbackMetadata);
            video.emit("canplay");
            expect(previous.readyCount()).toBe(0);
            expect(video.videoFrames.size).toBe(0);
            const current = observe(video);
            video.present();
            expect(current.readyCount()).toBe(1);
            expect(previous.readyCount()).toBe(0);
        });
    }

    test("源地址已经变化时旧RVFC不能揭开新源封面", () => {
        const video = new FakeVideo();
        video.loadFrame();
        const watcher = observe(video);
        video.currentSrc = "https://media.invalid/replacement.mp4";
        video.present();
        expect(watcher.readyCount()).toBe(0);
        watcher.cancel();
    });

    test("没有RVFC时等待有效画面和两次动画帧后揭开封面", () => {
        const video = new FakeVideo(false);
        const watcher = observe(video);
        video.emit("canplay");
        expect(watcher.frames.pending.size).toBe(0);
        video.loadFrame();
        video.emit("loadeddata");
        video.emit("canplay");
        expect(watcher.frames.pending.size).toBe(1);
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(0);
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(1);
        video.emit("playing");
        expect(watcher.frames.pending.size).toBe(0);
    });

    test("动画帧回退在揭开前再次校验seek状态，seeked后可重新探测", () => {
        const video = new FakeVideo(false);
        video.loadFrame();
        const watcher = observe(video);
        watcher.frames.step();
        video.seeking = true;
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(0);
        video.seeking = false;
        video.emit("seeked");
        watcher.frames.step();
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(1);
    });

    test("已呈现画面的暂停播放器即使没有后续RVFC也能补确认", () => {
        const video = new FakeVideo();
        video.loadFrame();
        video.paused = true;
        video.totalVideoFrames = 1;
        const watcher = observe(video);
        expect(video.videoFrames.size).toBe(1);
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(0);
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(1);
        expect(video.videoFrames.size).toBe(0);
        expect(video.cancelledFrames).toEqual([0]);
    });

    test("暂停但尚未呈现任何画面时不能用rAF假定已有首帧", () => {
        const video = new FakeVideo();
        video.loadFrame();
        video.paused = true;
        const watcher = observe(video);
        expect(watcher.frames.pending.size).toBe(0);
        expect(watcher.readyCount()).toBe(0);
        video.totalVideoFrames = 1;
        video.emit("loadeddata");
        watcher.frames.step();
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(1);
    });

    test("取消后迟到的第一段rAF不能继续排队", () => {
        const video = new FakeVideo(false);
        video.loadFrame();
        const watcher = observe(video);
        const lateFrame = [...watcher.frames.pending.values()][0];
        watcher.cancel();
        expect(watcher.frames.cancelled).toEqual([0]);
        lateFrame(0);
        expect(watcher.readyCount()).toBe(0);
        expect(watcher.frames.pending.size).toBe(0);
    });

    test("收到pause时为已经呈现但不再送RVFC的画面补探测", () => {
        const video = new FakeVideo();
        video.loadFrame();
        const watcher = observe(video);
        expect(watcher.frames.pending.size).toBe(0);
        video.totalVideoFrames = 1;
        video.paused = true;
        video.emit("pause");
        expect(watcher.frames.pending.size).toBe(1);
        watcher.frames.step();
        watcher.frames.step();
        expect(watcher.readyCount()).toBe(1);
    });
});
