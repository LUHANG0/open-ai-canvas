import { lazy, Suspense, type MutableRefObject } from "react";

import type { CanvasVideoFrameParams } from "@/components/canvas/canvas-video-frame-dialog";
import type { CanvasVideoSegmentParams } from "@/components/canvas/canvas-video-segment-dialog";
import { WorkspaceState } from "@/components/ui/pc/workspace-state";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { TimelineDirectMedia, TimelineProject } from "@/types/timeline";
import { syncSavedCanvasSubtitles } from "./canvas-timeline-dialog-updates";

const CanvasSubtitleDialog = lazy(() => import("@/components/canvas/canvas-subtitle-dialog").then((module) => ({ default: module.CanvasSubtitleDialog })));
const CanvasTimelineDialog = lazy(() => import("@/components/canvas/canvas-timeline-dialog").then((module) => ({ default: module.CanvasTimelineDialog })));
const CanvasVideoFrameDialog = lazy(() => import("@/components/canvas/canvas-video-frame-dialog").then((module) => ({ default: module.CanvasVideoFrameDialog })));
const CanvasVideoSegmentDialog = lazy(() => import("@/components/canvas/canvas-video-segment-dialog").then((module) => ({ default: module.CanvasVideoSegmentDialog })));

type CanvasProjectTimelineDialogsProps = {
    projectId: string;
    config: AiConfig;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    timeline: TimelineProject | null;
    subtitleNode: CanvasNodeData | null;
    frameNode: CanvasNodeData | null;
    segmentNode: CanvasNodeData | null;
    segmentDialogMode: CanvasVideoSegmentParams["mode"] | null;
    timelineNode: CanvasNodeData | null;
    onCloseSubtitle: () => void;
    onUpdateNodeMetadata: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onUpdateTimeline: (timeline: TimelineProject) => void;
    onCloseFrame: () => void;
    onExtractVideoFrames: (node: CanvasNodeData, params: CanvasVideoFrameParams) => void | Promise<void>;
    onCloseSegment: () => void;
    onConfirmVideoSegment: (node: CanvasNodeData, params: CanvasVideoSegmentParams) => void | Promise<void>;
    onCloseTimeline: () => void;
    onOpenSubtitle: (nodeId: string) => void;
    onOpenAssetLibrary: () => void;
    onOpenProjectAssets: () => void;
    onUploadLocalFiles: (files: File[]) => Promise<TimelineDirectMedia[]>;
    addNodeToTimelineRef: MutableRefObject<((node: CanvasNodeData) => void) | null>;
    addMediaToTimelineRef: MutableRefObject<((media: TimelineDirectMedia) => void) | null>;
    onCreateAssembledNode: (blob: Blob, title: string) => Promise<CanvasNodeData | null>;
};

export function CanvasProjectTimelineDialogs({
    projectId,
    config,
    nodes,
    connections,
    timeline,
    subtitleNode,
    frameNode,
    segmentNode,
    segmentDialogMode,
    timelineNode,
    onCloseSubtitle,
    onUpdateNodeMetadata,
    onUpdateTimeline,
    onCloseFrame,
    onExtractVideoFrames,
    onCloseSegment,
    onConfirmVideoSegment,
    onCloseTimeline,
    onOpenSubtitle,
    onOpenAssetLibrary,
    onOpenProjectAssets,
    onUploadLocalFiles,
    addNodeToTimelineRef,
    addMediaToTimelineRef,
    onCreateAssembledNode,
}: CanvasProjectTimelineDialogsProps) {
    return (
        <>
            {subtitleNode ? (
                <Suspense fallback={<CanvasTimelineDialogLoading title="正在加载字幕编辑" description="正在准备字幕与语音识别工具。" />}>
                    <CanvasSubtitleDialog
                        node={subtitleNode}
                        open
                        projectId={projectId}
                        config={config}
                        onClose={onCloseSubtitle}
                        onSave={(nodeId, patch) => {
                            onUpdateNodeMetadata(nodeId, patch);
                            const nextTimeline = syncSavedCanvasSubtitles(timeline, nodeId, patch);
                            if (nextTimeline && nextTimeline !== timeline) onUpdateTimeline(nextTimeline);
                        }}
                    />
                </Suspense>
            ) : null}

            {frameNode ? (
                <Suspense fallback={<CanvasTimelineDialogLoading title="正在加载视频抽帧" description="正在准备帧提取工具。" />}>
                    <CanvasVideoFrameDialog node={frameNode} open onClose={onCloseFrame} onConfirm={(params) => void onExtractVideoFrames(frameNode, params)} />
                </Suspense>
            ) : null}

            {segmentNode && segmentDialogMode ? (
                <Suspense fallback={<CanvasTimelineDialogLoading title="正在加载视频分段" description="正在准备片段选择与处理工具。" />}>
                    <CanvasVideoSegmentDialog
                        node={segmentNode}
                        nodes={nodes}
                        connections={connections}
                        open
                        mode={segmentDialogMode}
                        config={config}
                        timeline={timeline}
                        onClose={onCloseSegment}
                        onConfirm={(params) => void onConfirmVideoSegment(segmentNode, params)}
                    />
                </Suspense>
            ) : null}

            {timelineNode ? (
                <Suspense fallback={<CanvasTimelineDialogLoading title="正在加载视频时间线" description="正在准备剪辑轨道与素材。" />}>
                    <CanvasTimelineDialog
                        node={timelineNode}
                        open
                        nodes={nodes}
                        timeline={timeline}
                        onClose={onCloseTimeline}
                        onOpenSubtitleDialog={(nodeId) => {
                            onCloseTimeline();
                            onOpenSubtitle(nodeId);
                        }}
                        onSave={onUpdateTimeline}
                        onSaveSubtitles={(nodeId, entries) =>
                            onUpdateNodeMetadata(nodeId, {
                                subtitleEntries: entries,
                                ...(entries.length ? {} : { subtitleHighlights: [] }),
                                subtitleUpdatedAt: new Date().toISOString(),
                            })
                        }
                        onOpenAssetLibrary={onOpenAssetLibrary}
                        onOpenProjectAssets={onOpenProjectAssets}
                        onUploadLocalFiles={onUploadLocalFiles}
                        addNodeToTimelineRef={addNodeToTimelineRef}
                        addMediaToTimelineRef={addMediaToTimelineRef}
                        onCreateAssembledNode={onCreateAssembledNode}
                    />
                </Suspense>
            ) : null}
        </>
    );
}

function CanvasTimelineDialogLoading({ title, description }: { title: string; description: string }) {
    return (
        <div className="fixed inset-0 z-[var(--z-toast)] grid place-items-center bg-background px-5 text-foreground" role="status" aria-live="polite">
            <WorkspaceState icon="loading" title={title} description={description} />
        </div>
    );
}
