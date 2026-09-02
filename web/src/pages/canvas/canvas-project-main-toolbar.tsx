import { CanvasToolbar } from "@/components/canvas/canvas-toolbar";
import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import { CanvasNodeType, type CanvasNodeTypeId, type CanvasToolMode, type CanvasWorkspaceMode } from "@/types/canvas";
import { canShowCanvasMainToolbar, canvasMainToolbarRightInset } from "./canvas-main-toolbar-state";

type CanvasProjectMainToolbarProps = {
    focusMode: boolean;
    focusDockRevealed: boolean;
    assistantOpen: boolean;
    assistantWidth: number;
    selectedNodeIds: ReadonlySet<string>;
    workspaceMode: CanvasWorkspaceMode;
    canvasTool: CanvasToolMode;
    projectLinked: boolean;
    canUndo: boolean;
    canRedo: boolean;
    backgroundMode: CanvasBackgroundMode;
    showImageInfo: boolean;
    onToolChange: (tool: CanvasToolMode) => void;
    onCreateNode: (type: CanvasNodeTypeId) => void;
    onCreateFolder: () => void;
    onChooseStyle: () => void;
    onOpenDirector: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onUpload: () => void;
    onDeleteNodes: (nodeIds: Set<string>) => void;
    onClear: () => void;
    onDeselect: () => void;
    onBackgroundModeChange: (mode: CanvasBackgroundMode) => void;
    onShowImageInfoChange: (show: boolean) => void;
    onOpenMyAssets: () => void;
    onOpenProjectCharacters: () => void;
};

export function CanvasProjectMainToolbar({
    focusMode,
    focusDockRevealed,
    assistantOpen,
    assistantWidth,
    selectedNodeIds,
    workspaceMode,
    canvasTool,
    projectLinked,
    canUndo,
    canRedo,
    backgroundMode,
    showImageInfo,
    onToolChange,
    onCreateNode,
    onCreateFolder,
    onChooseStyle,
    onOpenDirector,
    onUndo,
    onRedo,
    onUpload,
    onDeleteNodes,
    onClear,
    onDeselect,
    onBackgroundModeChange,
    onShowImageInfoChange,
    onOpenMyAssets,
    onOpenProjectCharacters,
}: CanvasProjectMainToolbarProps) {
    if (!canShowCanvasMainToolbar(focusMode, focusDockRevealed)) return null;

    return (
        <CanvasToolbar
            selectedCount={selectedNodeIds.size}
            workspaceMode={workspaceMode}
            rightInset={canvasMainToolbarRightInset(assistantOpen, assistantWidth)}
            canvasTool={canvasTool}
            onToolChange={onToolChange}
            isProjectLinked={projectLinked}
            canUndo={canUndo}
            canRedo={canRedo}
            backgroundMode={backgroundMode}
            showImageInfo={showImageInfo}
            onAddImage={() => onCreateNode(CanvasNodeType.Image)}
            onAddVideo={() => onCreateNode(CanvasNodeType.Video)}
            onAddAudio={() => onCreateNode(CanvasNodeType.Audio)}
            onAddText={() => onCreateNode(CanvasNodeType.Text)}
            onChooseStyle={onChooseStyle}
            onAddScript={() => onCreateNode(CanvasNodeType.Script)}
            onAddFrame={() => onCreateNode(CanvasNodeType.Frame)}
            onAddFolder={onCreateFolder}
            onAddDrawing={() => onCreateNode(CanvasNodeType.Drawing)}
            onAddExtensionNode={onCreateNode}
            onAddWorkflow={() => onCreateNode(CanvasNodeType.Config)}
            onOpenDirector={onOpenDirector}
            onUndo={onUndo}
            onRedo={onRedo}
            onUpload={onUpload}
            onDelete={() => onDeleteNodes(new Set(selectedNodeIds))}
            onClear={onClear}
            onDeselect={onDeselect}
            onBackgroundModeChange={onBackgroundModeChange}
            onShowImageInfoChange={onShowImageInfoChange}
            onOpenMyAssets={onOpenMyAssets}
            onOpenProjectCharacters={onOpenProjectCharacters}
        />
    );
}
