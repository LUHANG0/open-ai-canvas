import { describe, expect, test } from "bun:test";

import { buildCanvasNodeMentionReferenceMap, buildCanvasResourceReferences, buildCanvasResourceReferenceSnapshot, buildNodeMentionReferences, canvasResourceMentionToken, collectUpstreamVideoNodes, createCanvasResourceGraphIndex, getContextResourceNodesFromIndex, reuseCanvasResourceReferences, type CanvasResourceReference } from "../src/lib/canvas/canvas-resource-references";
import { createCanvasNodeGraphContextValue } from "../src/components/canvas/canvas-node-graph-context";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../src/types/canvas";

function videoNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Video,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: { content: `data:video/mp4;base64,${id}` },
    };
}

function textNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Text,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 60,
        metadata: { content: id },
    };
}

function imageNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Image,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 100,
        metadata: { content: `data:image/png;base64,${id}` },
    };
}

function audioNode(id: string): CanvasNodeData {
    return {
        id,
        type: CanvasNodeType.Audio,
        title: id,
        position: { x: 0, y: 0 },
        width: 100,
        height: 60,
        metadata: { content: `data:audio/mpeg;base64,${id}` },
    };
}

function connection(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `conn-${fromNodeId}-${toNodeId}`, fromNodeId, toNodeId };
}

describe("collectUpstreamVideoNodes", () => {
    test("下游视频节点能回溯到上游视频源", () => {
        const source = videoNode("source-video");
        const segment = videoNode("segment-video");
        const target = videoNode("target-video");
        const text = textNode("script");
        const nodes = [target, segment, source, text];
        const connections = [connection("source-video", "segment-video"), connection("segment-video", "target-video"), connection("script", "segment-video")];
        expect(collectUpstreamVideoNodes("target-video", nodes, connections).map((node) => node.id)).toEqual(["target-video", "segment-video", "source-video"]);
    });

    test("存在环时不会死循环", () => {
        const a = videoNode("a");
        const b = videoNode("b");
        const nodes = [a, b];
        const connections = [connection("a", "b"), connection("b", "a")];
        expect(collectUpstreamVideoNodes("a", nodes, connections).length).toBe(2);
    });
});

describe("canvas resource mention slots", () => {
    test("共享图索引在节点查询时不再重新扫描原始数组", () => {
        const target = videoNode("target");
        const image = imageNode("image-a");
        const nodes = [image, target];
        const connections = [connection(image.id, target.id)];
        const graphIndex = createCanvasResourceGraphIndex(nodes, connections);

        expect(getContextResourceNodesFromIndex(target.id, graphIndex)).toEqual([image]);
        expect(createCanvasNodeGraphContextValue(graphIndex).getUpstreamNodes?.(target.id)).toEqual([image]);
        expect(buildNodeMentionReferences(target, [] as CanvasNodeData[], [] as CanvasConnection[], graphIndex).map((reference) => reference.nodeId)).toEqual([image.id]);
    });

    test("画布节点引用只保存类型位置，不保存节点 ID", () => {
        const target = videoNode("target");
        const image = imageNode("image-a");
        const [reference] = buildNodeMentionReferences(target, [image, target], [connection(image.id, target.id)]);

        expect(reference.label).toBe("图片1");
        expect(canvasResourceMentionToken(reference)).toBe("@图片1");
        expect(canvasResourceMentionToken(reference)).not.toContain(image.id);
    });

    test("图片、音频和文本分别按各自类型顺序编号", () => {
        const target = videoNode("target");
        const nodes = [imageNode("image-a"), audioNode("audio-a"), imageNode("image-b"), textNode("text-a"), target];
        const connections = nodes.slice(0, -1).map((node) => connection(node.id, target.id));

        expect(buildNodeMentionReferences(target, nodes, connections).map((reference) => reference.label)).toEqual(["图片1", "音频1", "图片2", "文本1"]);
    });

    test("素材库身份 token 保持稳定", () => {
        expect(
            canvasResourceMentionToken({
                id: "asset:asset-a",
                nodeId: "",
                assetId: "asset-a",
                kind: "image",
                label: "场景图",
                title: "场景图",
                active: false,
            }),
        ).toBe("@[asset:asset-a]");
    });
});

