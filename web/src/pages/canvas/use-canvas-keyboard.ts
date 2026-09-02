import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { CanvasNodeData, ContextMenuState } from "@/types/canvas";

type UseCanvasKeyboardOptions = {
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
    saveCanvasProject: () => unknown;
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
    assistantOpen: boolean;
    closeAgent: () => void;
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

const CANVAS_KEYBOARD_UI_SELECTOR = [
    "[data-canvas-no-zoom]",
    "[data-canvas-overlay]",
    ".pc-canvas-overlay",
    ".ant-dropdown",
    ".ant-popover",
    ".ant-select-dropdown",
    "[data-canvas-context-menu]",
].join(", ");

const CANVAS_BLOCKING_OVERLAY_SELECTOR = [
    ".ant-modal-wrap",
    ".ant-drawer",
    "[role='dialog'][aria-modal='true']",
].join(", ");

export function isCanvasKeyboardUiTarget(target: Pick<Element, "closest"> | null | undefined) {
    return Boolean(target?.closest(CANVAS_KEYBOARD_UI_SELECTOR));
}

export function hasVisibleCanvasBlockingOverlay(root: Pick<Document, "querySelectorAll"> = document) {
    return Array.from(root.querySelectorAll(CANVAS_BLOCKING_OVERLAY_SELECTOR)).some((element) => isVisibleOverlayElement(element));
}

function isVisibleOverlayElement(element: Element) {
    if (!(element instanceof HTMLElement)) return true;
    if (element.hidden || element.closest("[inert]")) return false;
    const view = element.ownerDocument.defaultView;
    const style = view?.getComputedStyle(element);
    return style?.display !== "none" && style?.visibility !== "hidden" && element.getClientRects().length > 0;
}

export function useCanvasKeyboard({
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
    assistantOpen,
    closeAgent,
    onOpenSearch,
    beginBatchConnection,
}: UseCanvasKeyboardOptions) {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;
            const isTextEditingTarget = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || Boolean(target?.closest("[contenteditable='true']"));

            // 输入法组合、文本编辑、弹窗和面板各自拥有键盘；画布不能在捕获阶段抢走快捷键。
            if (event.isComposing || isTextEditingTarget || hasVisibleCanvasBlockingOverlay() || isCanvasKeyboardUiTarget(target)) return;

            if (isModifierShortcut && !event.altKey && (key === "+" || key === "=" || event.code === "NumpadAdd")) {
                event.preventDefault();
                zoomCanvasIn();
                return;
            }
            if (isModifierShortcut && !event.altKey && (key === "-" || key === "_" || event.code === "NumpadSubtract")) {
                event.preventDefault();
                zoomCanvasOut();
                return;
            }
            if (isModifierShortcut && !event.altKey && (key === "0" || event.code === "Numpad0")) {
                event.preventDefault();
                zoomToActualSize();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "s") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) void saveCanvasProject();
                return;
            }
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
                // 右侧 Agent 是画布最上层工作区；先收纳面板，第二次 Esc 再处理节点选择或专注模式。
                if (assistantOpen) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeAgent();
                    return;
                }
                // 沉浸专注：无选中且无弹窗/下拉/右键菜单时，Esc 退出专注；否则保留原有取消选择行为。
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
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true']") || hasVisibleCanvasBlockingOverlay() || isCanvasKeyboardUiTarget(target)) return;
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
    }, [assistantOpen, beginBatchConnection, cancelSelectionBox, closeAgent, copySelectedNodes, deleteConnection, deleteNodes, deselectCanvas, exitFocusMode, fitCanvasContent, fitCanvasSelection, focusMode, nodesRef, onOpenSearch, pasteCopiedNodes, pasteSystemClipboard, redoCanvas, restoreCopiedNodesFromText, saveCanvasProject, selectedConnectionId, selectedNodeIdsRef, setAnnotationNodeId, setContextMenu, setCropNodeId, setInfoNodeId, setMaskEditNodeId, setSelectedConnectionId, setSelectedNodeIds, setShortcutRequestNonce, shouldPreferCopiedNodes, toggleFocusMode, undoCanvas, zoomCanvasIn, zoomCanvasOut, zoomToActualSize]);
}
