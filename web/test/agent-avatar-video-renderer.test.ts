import { expect, test } from "bun:test";
import { keyAgentAvatarPixels, startAgentAvatarVideo } from "../src/components/canvas/agent-avatar-video-renderer";
import { avatarFixture } from "./helpers/agent-avatar-video-fixture";

test("2D key preserves strict thresholds, despills partial green and multiplies existing alpha", () => {
    const pixels = new Uint8ClampedArray([40, 70, 40, 255, 100, 112, 100, 128, 100, 113, 100, 128, 100, 125, 100, 128, 10, 220, 10, 255, 220, 10, 100, 64, 100, 120, 112, 200, 0, 0, 0, 0]);
    keyAgentAvatarPixels(pixels);
    expect(Array.from(pixels)).toEqual([40, 70, 40, 255, 100, 112, 100, 128, 100, 113, 100, 123, 100, 116, 100, 64, 10, 62, 10, 0, 220, 10, 100, 64, 100, 120, 112, 200, 0, 0, 0, 0]);
});

for (const options of [{ unavailable: true }, { compileFailure: true }, { linkFailure: true }, { textureFailure: true }, { uploadError: true }]) {
    test(`GL failure ${JSON.stringify(options)} presents keyed 2D on a distinct canvas without a media error`, () => {
        const f = avatarFixture(options);
        const session = startAgentAvatarVideo(f.video, f.onError);
        try {
            const visible = f.host.querySelector("canvas");
            const cpu = f.records.find((r) => r.kind === "2d")!;
            expect(visible).toBe(cpu.canvas);
            expect(cpu.pixels).toEqual([100, 116, 100, 64, 10, 62, 10, 0]);
            expect(f.errors()).toBe(0);
            expect(f.callbacks.size).toBe(1);
            const gpu = f.records.find((r) => r.kind === "webgl");
            if (gpu) {
                expect(gpu.canvas).not.toBe(cpu.canvas);
                expect(gpu.deleted.filter((n) => n === "deleteShader")).toHaveLength(2);
                expect(gpu.deleted.filter((n) => n === "deleteTexture")).toHaveLength(1);
                expect(gpu.deleted.filter((n) => n === "deleteBuffer")).toHaveLength(1);
                expect(gpu.deleted.filter((n) => n === "deleteProgram")).toHaveLength(1);
            }
        } finally {
            session.dispose();
            f.close();
        }
    });
}

test("context loss presents 2D in the same task, preserves the video and remains one-way", () => {
    const f = avatarFixture();
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        const gpu = f.records[0];
        const video = f.host.querySelector("video");
        const lost = new f.dom.Event("webglcontextlost", { cancelable: true });
        gpu.canvas.dispatchEvent(lost as unknown as Event);
        const cpu = f.records.find((r) => r.kind === "2d")!;
        expect(f.host.querySelector("canvas")).toBe(cpu.canvas);
        expect(f.host.querySelector("video")).toBe(video);
        expect(cpu.puts).toBe(1);
        expect(lost.defaultPrevented).toBe(true);
        f.video.currentTime = 1;
        f.tick();
        expect(cpu.puts).toBe(2);
        expect(gpu.uploaded).toBe(1);
        expect(f.callbacks.size).toBe(1);
        expect(f.errors()).toBe(0);
        expect(gpu.deleted.filter((n) => n === "deleteTexture")).toHaveLength(1);
    } finally {
        session.dispose();
        f.close();
    }
});

test("unready video is not presented; new frames and size changes preserve aspect and full 320 limit", () => {
    const f = avatarFixture();
    f.setVideo({ readyState: 1 });
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        expect(f.host.querySelector("canvas")).toBeNull();
        expect(f.records[0].uploaded).toBe(0);
        f.setVideo({ readyState: 4 });
        f.tick();
        const canvas = f.host.querySelector("canvas")!;
        expect([canvas.width, canvas.height]).toEqual([320, 240]);
        f.setVideo({ videoWidth: 100, videoHeight: 200 });
        f.video.currentTime = 1;
        f.tick();
        expect([canvas.width, canvas.height]).toEqual([100, 200]);
        expect(f.records[0].uploaded).toBe(2);
    } finally {
        session.dispose();
        f.close();
    }
});

test("RVFC and rAF fallback do not redraw identical paused or ended frames", () => {
    for (const noVideoCallback of [false, true]) {
        const f = avatarFixture({ noVideoCallback });
        const session = startAgentAvatarVideo(f.video, f.onError);
        try {
            const gpu = f.records[0];
            f.setVideo({ paused: true });
            f.tick();
            f.tick();
            expect(gpu.uploaded).toBe(1);
            f.setVideo({ paused: false, ended: true });
            f.tick();
            expect(gpu.uploaded).toBe(1);
            f.setVideo({ ended: false });
            f.video.currentTime = 3;
            f.tick();
            expect(gpu.uploaded).toBe(2);
        } finally {
            session.dispose();
            f.close();
        }
    }
});

test("disposing cancels the sole scheduled callback and late callbacks cannot resurrect GPU or DOM", () => {
    for (const noVideoCallback of [false, true]) {
        const f = avatarFixture({ noVideoCallback });
        const session = startAgentAvatarVideo(f.video, f.onError);
        const late = [...f.callbacks.values()][0];
        const gpu = f.records[0];
        session.dispose();
        session.dispose();
        f.video.currentTime = 2;
        late();
        expect(f.callbacks.size).toBe(0);
        expect(f.cancelled).toHaveLength(1);
        expect(f.host.querySelector("canvas")).toBeNull();
        expect(gpu.uploaded).toBe(1);
        expect(gpu.deleted.filter((n) => n === "deleteShader")).toHaveLength(2);
        expect(gpu.deleted.filter((n) => n === "deleteTexture")).toHaveLength(1);
        expect(gpu.deleted.filter((n) => n === "deleteBuffer")).toHaveLength(1);
        expect(gpu.deleted.filter((n) => n === "deleteProgram")).toHaveLength(1);
        f.close();
    }
});

