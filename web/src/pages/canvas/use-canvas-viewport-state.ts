import { useState } from "react";

import type { ViewportTransform } from "@/types/canvas";

const DEFAULT_CANVAS_VIEWPORT: ViewportTransform = { x: 0, y: 0, k: 1 };

export function useCanvasViewportState() {
    const [viewport, setViewport] = useState<ViewportTransform>(DEFAULT_CANVAS_VIEWPORT);

    return { setViewport, viewport };
}
