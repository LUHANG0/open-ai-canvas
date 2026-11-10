import { expect, test } from "bun:test";
import { canonicalize } from "json-canonicalize";
import type { CanvasProject } from "../src/stores/canvas/use-canvas-store";
import { canvasContentHash, hasConfirmedCanvasContent } from "../src/lib/canvas/canvas-content";

const baseline = (): CanvasProject => ({
    id: "legacy-canvas",
    title: "Confirmed title",
    nodes: [],
    connections: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    revision: 7,
    chatSessions: [],
    activeChatId: null,
    previsScenes: [],
    viewport: { x: 0, y: 0, k: 1 },
    backgroundMode: "dots",
    showImageInfo: false,
});

function legacyJson(project: CanvasProject) {
    const { viewport: _viewport, updatedAt: _updatedAt, revision: _revision, remoteContentHash: _hash, ...content } = project;
    return canonicalize({ ...content, projectId: content.projectId || undefined });
}

test("recognizes exact legacy JSON baselines without accepting edited or damaged content", async () => {
    const project = baseline();
    project.remoteContentHash = `json:${legacyJson(project)}`;
    expect(await hasConfirmedCanvasContent(project)).toBe(true);
    expect(await hasConfirmedCanvasContent({ ...project, viewport: { x: 10, y: 20, k: 2 }, revision: 8 })).toBe(true);
    expect(await hasConfirmedCanvasContent({ ...project, title: "Unsaved edit" })).toBe(false);
    expect(await hasConfirmedCanvasContent({ ...project, chatSessions: [{ id: "new-chat" }] as CanvasProject["chatSessions"] })).toBe(false);
    expect(await hasConfirmedCanvasContent({ ...project, remoteContentHash: "json:{}" })).toBe(false);
    expect(await hasConfirmedCanvasContent({ ...project, remoteContentHash: undefined })).toBe(false);
});

test("recognizes previous SHA-256 baselines and rejects changed node content", async () => {
    const project = baseline();
    const serialized = legacyJson(project);
    project.remoteContentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized))), (value) => value.toString(16).padStart(2, "0")).join("");
    expect(project.remoteContentHash).not.toBe(await canvasContentHash(project));
    expect(await hasConfirmedCanvasContent(project)).toBe(true);
    expect(await hasConfirmedCanvasContent({ ...project, nodes: [{ id: "new-node", type: "text" }] as CanvasProject["nodes"] })).toBe(false);
});

test("newly normalized digests continue to validate after optional defaults change", async () => {
    const project = baseline();
    project.remoteContentHash = await canvasContentHash(project);
    expect(await hasConfirmedCanvasContent({ ...project, activeChatId: undefined, chatSessions: undefined, previsScenes: undefined })).toBe(true);
    expect(await hasConfirmedCanvasContent({ ...project, title: "Unsaved edit" })).toBe(false);
});
