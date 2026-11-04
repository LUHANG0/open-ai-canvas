import { useEffect, useLayoutEffect, useRef } from "react";

import { canvasImageDisplayVariant, canvasImagePixelRatio } from "@/lib/canvas/canvas-image-display-source";
import { canvasNodeVideoPreviewReference } from "@/lib/canvas/canvas-media-preview";
import { prepareCanvasMedia } from "@/services/canvas-media-source";
import type { CanvasImagePriority } from "@/services/canvas-image-loader";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type Interest = { controller: AbortController; readyUntil: number; handoff: boolean };

/** Reuse the render model's candidates; no independent viewport or mounting policy. */
export function useCanvasMediaInterests(candidates: CanvasNodeData[], immediate: Set<string>, scale: number, selected: Set<string>) {
    const interests = useRef(new Map<string, Interest>());
    useLayoutEffect(() => {
        if (!interests.current.size && candidates.every((node) => immediate.has(node.id))) return;
        const next = new Map<string, { storageKey?: string; src: string; variant: "original" | "thumbnail"; priority: CanvasImagePriority; estimatedPixels: number }>();
        const visibleKeys = new Set<string>();
        for (const node of candidates) {
            const priority = immediate.has(node.id) ? 0 : 1;
            let storageKey: string | undefined,
                src = "",
                variant: "original" | "thumbnail" = "original";
            let estimatedPixels = Infinity;
            if (node.type === CanvasNodeType.Image) {
                storageKey = node.metadata?.storageKey;
                src = node.metadata?.content || "";
                variant = canvasImageDisplayVariant(node, selected.size === 1 && selected.has(node.id) ? "full" : "preview", scale, canvasImagePixelRatio());
                if (node.metadata?.naturalWidth && node.metadata?.naturalHeight) estimatedPixels = node.metadata.naturalWidth * node.metadata.naturalHeight;
            } else if (node.type === CanvasNodeType.Video) {
                const preview = canvasNodeVideoPreviewReference(node);
                storageKey = preview?.storageKey;
                src = preview?.src || "";
                if (node.metadata?.videoPreview?.width && node.metadata.videoPreview.height) estimatedPixels = node.metadata.videoPreview.width * node.metadata.videoPreview.height;
            } else continue;
            if (!storageKey && !src) continue;
            const key = JSON.stringify([storageKey || src, variant]);
            if (!priority) {
                visibleKeys.add(key);
                next.delete(key);
                continue;
            }
            if (visibleKeys.has(key) || next.has(key) || next.size >= 8) continue;
            next.set(key, { storageKey, src, variant, priority, estimatedPixels });
        }
        for (const [key, interest] of interests.current) {
            if (next.has(key)) {
                interest.handoff = false;
                continue;
            }
            // A pending prewarm may already own a slot. Let a newly visible DOM
            // consumer join it across async access resolution, then release it.
            if (visibleKeys.has(key) && interest.readyUntil === Infinity) {
                interest.handoff = true;
                continue;
            }
            interest.controller.abort();
            interests.current.delete(key);
        }
        // Access descriptors do not guarantee dimensions. Use existing node/poster metadata
        // only as a scheduling hint, never for image quality, measured metadata or pixel charging.
        const ordered = [...next].sort(([, a], [, b]) => a.priority - b.priority || a.estimatedPixels - b.estimatedPixels);
        for (const [key, value] of ordered) {
            const previous = interests.current.get(key);
            if (previous && previous.readyUntil > Date.now()) continue;
            const controller = new AbortController();
            const interest: Interest = { controller, readyUntil: Infinity, handoff: false };
            interests.current.set(key, interest);
            void prepareCanvasMedia({ ...value, signal: controller.signal, onPreparing: () => previous?.controller.abort() })
                .then((result) => {
                    interest.readyUntil = Math.min(Date.now() + 60_000, result.source.validUntil);
                })
                .catch(() => {
                    interest.readyUntil = 0;
                })
                .finally(() => {
                    previous?.controller.abort();
                    if (interest.handoff && interests.current.get(key) === interest) {
                        controller.abort();
                        interests.current.delete(key);
                    }
                });
        }
    }, [candidates, immediate, scale, selected]);
    useEffect(
        () => () => {
            for (const interest of interests.current.values()) interest.controller.abort();
            interests.current.clear();
        },
        [],
    );
}
