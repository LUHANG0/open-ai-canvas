import { LoaderCircle, ImageOff } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import type { CanvasTheme } from "@/lib/canvas-theme";
import { formatBytes } from "@/lib/image-utils";
import "./canvas-original-image-feedback.css";

export function CanvasOriginalImageFeedback({ busy, animating = true, failed, completed = false, hasPreview = false, width, height, bytes, theme, onRetry }: {
    busy: boolean;
    animating?: boolean;
    failed: boolean;
    completed?: boolean;
    hasPreview?: boolean;
    width?: number;
    height?: number;
    bytes?: number;
    theme: CanvasTheme;
    onRetry: () => void;
}) {
    const elementRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        if (!busy || !animating || failed) { setVisible(false); return; }
        const element = elementRef.current;
        if (!element) return;
        let intersecting = typeof IntersectionObserver === "undefined";
        const update = () => setVisible(intersecting && !document.hidden);
        const observer = typeof IntersectionObserver === "undefined" ? undefined : new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; update(); });
        observer?.observe(element);
        document.addEventListener("visibilitychange", update);
        update();
        return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
    }, [busy, animating, failed]);
    const [slow, setSlow] = useState(false);
    useEffect(() => {
        setSlow(false);
        if (!busy || failed) return;
        const timer = setTimeout(() => setSlow(true), 8_000);
        return () => clearTimeout(timer);
    }, [busy, failed]);

    const dimensions = width && height && Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? `${Math.round(width)} × ${Math.round(height)}` : "";
    const details = [dimensions, bytes && Number.isFinite(bytes) && bytes > 0 ? formatBytes(bytes) : ""].filter(Boolean).join(" · ");
    const title = failed ? "原图加载失败" : slow ? "原图仍在加载" : "正在载入原图";
    const hint = failed ? hasPreview ? "当前保留已有预览，可重试加载原图" : "可重新加载原图，无需重新生成" : hasPreview ? "当前保留已有预览，原图就绪后替换" : slow ? "原图较大或网络较慢，请稍候" : "原图就绪后显示完整细节";

    return (
        <div
            ref={elementRef}
            className={`canvas-original-image-feedback${hasPreview ? " has-preview" : ""}${failed ? " is-failed" : ""}`}
            data-active={busy && animating && visible && !failed}
            data-canvas-no-zoom data-canvas-wheel-scroll
            style={{ "--original-image-fill": theme.node.fill, "--original-image-ink": theme.node.text, "--original-image-muted": theme.node.muted, "--original-image-stroke": theme.node.stroke, "--original-image-hover": theme.toolbar.itemHover } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="canvas-original-image-panel">
                <div role="status" aria-live="polite" aria-atomic="true" aria-busy={busy && !failed} className="canvas-original-image-copy">
                    {failed ? <ImageOff className="canvas-original-image-symbol" aria-hidden="true" /> : <LoaderCircle className="canvas-original-image-spinner" aria-hidden="true" />}
                    {failed ? <strong>{title}</strong> : null}
                    <span className="sr-only">{failed ? "" : `${title}。`}{completed ? "生成完成。" : ""}{details}。{hint}</span>
                    {failed && !hasPreview ? <small>无需重新生成</small> : null}
                </div>
                {failed ? <button type="button" className="canvas-original-image-retry" onClick={(event) => { event.stopPropagation(); onRetry(); }}>重新加载原图</button> : null}
            </div>
        </div>
    );
}
