import { afterEach, expect, test } from "bun:test";
import { CanvasPlaybackController, isCanvasBackgroundTap } from "../src/lib/canvas/canvas-playback";

const controllers: CanvasPlaybackController[] = [];
const makeController = () => {
    const c = new CanvasPlaybackController();
    controllers.push(c);
    return c;
};
afterEach(() => controllers.splice(0).forEach((c) => c.clear()));

test("hover and node activation keep the same player and position", () => {
    const c = makeController();
    const selected: string[] = [];
    c.setActivationHandler((id) => selected.push(id));
    c.preview("a", "a");
    const hover = c.getSnapshot()!;
    c.recordTime(hover.token, 4.25);
    c.played(hover.token);
    expect(selected).toEqual([]);
    c.play("a", "a");
    expect(c.getSnapshot()?.token).toBe(hover.token);
    expect(c.position(hover.token)).toBe(4.25);
    expect(c.getSnapshot()?.status).toBe("playing");
    expect(selected).toEqual(["a"]);
    c.leave(hover.token);
    expect(c.getSnapshot()?.nodeId).toBe("a");
});
test("blank/deselection closes the player and re-entry starts from zero", () => {
    const c = makeController();
    c.play("a", "a");
    const s = c.getSnapshot()!;
    let pauses = 0;
    c.bind(s.token, {
        time: () => 7,
        pause: () => {
            pauses++;
        },
    });
    c.dismiss();
    expect(c.getSnapshot()).toBeNull();
    expect(pauses).toBe(1);
    c.play("a", "a");
    expect(c.getSnapshot()?.startAt).toBe(0);
    expect(c.position(c.getSnapshot()!.token)).toBe(0);
});
test("a control pause stays on the selected player and incidental hover cannot restart it", () => {
    const c = makeController();
    c.play("a", "a");
    const s = c.getSnapshot()!;
    c.recordTime(s.token, 8);
    c.pause();
    c.preview("a", "a");
    expect(c.getSnapshot()?.intent).toBe("pause");
    expect(c.getSnapshot()?.token).toBe(s.token);
    c.play("a", "a");
    expect(c.getSnapshot()?.intent).toBe("play");
    expect(c.position(s.token)).toBe(8);
});
test("switching videos resets position and ignores the previous player's callbacks", () => {
    const c = makeController();
    c.play("a", "a");
    const token = c.getSnapshot()!.token;
    c.recordTime(token, 5);
    c.play("b", "b");
    c.failed(token);
    c.ended(token);
    c.recordTime(token, 99);
    expect(c.getSnapshot()?.nodeId).toBe("b");
    c.play("a", "a");
    expect(c.position(c.getSnapshot()!.token)).toBe(0);
});
test("hover leave releases its decoder and the next hover begins from zero", () => {
    const c = makeController();
    c.preview("a", "a");
    const token = c.getSnapshot()!.token;
    c.recordTime(token, 3);
    c.leave(token);
    expect(c.getSnapshot()).toBeNull();
    c.preview("a", "a");
    expect(c.position(c.getSnapshot()!.token)).toBe(0);
});
test("ending a selected video rewinds it; replay starts a fresh zero-position request", () => {
    const c = makeController();
    c.play("a", "a");
    const token = c.getSnapshot()!.token;
    let rewound = false;
    c.bind(token, {
        time: () => 15,
        pause() {},
        rewind() {
            rewound = true;
        },
    });
    c.recordTime(token, 15);
    c.ended(token);
    expect(rewound).toBe(true);
    expect(c.getSnapshot()?.intent).toBe("pause");
    c.recordTime(token, 15);
    expect(c.position(token)).toBe(0);
    c.play("a", "a");
    expect(c.getSnapshot()?.startAt).toBe(0);
});
test("background tap excludes movement, cancellation and another pointer", () => {
    const down = { pointerId: 1, x: 100, y: 100 };
    expect(isCanvasBackgroundTap(down, { pointerId: 1, x: 102, y: 100, cancelled: false })).toBe(true);
    expect(isCanvasBackgroundTap(down, { pointerId: 1, x: 110, y: 100, cancelled: false })).toBe(false);
    expect(isCanvasBackgroundTap(down, { pointerId: 2, x: 100, y: 100, cancelled: false })).toBe(false);
    expect(isCanvasBackgroundTap(down, { pointerId: 1, x: 100, y: 100, cancelled: true })).toBe(false);
});
test("loading pause and late events never override the latest intent", () => {
    const c = makeController();
    c.play("a", "a");
    const token = c.getSnapshot()!.token;
    c.pause();
    expect(c.played(token)).toBe(false);
    c.dismiss();
    c.play("b", "b");
    c.failed(token);
    expect(c.getSnapshot()?.nodeId).toBe("b");
    expect(c.getSnapshot()?.intent).toBe("play");
});
test("blocked audible autoplay keeps an explicit retry state", () => {
    const c = makeController();
    c.play("a", "a");
    const s = c.getSnapshot()!;
    c.rejected(s.token, new DOMException("Gesture required", "NotAllowedError"));
    expect(c.getSnapshot()?.status).toBe("blocked");
    expect(c.getSnapshot()?.intent).toBe("pause");
    c.play("a", "a");
    expect(c.getSnapshot()?.intent).toBe("play");
});
test("a blocked hover retries silently once without changing sound, then promotes in place", () => {
    const c = makeController();
    c.preview("a", "a");
    const s = c.getSnapshot()!;
    c.rejected(s.token, new DOMException("Gesture required", "NotAllowedError"));
    expect(c.getSnapshot()?.autoplayMuted).toBe(true);
    expect(c.getSnapshot()?.intent).toBe("play");
    expect(c.getSnapshot()?.command).toBeGreaterThan(s.command);
    expect(c.getSound()).toEqual({ muted: false, volume: 1 });
    c.played(s.token);
    c.recordTime(s.token, 2.5);
    c.play("a", "a");
    expect(c.getSnapshot()?.autoplayMuted).toBe(false);
    expect(c.getSnapshot()?.mode).toBe("explicit");
    expect(c.getSnapshot()?.token).toBe(s.token);
    expect(c.position(s.token)).toBe(2.5);
});
test("failed muted autoplay stops retrying and media errors never trigger silent fallback", () => {
    const c = makeController();
    c.preview("a", "a");
    const token = c.getSnapshot()!.token;
    c.rejected(token, new DOMException("Gesture required", "NotAllowedError"));
    c.rejected(token, new DOMException("Still blocked", "NotAllowedError"));
    expect(c.getSnapshot()?.status).toBe("blocked");
    expect(c.getSnapshot()?.intent).toBe("pause");
    c.dismiss();
    c.preview("a", "a");
    c.rejected(c.getSnapshot()!.token, new Error("network failure"));
    expect(c.getSnapshot()?.status).toBe("error");
    expect(c.getSnapshot()?.autoplayMuted).toBeUndefined();
});
test("asset view closes pending playback and cannot acquire a hidden canvas player", () => {
    const c = makeController();
    c.play("a", "a");
    c.setAvailable(false);
    expect(c.getSnapshot()).toBeNull();
    c.play("b", "b");
    c.preview("b", "b");
    expect(c.getSnapshot()).toBeNull();
    c.setAvailable(true);
    expect(c.getSnapshot()).toBeNull();
});
test("resource recovery checkpoints actual time and preserves a pause during recovery", () => {
    const c = makeController();
    c.play("a", "a");
    const token = c.getSnapshot()!.token;
    c.bind(token, { time: () => 8, pause() {} });
    c.recovering(token);
    expect(c.position(token)).toBe(8);
    c.pause();
    expect(c.getSnapshot()?.intent).toBe("pause");
    expect(c.played(token)).toBe(false);
});
test("buffering does not falsely confirm playback; sound remains a canvas preference", () => {
    const c = makeController();
    c.setSound({ muted: true, volume: 0.25 });
    c.play("a", "a");
    const token = c.getSnapshot()!.token;
    c.phase(token, "buffering");
    expect(c.getSnapshot()?.status).toBe("buffering");
    expect(c.getSnapshot()?.intent).toBe("play");
    c.played(token);
    expect(c.getSnapshot()?.status).toBe("playing");
    c.dismiss();
    c.play("b", "b");
    expect(c.getSound()).toEqual({ muted: true, volume: 0.25 });
});
test("deletion prunes the active player without leaving playback history", () => {
    const c = makeController();
    c.play("a", "a");
    c.prune(new Set(["b"]));
    expect(c.getSnapshot()).toBeNull();
});

test("paused or ended explicit playback cannot reserve every other video's hover", () => {
    const c = makeController();
    c.play("a", "a");
    expect(c.preview("b", "b")).toBe(false);
    c.pause();
    expect(c.preview("a", "a")).toBe(false);
    expect(c.preview("b", "b")).toBe(true);
    expect(c.getSnapshot()?.nodeId).toBe("b");
    c.play("a", "a");
    c.ended(c.getSnapshot()!.token);
    expect(c.preview("b", "b")).toBe(true);
    expect(c.getSnapshot()?.nodeId).toBe("b");
});
