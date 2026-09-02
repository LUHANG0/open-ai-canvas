import { lazy, Suspense } from "react";

const CanvasShortcutsModal = lazy(() => import("./canvas-shortcuts-modal").then((module) => ({ default: module.CanvasShortcutsModal })));

export function CanvasProjectShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null;
    return (
        <Suspense
            fallback={
                <div className="sr-only" role="status" aria-live="polite">
                    正在加载画布快捷键…
                </div>
            }
        >
            <CanvasShortcutsModal open onClose={onClose} />
        </Suspense>
    );
}
