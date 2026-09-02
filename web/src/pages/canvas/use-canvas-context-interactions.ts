import { useCallback } from "react";
import type { Dispatch, MouseEvent as ReactMouseEvent, SetStateAction } from "react";
import { App } from "antd";
import type { ContextMenuState, Position } from "@/types/canvas";

type CanvasContextTarget = { closest: (selector: string) => unknown } | null;

type UseCanvasContextInteractionsOptions = {
    closeConnectionCreateMenu: () => void;
    pasteCopiedNodes: (position: Position) => boolean;
    pasteSystemClipboard: (position: Position) => Promise<boolean>;
    screenToCanvas: (clientX: number, clientY: number) => Position;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setDialogNodeId: Dispatch<SetStateAction<string | null>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setToolbarNodeId: Dispatch<SetStateAction<string | null>>;
    shouldPreferCopiedNodes: () => boolean;
};

export function classifyCanvasContextMenuTarget(target: CanvasContextTarget) {
    if (target?.closest("[data-node-id],[data-connection-id]")) return "content" as const;
    if (target?.closest("[data-canvas-no-zoom],.ant-modal,.ant-popover,.ant-dropdown")) return "overlay" as const;
    return "canvas" as const;
}

export async function attemptCanvasPaste({
    position,
    pasteCopiedNodes,
    pasteSystemClipboard,
    shouldPreferCopiedNodes,
}: Pick<UseCanvasContextInteractionsOptions, "pasteCopiedNodes" | "pasteSystemClipboard" | "shouldPreferCopiedNodes"> & { position: Position }) {
    if (shouldPreferCopiedNodes() && pasteCopiedNodes(position)) return "handled" as const;
    try {
        if (await pasteSystemClipboard(position)) return "handled" as const;
        return pasteCopiedNodes(position) ? ("handled" as const) : ("empty" as const);
    } catch {
        return pasteCopiedNodes(position) ? ("handled" as const) : ("unreadable" as const);
    }
}

export function useCanvasContextInteractions({
    closeConnectionCreateMenu,
    pasteCopiedNodes,
    pasteSystemClipboard,
    screenToCanvas,
    setContextMenu,
    setDialogNodeId,
    setSelectedConnectionId,
    setSelectedNodeIds,
    setToolbarNodeId,
    shouldPreferCopiedNodes,
}: UseCanvasContextInteractionsOptions) {
    const { message } = App.useApp();

    const pasteAtPosition = useCallback(
        (position: Position) => {
            void attemptCanvasPaste({ position, pasteCopiedNodes, pasteSystemClipboard, shouldPreferCopiedNodes }).then((result) => {
                if (result === "unreadable") message.warning("无法读取剪贴板内容");
            });
        },
        [message, pasteCopiedNodes, pasteSystemClipboard, shouldPreferCopiedNodes],
    );

    const handleCanvasContextMenu = useCallback(
        (event: ReactMouseEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const targetKind = classifyCanvasContextMenuTarget(target);
            if (targetKind === "content") return;
            event.preventDefault();
            event.stopPropagation();
            if (targetKind === "overlay") {
                setContextMenu(null);
                return;
            }
            closeConnectionCreateMenu();
            setContextMenu({ type: "canvas", x: event.clientX, y: event.clientY, position: screenToCanvas(event.clientX, event.clientY) });
        },
        [closeConnectionCreateMenu, screenToCanvas, setContextMenu],
    );

    const handleNodeContextMenu = useCallback(
        (event: ReactMouseEvent, id: string) => {
            event.preventDefault();
            event.stopPropagation();
            setSelectedNodeIds(new Set([id]));
            setSelectedConnectionId(null);
            closeConnectionCreateMenu();
            setToolbarNodeId(null);
            setDialogNodeId(null);
            setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
        },
        [closeConnectionCreateMenu, setContextMenu, setDialogNodeId, setSelectedConnectionId, setSelectedNodeIds, setToolbarNodeId],
    );

    const handleConnectionSelect = useCallback(
        (connectionId: string) => {
            setSelectedConnectionId(connectionId);
            setSelectedNodeIds(new Set());
            setContextMenu(null);
        },
        [setContextMenu, setSelectedConnectionId, setSelectedNodeIds],
    );

    const handleConnectionContextMenu = useCallback(
        (event: ReactMouseEvent<SVGPathElement>, connectionId: string) => {
            setSelectedConnectionId(connectionId);
            setSelectedNodeIds(new Set());
            closeConnectionCreateMenu();
            setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId });
        },
        [closeConnectionCreateMenu, setContextMenu, setSelectedConnectionId, setSelectedNodeIds],
    );

    return { handleCanvasContextMenu, handleConnectionContextMenu, handleConnectionSelect, handleNodeContextMenu, pasteAtPosition };
}
