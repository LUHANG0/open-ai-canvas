import assert from "node:assert/strict";
import test from "node:test";
import { applyCanvasVideoMeasurement, applyCanvasVideoPoster, fitCanvasVideoToMedia, fitVideoPresentationSize, videoMeasurementSnapshot, videoPresentationDimensions } from "../src/lib/canvas/canvas-video-presentation.ts";
import type { CanvasNodeData } from "../src/types/canvas.ts";

function video(metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id: "fixture", type: "video", title: "video", width: 420, height: 746, position: { x: 100, y: 200 }, metadata: { storageKey: "video:a", content: "/a.mp4", status: "success", taskId: "a", ...metadata } } as CanvasNodeData;
}

test("known landscape, portrait, square and extreme video dimensions stay proportional inside the presentation bounds", () => {
    for (const [width, height] of [[854, 480], [1080, 1920], [640, 640], [4000, 200], [20, 1000], [80, 45]]) {
        const size = fitVideoPresentationSize(width, height)!;
        assert.ok(size.width <= 720.001 && size.height <= 520.001);
        assert.ok(Math.abs(size.width / size.height - width / height) < 1e-8);
    }
    for (const [width, height] of [[0, 10], [NaN, 10], [10, Infinity], [-1, 10]]) assert.equal(fitVideoPresentationSize(width, height), null);
});

test("a completed landscape result fits around the existing center without touching generation parameters or connections", () => {
    const node = video({ naturalWidth: 854, naturalHeight: 480, size: "9:16", prompt: "keep" });
    const fitted = fitCanvasVideoToMedia(node);
    assert.equal(fitted.width, 720);
    assert.equal(fitted.position.x + fitted.width / 2, node.position.x + node.width / 2);
    assert.equal(fitted.position.y + fitted.height / 2, node.position.y + node.height / 2);
    assert.equal(fitted.metadata, node.metadata);
    assert.equal(fitted.id, node.id);
    assert.equal(fitCanvasVideoToMedia(fitted), fitted);
});

test("manual, locked and free-resize layouts are preserved, including dimensions below legacy minimums", () => {
    for (const flag of ["manualSize", "locked", "freeResize"] as const) {
        const node = video({ naturalWidth: 854, naturalHeight: 480, [flag]: true });
        node.width = 180; node.height = 320;
        assert.equal(fitCanvasVideoToMedia(node), node);
        const measured = applyCanvasVideoMeasurement(node, videoMeasurementSnapshot(node, "user:a"), { width: 1920, height: 1080 }, "user:a");
        assert.equal(measured.width, 180); assert.equal(measured.height, 320);
        assert.equal(measured.metadata?.naturalWidth, 1920);
    }
});

test("explicit fit exits manual size and free resize but cannot unlock or alter a loading node", () => {
    const node = video({ naturalWidth: 854, naturalHeight: 480, manualSize: true, freeResize: true });
    const fitted = fitCanvasVideoToMedia(node, true);
    assert.equal(fitted.metadata?.manualSize, false); assert.equal(fitted.metadata?.freeResize, false);
    assert.equal(fitted.width, 720);
    for (const patch of [{ locked: true }, { status: "loading" }]) {
        const blocked = video({ ...node.metadata, ...patch } as CanvasNodeData["metadata"]);
        assert.equal(fitCanvasVideoToMedia(blocked, true), blocked);
    }
});

test("missing dimensions preserve the frame until real metadata arrives, then repeated events do not write", () => {
    const node = video(); assert.equal(fitCanvasVideoToMedia(node), node);
    const observed = videoMeasurementSnapshot(node, "user:a");
    const measured = applyCanvasVideoMeasurement(node, observed, { width: 854, height: 480 }, "user:a");
    assert.equal(measured.width, 720); assert.equal(measured.metadata?.naturalWidth, 854);
    assert.equal(applyCanvasVideoMeasurement(measured, observed, { width: 854, height: 480 }, "user:a"), measured);
    assert.equal(applyCanvasVideoMeasurement(measured, videoMeasurementSnapshot(measured, "user:a"), { width: 854, height: 480 }, "user:a"), measured);
});

test("a move while decoding keeps its new center, and a resize or newly protected layout wins", () => {
    const node = video(); const observed = videoMeasurementSnapshot(node, "user:a");
    const moved = { ...node, position: { x: 500, y: 800 } };
    const measured = applyCanvasVideoMeasurement(moved, observed, { width: 854, height: 480 }, "user:a");
    assert.equal(measured.position.x + measured.width / 2, moved.position.x + moved.width / 2);
    for (const live of [{ ...node, width: 333 }, { ...node, metadata: { ...node.metadata, manualSize: true } }]) {
        const kept = applyCanvasVideoMeasurement(live, observed, { width: 854, height: 480 }, "user:a");
        assert.equal(kept.width, live.width); assert.equal(kept.height, live.height); assert.equal(kept.position, live.position);
    }
});

test("old media, old task, other node, loading state and account changes reject metadata and poster writes", () => {
    const node = video(); const observed = videoMeasurementSnapshot(node, "user:a");
    const poster = { content: "/poster.png", width: 400, height: 225 };
    const variants = [
        { ...node, id: "other" }, video({ storageKey: "video:b" }), video({ taskId: "b" }), video({ status: "loading" }),
    ];
    for (const current of variants) {
        assert.equal(applyCanvasVideoMeasurement(current, observed, { width: 854, height: 480 }, "user:a"), current);
        assert.equal(applyCanvasVideoPoster(current, observed, poster, "user:a"), current);
    }
    assert.equal(applyCanvasVideoMeasurement(node, observed, { width: 854, height: 480 }, "user:b"), node);
    assert.equal(applyCanvasVideoPoster(node, observed, poster, "user:b"), node);
});

test("content-only replacement is a different identity while renewed URLs for one storage key stay stable", () => {
    const old = video({ storageKey: undefined }); const observed = videoMeasurementSnapshot(old, "user:a");
    const replaced = video({ storageKey: undefined, content: "/b.mp4" });
    assert.equal(applyCanvasVideoMeasurement(replaced, observed, { width: 854, height: 480 }, "user:a"), replaced);
    const node = video(); const renewed = video({ content: "/a.mp4?renewed" });
    assert.equal(applyCanvasVideoMeasurement(renewed, videoMeasurementSnapshot(node, "user:a"), { width: 854, height: 480 }, "user:a").width, 720);
});

test("inactive poster and decoded media share the same frame without assigning poster pixels as natural dimensions", () => {
    const node = video({ videoPreview: { content: "/poster.png", width: 400, height: 225 } });
    const posterFit = applyCanvasVideoMeasurement(node, videoMeasurementSnapshot(node, "user:a"), videoPresentationDimensions(node)!, "user:a", false);
    assert.equal(posterFit.metadata?.naturalWidth, undefined);
    const decoded = applyCanvasVideoMeasurement(posterFit, videoMeasurementSnapshot(posterFit, "user:a"), { width: 1920, height: 1080 }, "user:a");
    assert.equal(decoded.width, posterFit.width); assert.equal(decoded.height, posterFit.height);
    assert.equal(decoded.metadata?.naturalWidth, 1920);
});

test("a later poster choice for the same media is not overwritten by an older hydration callback", () => {
    const node = video(); const observed = videoMeasurementSnapshot(node, "user:a");
    const current = video({ videoPreview: { content: "/chosen.png", width: 400, height: 225 } });
    assert.equal(applyCanvasVideoPoster(current, observed, { content: "/older.png", width: 400, height: 225 }, "user:a"), current);
});
