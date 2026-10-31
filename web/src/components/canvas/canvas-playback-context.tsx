import { createContext, useContext, useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { CanvasPlaybackController } from "@/lib/canvas/canvas-playback";
import { pauseFocusedMedia } from "@/lib/canvas/media-playback-focus";

const PlaybackContext = createContext<CanvasPlaybackController | null>(null);
export function CanvasPlaybackProvider({ children, active = true, onActivateNode, controller: provided }: { children: ReactNode; active?: boolean; onActivateNode?: (nodeId: string) => void; controller?: CanvasPlaybackController }) {
    const [standalone] = useState(() => provided || new CanvasPlaybackController());
    const controller = provided || standalone;
    useLayoutEffect(() => {
        controller.setActivationHandler(onActivateNode);
    }, [controller, onActivateNode]);
    useLayoutEffect(() => {
        controller.setAvailable(active);
        if (!active) pauseFocusedMedia();
    }, [active, controller]);
    useEffect(() => {
        const stop = () => {
            controller.pause("blur");
            pauseFocusedMedia();
        };
        const hidden = () => {
            if (document.hidden) {
                controller.pause("hidden");
                pauseFocusedMedia();
            }
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || document.fullscreenElement) return;
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("input,textarea,[contenteditable='true'],.vds-controls,.vds-menu-items")) return;
            const overlay = [...document.querySelectorAll(".ant-popover,.ant-dropdown,.canvas-toolbar-popover,.canvas-compact-panel,[role='dialog'],[role='menu'],[role='listbox']")].some((el) => {
                for (let p: Element | null = el; p; p = p.parentElement) {
                    const style = getComputedStyle(p);
                    if (p.matches("[hidden],[inert],[aria-hidden='true']") || style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
                }
                return true;
            });
            if (!overlay) controller.dismiss();
        };
        window.addEventListener("blur", stop);
        window.addEventListener("keydown", escape, true);
        document.addEventListener("visibilitychange", hidden);
        return () => {
            window.removeEventListener("blur", stop);
            window.removeEventListener("keydown", escape, true);
            document.removeEventListener("visibilitychange", hidden);
            controller.clear();
        };
    }, [controller]);
    return <PlaybackContext value={controller}>{children}</PlaybackContext>;
}
export function useCanvasPlaybackController() {
    return useContext(PlaybackContext);
}
export function useCanvasPlaybackSession(nodeId: string, identity: string) {
    const context = useCanvasPlaybackController();
    // Standalone node renderers (including isolated component checks) have their own scope.
    const [standalone] = useState(() => context || new CanvasPlaybackController());
    const controller = context || standalone;
    const session = useSyncExternalStore(
        controller.subscribe,
        () => {
            const current = controller.getSnapshot();
            return current?.nodeId === nodeId && current.identity === identity ? current : null;
        },
        () => null,
    );
    const sound = useSyncExternalStore(controller.subscribe, controller.getSound, controller.getSound);
    return { controller, session, sound };
}

export function useCanvasPlaybackSound() {
    const controller = useCanvasPlaybackController();
    return useSyncExternalStore(controller?.subscribe || noSubscribe, controller?.getSound || defaultSound, defaultSound);
}
const DEFAULT_SOUND = { muted: false, volume: 1 };
const defaultSound = () => DEFAULT_SOUND;
const noSubscribe = () => () => {};
