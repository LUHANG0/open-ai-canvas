import type { MutableRefObject } from "react";

import { CanvasSubtitleDialog } from "@/components/canvas/canvas-subtitle-dialog";
import { CanvasTimelineDialog } from "@/components/canvas/canvas-timeline-dialog";
import { CanvasVideoFrameDialog, type CanvasVideoFrameParams } from "@/components/canvas/canvas-video-frame-dialog";
import { CanvasVideoSegmentDialog, type CanvasVideoSegmentParams } from "@/components/canvas/canvas-video-segment-dialog";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasConnection, CanvasNodeData, CanvasNodeMetadata } from "@/types/canvas";
import type { TimelineDirectMedia, TimelineProject } from "@/types/timeline";
import { syncSavedCanvasSubtitles } from "./canvas-timeline-dialog-updates";

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
            ) : null}

            {frameNode ? <CanvasVideoFrameDialog node={frameNode} open onClose={onCloseFrame} onConfirm={(params) => void onExtractVideoFrames(frameNode, params)} /> : null}

            {segmentNode && segmentDialogMode ? (
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
            ) : null}

            {timelineNode ? (
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
            ) : null}
        </>
    );
}
