import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData, ContextMenuState } from "@/types/canvas";

type UseCanvasKeyboardOptions = {
    enabled?: boolean;
    nodesRef: { current: CanvasNodeData[] };
    selectedNodeIdsRef: { current: Set<string> };
    selectedConnectionId: string | null;
    setSelectedNodeIds: Dispatch<SetStateAction<Set<string>>>;
    setSelectedConnectionId: Dispatch<SetStateAction<string | null>>;
    setContextMenu: Dispatch<SetStateAction<ContextMenuState | null>>;
    setShortcutRequestNonce: Dispatch<SetStateAction<number>>;
    setInfoNodeId: Dispatch<SetStateAction<string | null>>;
    setCropNodeId: Dispatch<SetStateAction<string | null>>;
    setMaskEditNodeId: Dispatch<SetStateAction<string | null>>;
    setAnnotationNodeId: Dispatch<SetStateAction<string | null>>;
    saveCanvasProject: (options?: { requireRemote?: boolean }) => unknown;
    zoomToActualSize: () => void;
    fitCanvasContent: () => void;
    fitCanvasSelection: () => void;
    undoCanvas: () => void;
    redoCanvas: () => void;
    cancelSelectionBox: () => void;
    copySelectedNodes: () => void;
    pasteCopiedNodes: () => boolean;
    restoreCopiedNodesFromText: (value: string) => boolean;
    shouldPreferCopiedNodes: () => boolean;
    pasteSystemClipboard: (position?: undefined, clipboardEvent?: ClipboardEvent | null) => Promise<boolean> | boolean;
    deleteNodes: (ids: Set<string>) => void;
    deleteConnection: (connectionId: string) => void;
    deselectCanvas: () => void;
    zoomCanvasIn: () => void;
    zoomCanvasOut: () => void;
    focusMode: boolean;
    exitFocusMode: () => void;
    toggleFocusMode: () => void;
    onOpenSearch: () => void;
    beginBatchConnection: () => void;
};

type TextSelectionLike = {
    isCollapsed: boolean;
    rangeCount: number;
    toString(): string;
};

export function hasCanvasTextSelection(selection: TextSelectionLike | null | undefined) {
    return Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0 && selection.toString());
}

const canvasOverlaySelector = ".ant-modal-wrap, .ant-dropdown, .ant-select-dropdown, .ant-popover, [data-canvas-context-menu], [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox'], dialog[open]";
const canvasToolbarSelector = ".canvas-node-toolbar, .canvas-node-toolbar-menu";

function hasVisibleCanvasOverlay() {
    overlays: for (const overlay of document.querySelectorAll(canvasOverlaySelector)) {
        for (let element: Element | null = overlay; element; element = element.parentElement) {
            if (element.matches("[hidden], [inert], [aria-hidden='true'], dialog:not([open]), .ant-dropdown-hidden, .ant-select-dropdown-hidden, .ant-popover-hidden")) continue overlays;
            const style = window.getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.contentVisibility === "hidden" || style.opacity === "0") continue overlays;
        }
        return true;
    }
    return false;
}

function ownsCanvasKeyboard(target: Element | null) {
    const editable = target?.closest("[contenteditable]");
    return Boolean(
        (editable && editable.getAttribute("contenteditable") !== "false")
        || target?.closest("input, textarea, select, button, a[href], [role='button'], [role='textbox'], [role='combobox'], [role='slider'], [role='spinbutton'], [data-canvas-no-zoom]"),
    );
}

