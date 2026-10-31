import { CanvasPlaybackController, VIDEO_HOVER_DELAY_MS } from "./canvas-playback";
import { subscribeMediaPlaybackFocus } from "./media-playback-focus";

/** A mouse visit survives viewport suspension, but never retries a blocked play in a loop. */
export function bindCanvasVideoHover(box: HTMLElement, controller: CanvasPlaybackController, nodeId: string, identity: string) {
    const document = box.ownerDocument;
    const viewport = box.closest("[data-canvas-viewport]");
    let inside = false;
    let visible = true;
    let attempted = false;
    let point: { x: number; y: number } | null = null;
    let buttons = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => {
        clearTimeout(timer);
        timer = undefined;
    };
    const owns = (current: ReturnType<CanvasPlaybackController["getSnapshot"]>) => current?.nodeId === nodeId && current.identity === identity;
    const eligible = () => {
        if (
            !inside ||
            !visible ||
            buttons ||
            !box.isConnected ||
            document.hidden ||
            viewport?.getAttribute("data-canvas-viewport-interacting") === "true" ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
            !controller.canPreview(nodeId, identity)
        )
            return false;
        // Transforms can move a node away from a stationary pointer without a new enter event.
        if (point && typeof document.elementFromPoint === "function") {
            const hit = document.elementFromPoint(point.x, point.y);
            if (!hit || !box.contains(hit)) return false;
        }
        return true;
    };
    const schedule = () => {
        if (!eligible()) {
            clear();
            return;
        }
        if (attempted || timer !== undefined) return;
        timer = setTimeout(() => {
            timer = undefined;
            if (!eligible()) return;
            attempted = true;
            if (!controller.preview(nodeId, identity)) attempted = false;
        }, VIDEO_HOVER_DELAY_MS);
    };
    const suspend = (leave: boolean) => {
        clear();
        if (leave) {
            inside = false;
            point = null;
            buttons = 0;
        }
        const current = controller.getSnapshot();
        if (current && owns(current)) controller.leave(current.token);
        attempted = false;
    };
    const enter = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        inside = true;
        attempted = false;
        point = { x: event.clientX, y: event.clientY };
        buttons = event.buttons;
        schedule();
    };
    const move = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        inside = true;
        point = { x: event.clientX, y: event.clientY };
        buttons = event.buttons;
        schedule();
    };
    const down = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        buttons = event.buttons;
        clear();
    };
    const leave = () => suspend(true);
    const hidden = () => {
        if (document.hidden) leave();
    };
    const unsubscribe = controller.subscribe(() => {
        const current = controller.getSnapshot();
        if (current && !owns(current)) attempted = false;
        schedule();
    });
    const unsubscribeFocus = subscribeMediaPlaybackFocus(schedule);
    const observer = new MutationObserver(() => {
        if (viewport?.getAttribute("data-canvas-viewport-interacting") === "true") suspend(false);
        else schedule();
    });
    if (viewport) observer.observe(viewport, { attributes: true, attributeFilter: ["data-canvas-viewport-interacting"] });
    const visibility =
        typeof IntersectionObserver === "undefined"
            ? undefined
            : new IntersectionObserver((entries) => {
                  visible = entries.some((entry) => entry.isIntersecting);
                  if (!visible) {
                      suspend(false);
                      const current = controller.getSnapshot();
                      if (current && owns(current)) {
                          controller.pause("offscreen");
                          controller.release(current.token);
                      }
                  } else schedule();
              });
    visibility?.observe(box);
    box.addEventListener("pointerenter", enter);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointerup", move);
    box.addEventListener("pointerleave", leave);
    box.addEventListener("pointercancel", leave);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hidden);
    return () => {
        unsubscribe();
        unsubscribeFocus();
        observer.disconnect();
        visibility?.disconnect();
        suspend(true);
        box.removeEventListener("pointerenter", enter);
        box.removeEventListener("pointermove", move);
        box.removeEventListener("pointerdown", down);
        box.removeEventListener("pointerup", move);
        box.removeEventListener("pointerleave", leave);
        box.removeEventListener("pointercancel", leave);
        window.removeEventListener("blur", leave);
        document.removeEventListener("visibilitychange", hidden);
        const current = controller.getSnapshot();
        if (current && owns(current)) controller.release(current.token);
    };
}
