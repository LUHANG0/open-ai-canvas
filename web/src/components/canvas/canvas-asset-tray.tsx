import { useCanvasTheme } from "@/components/canvas/canvas-theme-provider";
import { lazy, Suspense, useCallback, useRef, useState } from "react";
import { Images } from "lucide-react";

import { useCanvasOverlayLayer } from "@/components/canvas/canvas-overlay-layer";
import { FloatingDock, type FloatingDockEntry } from "@/components/ui/aceternity/floating-dock";
import { canvasDockStyle } from "@/lib/canvas/canvas-aceternity-style";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import type { ImageAsset } from "@/stores/use-asset-store";
import type { CanvasNodeData } from "@/types/canvas";

const CanvasAssetTrayContent = lazy(() => import("./canvas-asset-tray-content").then((module) => ({ default: module.CanvasAssetTrayContent })));

export const CANVAS_IMAGE_ASSET_DND_TYPE = "application/x-infinite-canvas-image-asset";

const TRAY_DEFAULT_HEIGHT = 520;
const TRAY_MIN_HEIGHT = 400;
const TRAY_BOTTOM_SAFE_SPACE = 82;

function getMaxTrayHeight() {
    if (typeof window === "undefined") return TRAY_DEFAULT_HEIGHT;
    return Math.max(360, window.innerHeight - TRAY_BOTTOM_SAFE_SPACE);
}

function defaultTrayHeight() {
    const maxHeight = getMaxTrayHeight();
    return Math.min(Math.max(TRAY_DEFAULT_HEIGHT, Math.min(TRAY_MIN_HEIGHT, maxHeight)), maxHeight);
}

type CanvasAssetTrayProps = {
    assetImages: ImageAsset[];
    canvasImages: CanvasNodeData[];
    showLibrary?: boolean;
    activeNodeId?: string | null;
    onInsertAssetImage: (asset: ImageAsset) => void;
    onFocusCanvasImage: (nodeId: string) => void;
};

export function CanvasAssetTray({ assetImages, canvasImages, showLibrary = true, activeNodeId, onInsertAssetImage, onFocusCanvasImage }: CanvasAssetTrayProps) {
    const theme = useCanvasTheme();
    const { bringToFront, zIndex } = useCanvasOverlayLayer("asset-tray", "var(--z-panel)");
    const initialTabRef = useRef<"library" | "canvas">(showLibrary ? "library" : "canvas");
    const [open, setOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false);
    const closeTray = useCallback(() => setOpen(false), []);
    const totalItems = (showLibrary ? assetImages.length : 0) + canvasImages.length;

    const toggleTray = () => {
        bringToFront();
        if (!open) setHasOpened(true);
        setOpen((value) => !value);
    };

    const dockItems: FloatingDockEntry[] = [
        {
            id: "asset-tray-toggle",
            label: open ? "收起图片素材" : `打开图片素材，共 ${totalItems} 张`,
            icon: (
                <span className="relative">
                    <Images />
                    <span className="absolute -right-1.5 -top-1.5 min-w-3 rounded-full px-0.5 text-center text-[var(--fs-nano)] font-bold leading-3" style={{ background: theme.accent.primary, color: theme.accent.onPrimary }}>
                        {totalItems}
                    </span>
                </span>
            ),
            active: open,
            onClick: toggleTray,
        },
    ];

    return (
        <div
            data-canvas-no-zoom
            className="pc-canvas-asset-tray relative"
            style={{ zIndex }}
            onPointerDownCapture={bringToFront}
            onFocusCapture={bringToFront}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            {hasOpened ? (
                <Suspense fallback={open ? <CanvasAssetTrayLoading theme={theme} /> : null}>
                    <CanvasAssetTrayContent
                        open={open}
                        initialTab={initialTabRef.current}
                        assetImages={assetImages}
                        canvasImages={canvasImages}
                        showLibrary={showLibrary}
                        activeNodeId={activeNodeId}
                        dndType={CANVAS_IMAGE_ASSET_DND_TYPE}
                        theme={theme}
                        onClose={closeTray}
                        onInsertAssetImage={onInsertAssetImage}
                        onFocusCanvasImage={onFocusCanvasImage}
                    />
                </Suspense>
            ) : null}

            <FloatingDock items={dockItems} magnify={false} className="canvas-floating-dock" style={canvasDockStyle(theme)} ariaLabel="图片素材" />
        </div>
    );
}

function CanvasAssetTrayLoading({ theme }: { theme: CanvasTheme }) {
    const height = defaultTrayHeight();
    return (
        <aside
            className="pc-canvas-panel canvas-asset-tray-panel aceternity-floating-panel pointer-events-none absolute bottom-[var(--canvas-dock-popover-offset)] left-0 flex w-[min(88vw,312px)] flex-col overflow-hidden rounded-[var(--r-2xl)] p-2.5 backdrop-blur-2xl"
            style={{ background: theme.spatial.elevated, color: theme.node.text, height, minHeight: Math.min(TRAY_MIN_HEIGHT, getMaxTrayHeight()), maxHeight: "calc(100vh - 6rem)", boxShadow: `0 32px 100px ${theme.spatial.shadow}` }}
            role="status"
            aria-live="polite"
        >
            <div className="mx-auto mt-1 h-1 w-12 rounded-full bg-current opacity-15" />
            <div className="mt-4 h-11 rounded-[var(--r-lg)] bg-current opacity-[0.04]" />
            <div className="mt-2 h-8 rounded-[11px] bg-current opacity-[0.04]" />
            <div className="mt-2.5 min-h-0 flex-1 rounded-[var(--r-lg)] bg-current opacity-[0.04]" />
            <span className="sr-only">正在加载图片素材…</span>
        </aside>
    );
}
