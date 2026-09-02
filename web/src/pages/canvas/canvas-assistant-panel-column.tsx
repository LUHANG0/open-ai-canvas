import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

// 根据视口宽度动态计算面板宽度约束，避免小屏幕上面板挤压画布
export function getPanelWidthBounds(): { min: number; max: number } {
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    if (vw < 768) return { min: 260, max: 360 };
    if (vw < 1024) return { min: 280, max: 440 };
    if (vw < 1440) return { min: 320, max: 560 };
    return { min: 360, max: 760 };
}

// 智能体面板包裹器：承载宽度管理、resize 拖拽和顶部停靠偏移。
// 列使用绝对定位覆盖在画布上，不再作为 flex 子元素参与 viewport 宽度计算。
// 首次打开后列保持挂载；closing 代表已收起，通过 transform 移出视口并禁止交互。
export function AssistantPanelColumn({
    width,
    closing,
    topInset,
    onWidthChange,
    children,
}: {
    width: number;
    closing: boolean;
    topInset: string;
    onWidthChange: (width: number) => void;
    children: (resizing: boolean) => ReactNode;
}) {
    const columnRef = useRef<HTMLDivElement>(null);
    const resizeCleanupRef = useRef<(() => void) | null>(null);
    const [resizing, setResizing] = useState(false);

    useEffect(() => {
        if (closing) {
            resizeCleanupRef.current?.();
            resizeCleanupRef.current = null;
            setResizing(false);
        }
        return () => {
            resizeCleanupRef.current?.();
            resizeCleanupRef.current = null;
        };
    }, [closing]);

    useEffect(() => {
        if (!closing) return;
        const frame = window.requestAnimationFrame(() => {
            const trigger = document.querySelector<HTMLElement>(".pc-canvas-agent-button, [aria-label='智能体']");
            trigger?.focus({ preventScroll: true });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [closing]);

    // 拖拽时列右边缘固定（flex 末位），左边缘随鼠标移动。
    const startResize = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        resizeCleanupRef.current?.();
        const rightEdge = columnRef.current?.getBoundingClientRect().right ?? 0;
        const { min, max } = getPanelWidthBounds();
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        const move = (e: MouseEvent) => {
            onWidthChange(Math.min(max, Math.max(min, rightEdge - e.clientX)));
        };
        const cleanup = () => {
            document.body.style.cursor = previousCursor;
            document.body.style.userSelect = previousUserSelect;
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        const stop = () => {
            cleanup();
            if (resizeCleanupRef.current === cleanup) resizeCleanupRef.current = null;
            setResizing(false);
        };
        resizeCleanupRef.current = cleanup;
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    }, [onWidthChange]);

    return (
        <div
            ref={columnRef}
            className="pc-canvas-assistant-column absolute inset-y-0 right-0 z-[var(--z-panel-floating)] flex max-w-[calc(100%_-_24px)] overflow-hidden"
            data-canvas-no-zoom
            data-overlay="true"
            data-state={closing ? "closed" : "open"}
            aria-hidden={closing}
            inert={closing}
            style={{
                width,
                paddingTop: topInset,
                opacity: closing ? 0 : 1,
                // 顶部 padding 只用于避让顶栏，外层不拦截该区域的点击。
                pointerEvents: "none",
                transform: closing ? "translate3d(100%, 0, 0)" : "translate3d(0, 0, 0)",
                transition: resizing
                    ? "none"
                    : "width var(--motion-dur-base-calc) var(--motion-ease-out), padding-top var(--motion-dur-base-calc) var(--motion-ease-out), transform var(--motion-dur-base-calc) var(--motion-ease-out), opacity var(--motion-dur-fast-calc) var(--motion-ease-out)",
                willChange: closing ? "transform, opacity" : "auto",
            }}
        >
            <div className={`h-full w-full ${closing ? "pointer-events-none" : "pointer-events-auto"}`}>
                {!closing ? (
                    <button
                        type="button"
                        className="pc-canvas-assistant-column__resize absolute inset-y-0 left-0 z-[var(--node-z-overlay)] w-4 -translate-x-1/2 cursor-col-resize"
                        onMouseDown={startResize}
                        aria-label="调整右侧面板宽度"
                    />
                ) : null}
                {children(resizing)}
            </div>
        </div>
    );
}
