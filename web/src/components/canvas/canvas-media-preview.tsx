import { useEffect, useState, type ReactNode } from "react";
import { AppModal } from "@/components/ui/product/app-modal";
import "./canvas-media-preview.css";

export type MediaSize = { width: number; height: number };
const HEADER_HEIGHT = 44;
export const IMAGE_PREVIEW_TOOLBAR_HEIGHT = 44;

// Fit the intrinsic media, not a stage whose size depends on the fitted result.
export function fitCanvasMedia(size: MediaSize, viewport: MediaSize, footerHeight = 0): MediaSize {
    const width = Math.max(1, viewport.width - 24);
    const height = Math.max(1, viewport.height - 24 - HEADER_HEIGHT - footerHeight);
    const source = size.width > 0 && size.height > 0 ? size : { width: 320, height: 200 };
    const scale = Math.min(1, width / source.width, height / source.height);
    return { width: source.width * scale, height: source.height * scale };
}

export function useCanvasMediaSize(size: MediaSize, footerHeight = 0) {
    const [viewport, setViewport] = useState(() => ({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight }));
    useEffect(() => {
        const measure = () => setViewport({ width: window.visualViewport?.width ?? window.innerWidth, height: window.visualViewport?.height ?? window.innerHeight });
        window.addEventListener("resize", measure);
        window.visualViewport?.addEventListener("resize", measure);
        return () => {
            window.removeEventListener("resize", measure);
            window.visualViewport?.removeEventListener("resize", measure);
        };
    }, []);
    const fitted = fitCanvasMedia(size, viewport, footerHeight);
    // Extremely narrow portraits need two control rows without widening the media.
    return footerHeight === IMAGE_PREVIEW_TOOLBAR_HEIGHT && fitted.width < 240
        ? fitCanvasMedia(size, viewport, footerHeight * 2)
        : fitted;
}

export function CanvasMediaPreviewShell({ title, kind, size, onClose, children }: { title: string; kind: "图片" | "视频"; size: MediaSize; onClose: () => void; children: ReactNode }) {
    // Capture before the modal's autofocus commits. The parent removes this
    // always-open shell on close, so AntD never receives an open=false transition.
    const [trigger] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const close = () => {
        onClose();
        // Wait for the close event's React commit to remove the focus trap.
        queueMicrotask(() => {
            if (trigger?.isConnected && !trigger.matches(":disabled")) trigger.focus({ preventScroll: true });
        });
    };
    return (
        <AppModal rootClassName="canvas-media-preview-overlay" open flush centered footer={null}
            title={<span className="canvas-media-preview-title" title={title}>{title}</span>}
            width={size.width} onCancel={close}
            closable={{ "aria-label": `关闭${kind}预览`, closeIcon: <span aria-hidden="true">×</span> }}
            className="canvas-media-preview-modal"
            wrapProps={{
                "data-canvas-no-zoom": true,
                onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
                onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
                onWheel: (event: React.WheelEvent) => event.stopPropagation(),
                onKeyDown: (event: React.KeyboardEvent) => {
                    // Leave Escape and Tab to AppModal's close/focus-trap handlers.
                    if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation();
                },
                onKeyUp: (event: React.KeyboardEvent) => event.stopPropagation(),
            }}
            modalRender={(modal) => <div onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>{modal}</div>}
        >{children}</AppModal>
    );
}
