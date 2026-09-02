import { useState } from "react";

import type { CanvasBackgroundMode } from "@/lib/canvas-theme";
import type { CanvasToolMode, ContextMenuState } from "@/types/canvas";

export function useCanvasWorkspaceUiState() {
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [isMiniMapOpen, setIsMiniMapOpen] = useState(false);
    const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>("lines");
    const [showImageInfo, setShowImageInfo] = useState(false);
    const [canvasTool, setCanvasTool] = useState<CanvasToolMode>("move");

    return {
        backgroundMode,
        canvasTool,
        contextMenu,
        hoveredNodeId,
        isMiniMapOpen,
        setBackgroundMode,
        setCanvasTool,
        setContextMenu,
        setHoveredNodeId,
        setIsMiniMapOpen,
        setShowImageInfo,
        showImageInfo,
    };
}
