import { useEffect } from "react";

import { retainCanvasImage } from "@/services/canvas-image-loader";

/** Active images are pinned independently of the bounded detached warm LRU. */
export function useImagePresentationRetention(key: string, src: string, image?: HTMLImageElement) {
    useEffect(() => {
        if (!src) return;
        return retainCanvasImage(src);
    }, [key, src, image]);
}
