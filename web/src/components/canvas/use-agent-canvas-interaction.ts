import { useCallback, useLayoutEffect, useRef } from "react";

/** Canvas context is published after the viewport DOM commits, including route changes. */
export function useAgentCanvasInteraction(canvasContext: object | null) {
    const panelRef = useRef<HTMLElement>(null);
    const observerRef = useRef<MutationObserver | null>(null);
    const setPanelRef = useCallback((panel: HTMLElement | null) => {
        panelRef.current = panel;
        // AnimatePresence can detach after exit without another parent commit.
        if (!panel) {
            observerRef.current?.disconnect();
            observerRef.current = null;
        }
    }, []);
    // Rebind after commits: the panel can open later and Motion keeps its ref stable.
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;
        const viewport = canvasContext
            ? document.querySelector<HTMLElement>("#canvas-main [data-canvas-viewport]")
            : null;
        const sync = () => {
            const interacting = viewport?.getAttribute("data-canvas-viewport-interacting") === "true"
                || viewport?.getAttribute("data-canvas-node-dragging") === "true";
            if (interacting) {
                if (panel.dataset.canvasInteracting !== "true") panel.dataset.canvasInteracting = "true";
            } else if (panel.hasAttribute("data-canvas-interacting")) {
                panel.removeAttribute("data-canvas-interacting");
            }
        };
        const observer = viewport ? new MutationObserver(sync) : null;
        observerRef.current = observer;
        if (viewport) observer!.observe(viewport, {
            attributes: true,
            attributeFilter: ["data-canvas-viewport-interacting", "data-canvas-node-dragging"],
        });
        sync();
        return () => observer?.disconnect();
    });
    return setPanelRef;
}