export function useCanvasKeyboard({
    enabled = true,
    nodesRef,
    selectedNodeIdsRef,
    selectedConnectionId,
    setSelectedNodeIds,
    setSelectedConnectionId,
    setContextMenu,
    setShortcutRequestNonce,
    setInfoNodeId,
    setCropNodeId,
    setMaskEditNodeId,
    setAnnotationNodeId,
    saveCanvasProject,
    zoomToActualSize,
    fitCanvasContent,
    fitCanvasSelection,
    undoCanvas,
    redoCanvas,
    cancelSelectionBox,
    copySelectedNodes,
    pasteCopiedNodes,
    restoreCopiedNodesFromText,
    shouldPreferCopiedNodes,
    pasteSystemClipboard,
    deleteNodes,
    deleteConnection,
    deselectCanvas,
    zoomCanvasIn,
    zoomCanvasOut,
    focusMode,
    exitFocusMode,
    toggleFocusMode,
    onOpenSearch,
    beginBatchConnection,
}: UseCanvasKeyboardOptions) {
    useEffect(() => {
        if (!enabled) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            // Capture listeners must yield before preventing defaults or mutating the canvas.
            // Overlays own Escape as well, even before focus moves into their portal.
            if (event.defaultPrevented || target?.closest(canvasToolbarSelector) || hasVisibleCanvasOverlay()) return;
            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;
            const hasOwnKeyboardScope = ownsCanvasKeyboard(target);

            if (isModifierShortcut && !event.altKey && (key === "+" || key === "=" || event.code === "NumpadAdd")) {
                event.preventDefault();
                if (!hasOwnKeyboardScope) zoomCanvasIn();
                return;
            }
            if (isModifierShortcut && !event.altKey && (key === "-" || key === "_" || event.code === "NumpadSubtract")) {
                event.preventDefault();
                if (!hasOwnKeyboardScope) zoomCanvasOut();
                return;
            }
            if (isModifierShortcut && !event.altKey && (key === "0" || event.code === "Numpad0")) {
                event.preventDefault();
                if (!hasOwnKeyboardScope) zoomToActualSize();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "s") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) void saveCanvasProject({ requireRemote: false });
                return;
            }
            if (hasOwnKeyboardScope) return;
            if (isModifierShortcut && !event.altKey && key === "f") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) {
                    if (event.shiftKey) toggleFocusMode();
                    else onOpenSearch();
                }
                return;
            }
            if (event.altKey && !isModifierShortcut && key === "l") {
                event.preventDefault();
                if (!event.repeat && selectedNodeIdsRef.current.size > 1) beginBatchConnection();
                return;
            }
            if (event.key === "?" && !isModifierShortcut && !event.altKey) {
                event.preventDefault();
                setShortcutRequestNonce((value) => value + 1);
                return;
            }
            if (isModifierShortcut && !event.altKey && (key === "1" || key === "2" || key === "3")) {
                event.preventDefault();
                if (key === "1") zoomToActualSize();
                else if (key === "2") fitCanvasContent();
                else fitCanvasSelection();
                return;
            }
            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }
            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }
            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                cancelSelectionBox();
                return;
            }
            if (isModifierShortcut && !event.altKey && key === "c") {
                if (hasCanvasTextSelection(window.getSelection())) return;
                event.preventDefault();
                copySelectedNodes();
                return;
            }
            if (isModifierShortcut && !event.altKey && key === "v") {
                // 有些浏览器/焦点状态不会继续派发 paste 事件；内部节点复制必须有 keydown 兜底。
                if (shouldPreferCopiedNodes()) {
                    event.preventDefault();
                    if (pasteCopiedNodes()) return;
                    void navigator.clipboard?.readText?.().then((text) => {
                        if (restoreCopiedNodesFromText(text)) pasteCopiedNodes();
                    }).catch(() => undefined);
                }
                return;
            }
            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) deleteNodes(new Set(selectedNodeIdsRef.current));
                else if (selectedConnectionId) deleteConnection(selectedConnectionId);
            }
            if (event.key === "Escape") {
                // Open overlays have already retained Escape; only the canvas remains.
                if (focusMode && !selectedNodeIdsRef.current.size) {
                    event.stopPropagation();
                    exitFocusMode();
                    return;
                }
                deselectCanvas();
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setAnnotationNodeId(null);
            }
        };

        const handlePaste = (event: ClipboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.defaultPrevented || target?.closest(canvasToolbarSelector) || ownsCanvasKeyboard(target) || hasVisibleCanvasOverlay()) return;
            // 节点标记写入失败或仍在写入时避开旧系统图片，其余情况保持系统内容优先。
            event.preventDefault();
            const text = event.clipboardData?.getData("text/plain") || "";
            if (text && restoreCopiedNodesFromText(text) && pasteCopiedNodes()) return;
            if (shouldPreferCopiedNodes() && pasteCopiedNodes()) return;
            void (async () => {
                const handled = await pasteSystemClipboard(undefined, event);
                if (!handled) pasteCopiedNodes();
            })();
        };

        window.addEventListener("keydown", handleKeyDown, true);
        window.addEventListener("paste", handlePaste, true);
        return () => {
            window.removeEventListener("keydown", handleKeyDown, true);
            window.removeEventListener("paste", handlePaste, true);
        };
    }, [enabled, beginBatchConnection, cancelSelectionBox, copySelectedNodes, deleteConnection, deleteNodes, deselectCanvas, exitFocusMode, fitCanvasContent, fitCanvasSelection, focusMode, nodesRef, onOpenSearch, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, restoreCopiedNodesFromText, saveCanvasProject, selectedConnectionId, selectedNodeIdsRef, setAnnotationNodeId, setContextMenu, setCropNodeId, setInfoNodeId, setMaskEditNodeId, setSelectedConnectionId, setSelectedNodeIds, setShortcutRequestNonce, shouldPreferCopiedNodes, toggleFocusMode, undoCanvas, zoomCanvasIn, zoomCanvasOut, zoomToActualSize]);
}
