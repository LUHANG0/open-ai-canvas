import { FloatingDock } from "@/components/ui/aceternity/floating-dock";
import { canvasThemes } from "@/lib/canvas-theme";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import type { CanvasAlignmentMode } from "@/lib/canvas/canvas-layout";
import { defaultToolbarPrefs, readToolbarPrefs, resolveToolbarEntries, type ToolContext, type ToolbarHandlers } from "@/lib/canvas/tool-registry";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasProjectSelectionToolbarContentProps = {
    count: number;
    selectedVideoCount: number;
    layoutEligibleCount: number;
    storyboardEligibleCount: number;
    referenceGroupEligibleCount: number;
    batchConnectEligibleCount: number;
    mergingVideos: boolean;
    onAlign: (mode: CanvasAlignmentMode) => void;
    onArrange: (mode: "row" | "column" | "grid" | "flow") => void;
    onCreateStoryboard: () => void;
    onCreateReferenceGroup: () => void;
    onBatchConnect: () => void;
    onMergeVideos: () => void;
};

export function CanvasProjectSelectionToolbarContent({
    count,
    selectedVideoCount,
    layoutEligibleCount,
    storyboardEligibleCount,
    referenceGroupEligibleCount,
    batchConnectEligibleCount,
    mergingVideos,
    onAlign,
    onArrange,
    onCreateStoryboard,
    onCreateReferenceGroup,
    onBatchConnect,
    onMergeVideos,
}: CanvasProjectSelectionToolbarContentProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    const handlers = {
        onAlign,
        onArrange,
        onCreateStoryboard,
        onCreateReferenceGroup,
        onBatchConnect,
        onMergeVideos,
    } as Partial<ToolbarHandlers> as ToolbarHandlers;

    const ctx: ToolContext = {
        selectedCount: count,
        selectedNodeTypes: new Set(),
        selectedVideoCount,
        layoutEligibleCount,
        storyboardEligibleCount,
        referenceGroupEligibleCount,
        batchConnectEligibleCount,
        canvasTool: "move",
        workspaceMode: "professional",
        isProjectLinked: false,
        canUndo: false,
        canRedo: false,
        extractingVideoFrames: false,
        extractingAudio: false,
        trimmingVideo: false,
        mergingVideos,
        addPanelOpen: false,
        appearancePanelOpen: false,
        settingsPanelOpen: false,
        handlers,
    };

    const prefs = readToolbarPrefs("selection") ?? defaultToolbarPrefs("selection");
    const items = resolveToolbarEntries("selection", ctx, prefs);

    return <FloatingDock items={items} size="compact" magnify={false} className="canvas-floating-dock" style={canvasDockStyle(theme)} ariaLabel="多选节点布局工具" />;
}
