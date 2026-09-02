import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { resolveProjectCanvasStyle } from "@/components/canvas/canvas-style-picker-modal";
import { createCanvasNode } from "@/lib/canvas/canvas-project-domain";
import { createStyleProfileSnapshot, resolveStyleProfile, serializeStyleProfile } from "@/lib/canvas/style-profile";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type Position } from "@/types/canvas";

interface LinkedProjectStyleSource {
    stylePresetId?: string;
    styleProfileJson?: string | null;
}

export interface ResolvedLinkedProjectStyleNode {
    title: string;
    metadata: CanvasNodeMetadata;
}

export function resolveLinkedProjectStyleNode(project?: LinkedProjectStyleSource | null): ResolvedLinkedProjectStyleNode | null {
    const preset = resolveProjectCanvasStyle(project?.stylePresetId, project?.styleProfileJson);
    if (!preset) return null;
    const profile = resolveStyleProfile(project?.stylePresetId, project?.styleProfileJson, preset.profile || createStyleProfileSnapshot(preset));
    if (!profile) return null;
    return {
        title: `项目画风 · ${profile.title}`,
        metadata: {
            content: profile.prompt,
            prompt: profile.prompt,
            status: "success",
            workflowKind: "styleboard",
            workflowTitle: "项目画风",
            workflowDescription: profile.description,
            stylePresetId: profile.presetId,
            styleProfileJson: serializeStyleProfile(profile),
            fontSize: 14,
            locked: true,
        },
    };
}

export function isLinkedProjectStyleNodeCurrent(node: CanvasNodeData, resolved: ResolvedLinkedProjectStyleNode) {
    return node.metadata?.stylePresetId === resolved.metadata.stylePresetId && node.metadata?.content === resolved.metadata.content && node.metadata?.styleProfileJson === resolved.metadata.styleProfileJson && Boolean(node.metadata?.locked);
}

interface UseCanvasLinkedProjectStyleOptions {
    projectLoaded: boolean;
    project?: LinkedProjectStyleSource | null;
    nodesRef: { current: CanvasNodeData[] };
    getCanvasCenter: () => Position;
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
}

export function useCanvasLinkedProjectStyle({ projectLoaded, project, nodesRef, getCanvasCenter, setNodes }: UseCanvasLinkedProjectStyleOptions) {
    useEffect(() => {
        if (!projectLoaded) return;
        const resolved = resolveLinkedProjectStyleNode(project);
        if (!resolved) return;
        const current = nodesRef.current.find((node) => node.type === CanvasNodeType.Text && node.metadata?.workflowKind === "styleboard");
        if (current) {
            if (isLinkedProjectStyleNodeCurrent(current, resolved)) return;
            setNodes((nodes) => nodes.map((node) => (node.id === current.id ? { ...node, title: resolved.title, metadata: { ...node.metadata, ...resolved.metadata } } : node)));
            return;
        }
        const node = createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), resolved.metadata);
        node.title = resolved.title;
        node.width = 420;
        node.height = 240;
        setNodes((nodes) => [...nodes, node]);
    }, [getCanvasCenter, nodesRef, project, projectLoaded, setNodes]);
}
