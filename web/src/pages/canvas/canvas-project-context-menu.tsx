import { lazy, Suspense, useEffect, type ComponentProps } from "react";

import { CanvasNodeType, type CanvasNodeData, type CanvasNodeTypeId, type CanvasWorkspaceMode, type ContextMenuState, type Position } from "@/types/canvas";
import { canvasContextMenuDeleteTarget, canvasContextMenuNodeIds, canvasContextMenuTargetPosition } from "./canvas-context-menu-routing";

const CanvasNodeContextMenu = lazy(() => import("@/components/canvas/canvas-context-menu").then((module) => ({ default: module.CanvasNodeContextMenu })));

type CanvasNodeContextMenuProps = ComponentProps<typeof import("@/components/canvas/canvas-context-menu").CanvasNodeContextMenu>;
type CanvasAssetCategory = NonNullable<NonNullable<CanvasNodeData["metadata"]>["assetCategory"]>;

type CanvasProjectContextMenuProps = {
    menu: ContextMenuState | null;
    node: CanvasNodeData | null;
    workspaceMode: CanvasWorkspaceMode;
    isProjectLinked: boolean;
    canUndo: boolean;
    canRedo: boolean;
    canPaste: boolean;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    onClose: () => void;
    onAddNode: (type: CanvasNodeTypeId, position: Position) => void;
    onAddFolder: (position: Position) => void;
    onChooseStyle: () => void;
    onOpenDirector: (position?: Position) => void;
    onUpload: (nodeId: string | undefined, position: Position) => void;
    onOpenAssets: (position: Position) => void;
    onOpenProjectCharacters: (position: Position) => void;
    onUndo: () => void;
    onRedo: () => void;
    onPaste: (position: Position) => void;
    onCopyNodes: (nodeIds: Set<string>) => void;
    onDuplicate: (nodeId: string) => void;
    onDeleteNodes: (nodeIds: Set<string>) => void;
    onDeleteConnection: (connectionId: string) => void;
    onSaveAsset: (node: CanvasNodeData) => void | Promise<unknown>;
    onPreviewNode: (nodeId: string) => void;
    onEditText: (node: CanvasNodeData) => void;
    onOpenDrawing: (node: CanvasNodeData) => void;
    onGenerateImage: (node: CanvasNodeData) => void;
    onCopyContent: (node: CanvasNodeData | null) => void | Promise<void>;
    onCopyMediaUrl: (node: CanvasNodeData | null) => void | Promise<void>;
    onUploadToArkPrivateAsset: (node: CanvasNodeData) => void;
    onSetAssetCategory: (nodeId: string, category: CanvasAssetCategory) => void;
    onToggleFrame: (nodeId: string) => void;
};

export function CanvasProjectContextMenu({ menu, node, screenToCanvas, ...props }: CanvasProjectContextMenuProps) {
    if (!menu) return null;
    const menuPosition = () => canvasContextMenuTargetPosition(menu, screenToCanvas);
    return (
        <Suspense fallback={<CanvasContextMenuLoading menu={menu} onClose={props.onClose} />}>
            <CanvasNodeContextMenu
                menu={menu}
                node={node}
                workspaceMode={props.workspaceMode}
                isProjectLinked={props.isProjectLinked}
                canUndo={props.canUndo}
                canRedo={props.canRedo}
                canPaste={props.canPaste}
                onClose={props.onClose}
                onAddNode={(type) => {
                    if (menu.type === "canvas") props.onAddNode(type, menu.position);
                }}
                onAddFolder={() => {
                    if (menu.type === "canvas") props.onAddFolder(menu.position);
                }}
                onChooseStyle={props.onChooseStyle}
                onOpenDirector={props.onOpenDirector}
                onUpload={() => props.onUpload(menu.type === "node" ? menu.nodeId : undefined, menuPosition())}
                onOpenAssets={() => props.onOpenAssets(menuPosition())}
                onOpenProjectCharacters={() => props.onOpenProjectCharacters(menuPosition())}
                onUndo={props.onUndo}
                onRedo={props.onRedo}
                onPaste={() => props.onPaste(menuPosition())}
                onCopyNode={() => {
                    if (menu.type === "node") props.onCopyNodes(canvasContextMenuNodeIds(menu));
                }}
                onDuplicate={() => {
                    if (menu.type === "node") props.onDuplicate(menu.nodeId);
                }}
                onDelete={() => {
                    const target = canvasContextMenuDeleteTarget(menu);
                    if (target?.type === "node") props.onDeleteNodes(new Set([target.id]));
                    else if (target?.type === "connection") props.onDeleteConnection(target.id);
                }}
                onSaveAsset={() => {
                    if (node) void props.onSaveAsset(node);
                }}
                onViewMedia={() => {
                    if (node) props.onPreviewNode(node.id);
                }}
                onEditText={() => {
                    if (node) props.onEditText(node);
                }}
                onOpenDrawing={() => {
                    if (node) props.onOpenDrawing(node);
                }}
                onGenerateImage={() => {
                    if (node) props.onGenerateImage(node);
                }}
                onCopyContent={() => void props.onCopyContent(node)}
                onCopyMediaUrl={() => void props.onCopyMediaUrl(node)}
                onUploadToArkPrivateAsset={() => {
                    if (node?.type === CanvasNodeType.Image) props.onUploadToArkPrivateAsset(node);
                }}
                onSetAssetCategory={(category) => {
                    if (menu.type === "node") props.onSetAssetCategory(menu.nodeId, category);
                }}
                onToggleFrame={() => {
                    if (node?.type === CanvasNodeType.Frame) props.onToggleFrame(node.id);
                }}
            />
        </Suspense>
    );
}

function CanvasContextMenuLoading({ menu, onClose }: Pick<CanvasNodeContextMenuProps, "menu" | "onClose">) {
    useEffect(() => {
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", closeOnEscape);
        return () => window.removeEventListener("keydown", closeOnEscape);
    }, [onClose]);

    return (
        <div
            data-canvas-no-zoom
            className="fixed z-[var(--z-popover)] inline-flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs text-foreground shadow-lg"
            style={{ left: menu.x, top: menu.y }}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <span role="status" aria-live="polite">正在加载菜单…</span>
            <button type="button" className="rounded px-1.5 py-0.5 hover:bg-muted" onClick={onClose} aria-label="关闭画布菜单">关闭</button>
        </div>
    );
}