describe("canvas resource reference stability", () => {
    test("切换悬停上下文只更新有变化的激活状态和局部编号", () => {
        const nodes = [imageNode("a"), imageNode("b"), textNode("text"), videoNode("target")];
        const connections = [connection("b", "target")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const graph = createCanvasResourceGraphIndex(nodes, connections);
        const idle = buildCanvasResourceReferences(nodes, connections, null, graph, snapshot.references);
        const focused = reuseCanvasResourceReferences(idle, buildCanvasResourceReferences(nodes, connections, "target", graph, snapshot.references));

        expect(focused[0]).toBe(idle[0]);
        expect(focused[2]).toBe(idle[2]);
        expect(focused[3]).toBe(idle[3]);
        expect(focused[1]).not.toBe(idle[1]);
        expect(focused[1]).toMatchObject({ nodeId: "b", label: "图片1", active: true });
        expect(idle[1]).toMatchObject({ label: "图片2", active: false });
        expect(reuseCanvasResourceReferences(focused, buildCanvasResourceReferences(nodes, connections, "target", graph, snapshot.references))).toBe(focused);

        const restored = reuseCanvasResourceReferences(focused, buildCanvasResourceReferences(nodes, connections, null, graph, snapshot.references));
        expect(restored).toEqual(idle);
        expect(restored[1]).toBe(snapshot.references[1]);
    });

    test("进度、位置和尺寸不变更引用快照，真实内容变化会更新", () => {
        const nodes = [imageNode("a"), textNode("text")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const progressNodes = nodes.map((node) => ({ ...node, width: node.width + 10, position: { x: 20, y: 30 }, metadata: { ...node.metadata, status: "loading" as const, taskProgress: 25 } }));
        expect(buildCanvasResourceReferenceSnapshot(progressNodes, snapshot)).toBe(snapshot);

        const editedNodes = [nodes[0], { ...nodes[1], metadata: { ...nodes[1].metadata, content: "新的文本" } }];
        const edited = buildCanvasResourceReferenceSnapshot(editedNodes, snapshot);
        expect(edited).not.toBe(snapshot);
        expect(edited.references[0]).toBe(snapshot.references[0]);
        expect(edited.references[1].text).toBe("新的文本");
        expect(buildCanvasResourceReferenceSnapshot([...nodes].reverse(), snapshot).references.map((reference) => reference.nodeId)).toEqual(["text", "a"]);
    });

    test("修改一条链路的资源不改变其他节点的 mention 数组", () => {
        const nodes = [imageNode("a"), imageNode("b"), videoNode("target-a"), videoNode("target-b")];
        const connections = [connection("a", "target-a"), connection("b", "target-b")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const before = buildCanvasNodeMentionReferenceMap(snapshot, connections, []);
        const editedNodes = [{ ...nodes[0], title: "新的图片标题" }, ...nodes.slice(1)];
        const edited = buildCanvasResourceReferenceSnapshot(editedNodes, snapshot);
        const after = buildCanvasNodeMentionReferenceMap(edited, connections, [], before);

        expect(after.get("target-b")).toBe(before.get("target-b"));
        expect(after.get("target-a")).not.toBe(before.get("target-a"));
        expect(after.get("target-a")?.[0].title).toBe("新的图片标题");
        expect(buildCanvasNodeMentionReferenceMap(edited, connections, [], after)).toBe(after);
        for (const node of editedNodes) expect(after.get(node.id)).toEqual(buildNodeMentionReferences(node, editedNodes, connections));
    });

    test("空标题改为全局默认标签时仍更新上下文中的局部标题", () => {
        const nodes = [imageNode("a"), { ...imageNode("b"), title: "" }, videoNode("target")];
        const connections = [connection("b", "target")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const before = buildCanvasNodeMentionReferenceMap(snapshot, connections, []);
        expect(snapshot.references[1]).toMatchObject({ label: "图片2", title: "图片2" });
        expect(before.get("target")?.[0]).toMatchObject({ label: "图片1", title: "图片1" });

        const renamedNodes = [nodes[0], { ...nodes[1], title: "图片2" }, nodes[2]];
        const renamed = buildCanvasResourceReferenceSnapshot(renamedNodes, snapshot);
        expect(renamed.references).toBe(snapshot.references);
        expect(renamed).not.toBe(snapshot);
        const after = buildCanvasNodeMentionReferenceMap(renamed, connections, [], before);
        expect(after.get("target")?.[0]).toMatchObject({ label: "图片1", title: "图片2" });
        expect(after.get("target")).toEqual(buildNodeMentionReferences(renamedNodes[2], renamedNodes, connections));

        const cleared = buildCanvasResourceReferenceSnapshot(nodes, renamed);
        expect(buildCanvasNodeMentionReferenceMap(cleared, connections, [], after).get("target")?.[0]).toMatchObject({ label: "图片1", title: "图片1" });
    });

    test("保留 Config 输入优先级、自身排除、连接顺序和非素材节点类型变更", () => {
        const a = imageNode("a");
        const b = imageNode("b");
        const text = textNode("text");
        const config = { ...textNode("config"), type: CanvasNodeType.Config, metadata: {} };
        const nodes = [a, b, text, config];
        const connections = [connection("b", "config"), connection("text", "config"), connection("a", "config"), connection("a", "b")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const before = buildCanvasNodeMentionReferenceMap(snapshot, connections, []);
        expect(before.get("b")?.map((reference) => [reference.nodeId, reference.label])).toEqual([["text", "文本1"], ["a", "图片1"]]);
        expect(before.get("config")?.map((reference) => [reference.nodeId, reference.label])).toEqual([["b", "图片1"], ["text", "文本1"], ["a", "图片2"]]);

        const withoutConfig = [...nodes.slice(0, -1), { ...config, type: CanvasNodeType.Frame }];
        const updated = buildCanvasResourceReferenceSnapshot(withoutConfig, snapshot);
        expect(updated).not.toBe(snapshot);
        const after = buildCanvasNodeMentionReferenceMap(updated, connections, [], before);
        expect(after.get("b")?.map((reference) => reference.nodeId)).toEqual(["a"]);
        expect(after.get("a")?.map((reference) => reference.nodeId)).toEqual(["a"]);
        for (const node of withoutConfig) expect(after.get(node.id)).toEqual(buildNodeMentionReferences(node, withoutConfig, connections));
    });

    test("重排连接、增删节点和技能引用都同步更新，保留未改项", () => {
        const nodes = [imageNode("a"), imageNode("b"), videoNode("target")];
        const connections = [connection("a", "target"), connection("b", "target")];
        const snapshot = buildCanvasResourceReferenceSnapshot(nodes);
        const before = buildCanvasNodeMentionReferenceMap(snapshot, connections, []);
        const reordered = buildCanvasNodeMentionReferenceMap(snapshot, [...connections].reverse(), [], before);
        expect(reordered.get("target")?.map((reference) => [reference.nodeId, reference.label])).toEqual([["b", "图片1"], ["a", "图片2"]]);
        const skill: CanvasResourceReference = { id: "skill-1", nodeId: "", kind: "skill", label: "技能1", title: "分镜", active: false, mentionToken: "@[skill:1]" };
        const withSkill = buildCanvasNodeMentionReferenceMap(snapshot, connections, [skill], before);
        expect(withSkill.get("target")?.slice(0, 2)).toEqual(before.get("target"));
        expect(withSkill.get("target")?.[0]).toBe(before.get("target")?.[0]);
        expect(withSkill.get("target")?.at(-1)).toBe(skill);
        const reducedNodes = [nodes[0], nodes[2]];
        const reduced = buildCanvasNodeMentionReferenceMap(buildCanvasResourceReferenceSnapshot(reducedNodes, snapshot), connections, [], withSkill);
        expect([...reduced.keys()]).toEqual(["a", "target"]);
        expect(reduced.get("target")?.map((reference) => reference.nodeId)).toEqual(["a"]);
    });
});
