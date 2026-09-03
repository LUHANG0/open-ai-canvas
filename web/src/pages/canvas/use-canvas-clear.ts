import { useCallback, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CanvasConnection, CanvasNodeData } from "@/types/canvas";

type NullableNodeIdSetter = Dispatch<SetStateAction<string | null>>;

export interface CanvasClearUiResetters {
    textEditor: NullableNodeIdSetter;
    drawing: NullableNodeIdSetter;
    info: NullableNodeIdSetter;
    subtitle: NullableNodeIdSetter;
    crop: NullableNodeIdSetter;
    maskEdit: NullableNodeIdSetter;
    annotation: NullableNodeIdSetter;
    angle: NullableNodeIdSetter;
    emotion: NullableNodeIdSetter;
    preview: NullableNodeIdSetter;
    running: NullableNodeIdSetter;
}

interface ClearCanvasWorkspaceOptions {
    setNodes: Dispatch<SetStateAction<CanvasNodeData[]>>;
    setConnections: Dispatch<SetStateAction<CanvasConnection[]>>;
    resetters: CanvasClearUiResetters;
    deselectCanvas: () => void;
    setClearConfirmOpen: Dispatch<SetStateAction<boolean>>;
    clearCanvasFiles: () => void;
}

export function clearCanvasWorkspace({ setNodes, setConnections, resetters, deselectCanvas, setClearConfirmOpen, clearCanvasFiles }: ClearCanvasWorkspaceOptions) {
    // 清空操作仍可撤销，因此绘图文档在项目永久删除前继续保留。
    setNodes([]);
    setConnections([]);
    Object.values(resetters).forEach((setNodeId) => setNodeId(null));
    deselectCanvas();
    setClearConfirmOpen(false);
    clearCanvasFiles();
}

export function useCanvasClear(options: ClearCanvasWorkspaceOptions) {
    const optionsRef = useRef(options);
    optionsRef.current = options;
    return useCallback(() => clearCanvasWorkspace(optionsRef.current), []);
}
