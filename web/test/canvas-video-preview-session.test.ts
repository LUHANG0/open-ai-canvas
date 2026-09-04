import { describe, expect, spyOn, test } from "bun:test";

import { createCanvasVideoPreviewGroup } from "../src/lib/canvas/canvas-video-preview-session";

function previewHarness() {
    const scheduled: Array<{ callback: () => void; cancelled: boolean }> = [];
    const events: string[] = [];
    const group = createCanvasVideoPreviewGroup((callback) => {
        const timer = { callback, cancelled: false };
        scheduled.push(timer);
        return () => { timer.cancelled = true; };
    });
    const createSession = (name: string) => group.createSession({
        start: () => { events.push(`${name}:start`); },
        stop: () => { events.push(`${name}:stop`); },
    });
    return { scheduled, events, createSession };
}

describe("canvas video preview session", () => {
    test("默认等待180ms，离开会清除尚未触发的播放", () => {
        let activate: (() => void) | undefined;
        const timer = 123 as unknown as ReturnType<typeof setTimeout>;
        const schedule = spyOn(globalThis, "setTimeout").mockImplementation((callback) => {
            activate = callback as () => void;
            return timer;
        });
        const cancel = spyOn(globalThis, "clearTimeout").mockImplementation(() => undefined);
        try {
            const events: string[] = [];
            const session = createCanvasVideoPreviewGroup().createSession({
                start: () => { events.push("start"); },
                stop: () => { events.push("stop"); },
            });
            session.start();
            expect(schedule).toHaveBeenCalledTimes(1);
            expect(schedule.mock.calls[0]?.[1]).toBe(180);
            expect(events).toEqual([]);
            expect(session.isActive()).toBe(false);
            session.stop();
            expect(cancel).toHaveBeenCalledWith(timer);
            activate?.();
            expect(events).toEqual(["stop"]);
            expect(session.isActive()).toBe(false);
        } finally {
            schedule.mockRestore();
            cancel.mockRestore();
        }
    });

    test("重复进入不会重排等待，活动期间重复开始不会重播", () => {
        const { createSession, scheduled, events } = previewHarness();
        const session = createSession("video");
        session.start();
        const token = session.token();
        session.start();
        session.start();
        expect(scheduled).toHaveLength(1);
        expect(events).toEqual([]);
        expect(session.token()).toBe(token);
        scheduled[0].callback();
        expect(session.isActive(token)).toBe(true);
        session.start();
        session.start(true);
        expect(events).toEqual(["video:start"]);
        expect(scheduled).toHaveLength(1);
        expect(session.isActive(token)).toBe(true);
    });

    test("划过另一视频会取消前一个待触发预览，迟到的回调不能抢回播放", () => {
        const { createSession, scheduled, events } = previewHarness();
        const first = createSession("first");
        const second = createSession("second");
        first.start();
        second.start();
        expect(scheduled[0].cancelled).toBe(true);
        scheduled[0].callback();
        expect(first.isActive()).toBe(false);
        expect(second.isActive()).toBe(false);
        expect(events).toEqual(["first:stop"]);
        scheduled[1].callback();
        expect(events).toEqual(["first:stop", "second:start"]);
        expect(first.isActive()).toBe(false);
        expect(second.isActive()).toBe(true);
    });

    test("正在播放的视频在下一段进入等待时停止，始终只有一个播放席位", () => {
        const { createSession, scheduled, events } = previewHarness();
        const first = createSession("first");
        const second = createSession("second");
        first.start(true);
        const firstToken = first.token();
        second.start();
        expect(first.isActive(firstToken)).toBe(false);
        expect(second.isActive()).toBe(false);
        expect(events).toEqual(["first:start", "first:stop"]);
        scheduled[0].callback();
        expect(second.isActive()).toBe(true);
        expect(events).toEqual(["first:start", "first:stop", "second:start"]);
    });

    test("立即播放可抢占另一视频的待触发预览", () => {
        const { createSession, scheduled, events } = previewHarness();
        const pending = createSession("pending");
        const immediate = createSession("immediate");
        pending.start();
        immediate.start(true);
        expect(scheduled).toHaveLength(1);
        expect(scheduled[0].cancelled).toBe(true);
        expect(immediate.isActive()).toBe(true);
        scheduled[0].callback();
        expect(pending.isActive()).toBe(false);
        expect(immediate.isActive()).toBe(true);
        expect(events).toEqual(["pending:stop", "immediate:start"]);
    });

    test("点击同一待触发视频可立即播放，旧定时回调不能重复激活", () => {
        const { createSession, scheduled, events } = previewHarness();
        const session = createSession("video");
        session.start();
        const pendingToken = session.token();
        session.start(true);
        expect(scheduled[0].cancelled).toBe(true);
        expect(session.isActive()).toBe(true);
        expect(session.isActive(pendingToken)).toBe(false);
        scheduled[0].callback();
        expect(events.filter((event) => event === "video:start")).toHaveLength(1);
        expect(session.isActive()).toBe(true);
    });

    test("离开后异步播放结果失效，重新进入也不能复用旧token", async () => {
        const { createSession } = previewHarness();
        const session = createSession("video");
        session.start(true);
        const previousToken = session.token();
        const latePlayback = Promise.resolve().then(() => session.isActive(previousToken));
        session.stop();
        expect(session.isActive(previousToken)).toBe(false);
        session.start(true);
        expect(session.isActive()).toBe(true);
        expect(session.token()).not.toBe(previousToken);
        expect(await latePlayback).toBe(false);
    });

    test("等待中离开再进入会重新计时，前次迟到回调不能提前启动", () => {
        const { createSession, scheduled, events } = previewHarness();
        const session = createSession("video");
        session.start();
        session.stop();
        session.start();
        expect(scheduled).toHaveLength(2);
        expect(scheduled[0].cancelled).toBe(true);
        scheduled[0].callback();
        expect(session.isActive()).toBe(false);
        expect(events).toEqual(["video:stop"]);
        scheduled[1].callback();
        expect(session.isActive()).toBe(true);
        expect(events).toEqual(["video:stop", "video:start"]);
    });

    test("重复停止和旧节点清理不影响当前视频", () => {
        const { createSession, events } = previewHarness();
        const first = createSession("first");
        const second = createSession("second");
        first.stop();
        expect(events).toEqual([]);
        first.start(true);
        second.start(true);
        first.stop();
        first.stop();
        expect(second.isActive()).toBe(true);
        expect(events).toEqual(["first:start", "first:stop", "second:start"]);
        second.stop();
        second.stop();
        expect(second.isActive()).toBe(false);
        expect(events).toEqual(["first:start", "first:stop", "second:start", "second:stop"]);
    });
});