test("new source rejects still-ready old currentSrc and disposed old callbacks", () => {
    const f = avatarFixture();
    const old = startAgentAvatarVideo(f.video, f.onError);
    const late = [...f.callbacks.values()][0];
    const first = f.records[0];
    old.dispose();
    const oldSrc = f.video.src;
    f.video.src = "/two.mp4";
    f.setVideo({ currentSrc: oldSrc });
    const next = startAgentAvatarVideo(f.video, f.onError);
    try {
        late();
        expect(f.callbacks.size).toBe(1);
        expect(first.uploaded).toBe(1);
        expect(f.host.querySelector("canvas")).toBeNull();
        f.setVideo({ currentSrc: f.video.src });
        f.tick();
        expect(f.host.querySelector("canvas")).toBe(f.records[1].canvas);
        expect(f.records[1].uploaded).toBe(1);
    } finally {
        next.dispose();
        f.close();
    }
});

test("failed fallback reports once and stops rather than presenting blank success", () => {
    const f = avatarFixture({ unavailable: true, twoDFailure: true });
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        expect(f.errors()).toBe(1);
        expect(f.callbacks.size).toBe(0);
        expect(f.host.querySelector("canvas")).toBeNull();
    } finally {
        session.dispose();
        f.close();
    }
});

test("class changes update the active canvas and survive fallback", () => {
    const f = avatarFixture();
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        session.setClassName("custom-avatar");
        expect(f.host.querySelector("canvas")?.className).toBe("custom-avatar");
        f.records[0].canvas.dispatchEvent(new f.dom.Event("webglcontextlost", { cancelable: true }) as unknown as Event);
        expect(f.host.querySelector("canvas")?.className).toBe("custom-avatar");
    } finally {
        session.dispose();
        f.close();
    }
});

test("fallback never presents an unprepared canvas while the video is buffering", () => {
    const f = avatarFixture();
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        const original = f.host.querySelector("canvas");
        f.setVideo({ readyState: 1 });
        f.records[0].canvas.dispatchEvent(new f.dom.Event("webglcontextlost", { cancelable: true }) as unknown as Event);
        expect(f.host.querySelector("canvas")).toBe(original);
        const cpu = f.records.find((r) => r.kind === "2d")!;
        expect(cpu.puts).toBe(0);
        f.setVideo({ readyState: 4 });
        f.tick();
        expect(cpu.puts).toBe(1);
        expect(f.host.querySelector("canvas")).toBe(cpu.canvas);
        expect(f.callbacks.size).toBe(1);
    } finally {
        session.dispose();
        f.close();
    }
});

test("a later texture upload exception falls back without waiting for another video frame", () => {
    const options = { textureFailure: false };
    const f = avatarFixture(options);
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        options.textureFailure = true;
        f.video.currentTime = 1;
        f.tick();
        const cpu = f.records.find((r) => r.kind === "2d")!;
        expect(cpu.puts).toBe(1);
        expect(f.host.querySelector("canvas")).toBe(cpu.canvas);
        expect(f.errors()).toBe(0);
        expect(f.callbacks.size).toBe(1);
    } finally {
        session.dispose();
        f.close();
    }
});

test("source dimension changes redraw even when the time and scaled output dimensions match", () => {
    const f = avatarFixture();
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        f.setVideo({ videoWidth: 1280, videoHeight: 960 });
        f.tick();
        expect(f.records[0].uploaded).toBe(2);
        const canvas = f.host.querySelector("canvas")!;
        expect([canvas.width, canvas.height]).toEqual([320, 240]);
    } finally {
        session.dispose();
        f.close();
    }
});

test("retarget retains the GL frame through repeated unready sources and rejects cancelled callbacks", () => {
    const f = avatarFixture();
    const session = startAgentAvatarVideo(f.video, f.onError);
    try {
        const gpu = f.records[0];
        const canvas = f.host.querySelector("canvas");
        const stale = [...f.callbacks.values()][0];
        const original = f.video.src;
        f.setVideo({ readyState: 1, currentSrc: original });
        f.video.src = "/two.mp4";
        session.setSource();
        stale();
        expect(f.host.querySelector("canvas")).toBe(canvas);
        expect(gpu.uploaded).toBe(1);
        expect(f.callbacks.size).toBe(1);
        f.tick();
        expect(gpu.uploaded).toBe(1);
        const intermediate = [...f.callbacks.values()][0];
        const second = f.video.src;
        f.video.src = "/three.mp4";
        session.setSource();
        f.setVideo({ readyState: 4, currentSrc: second });
        intermediate();
        f.tick();
        expect(gpu.uploaded).toBe(1);
        expect(f.callbacks.size).toBe(1);
        f.setVideo({ currentSrc: f.video.src });
        f.tick();
        expect(gpu.uploaded).toBe(2);
        expect(f.host.querySelector("canvas")).toBe(canvas);
        expect(gpu.deleted).toEqual([]);
        f.setVideo({ readyState: 1 });
        f.video.src = "/four.mp4";
        session.setSource();
        const last = [...f.callbacks.values()][0];
        session.dispose();
        last();
        expect(f.callbacks.size).toBe(0);
        expect(f.host.querySelector("canvas")).toBeNull();
        expect(gpu.deleted.filter((n) => n === "deleteTexture")).toHaveLength(1);
    } finally {
        session.dispose();
        f.close();
    }
});
