import { useEffect, useState } from "react";
import { Image as ImageIcon, LoaderCircle, Maximize, Minus, Plus } from "lucide-react";

import { CanvasMediaPreviewShell, IMAGE_PREVIEW_TOOLBAR_HEIGHT, useCanvasMediaSize } from "./canvas-media-preview";
import { uploadedResourcePreviewUrl } from "@/services/canvas-upload-preview";
import { resolveImageUrl } from "@/services/image-storage";
import { getActiveUserScope } from "@/lib/user-scope";
import "./canvas-image-preview.css";

type CanvasImagePreviewProps = {
    src?: string;
    storageKey?: string;
    alt?: string;
    onClose: () => void;
};

export function CanvasImagePreview(props: CanvasImagePreviewProps) {
    return <ImagePreview key={JSON.stringify([getActiveUserScope(), props.src, props.storageKey])} {...props} />;
}

function ImagePreview({ src = "", storageKey, alt = "图片", onClose }: CanvasImagePreviewProps) {
    const uploadPreview = uploadedResourcePreviewUrl(storageKey);
    const [resolvedSrc, setResolvedSrc] = useState(uploadPreview || (storageKey ? "" : src));
    const [loading, setLoading] = useState(Boolean(src || storageKey));
    const [error, setError] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [slow, setSlow] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [stage, setStage] = useState<HTMLDivElement | null>(null);
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
    const stageSize = useCanvasMediaSize(imageSize, IMAGE_PREVIEW_TOOLBAR_HEIGHT);
    const fitScale = imageSize.width && imageSize.height
        ? Math.min(1, stageSize.width / imageSize.width, stageSize.height / imageSize.height)
        : 0;

    const ready = !loading && !error && fitScale > 0;

    const fit = () => {
        setZoom(1);
        if (stage) {
            stage.scrollLeft = 0;
            stage.scrollTop = 0;
        }
    };

    useEffect(() => {
        let cancelled = false;
        const scope = getActiveUserScope();
        const isCurrent = () => !cancelled && getActiveUserScope() === scope;
        setResolvedSrc(uploadPreview || (storageKey ? "" : src));
        setLoading(Boolean(src || storageKey));
        setError(false);
        if (!src && !storageKey) return () => {
            cancelled = true;
        };
        void (uploadPreview && !attempt ? Promise.resolve(uploadPreview) : resolveImageUrl(storageKey, src, { forceRefresh: attempt > 0 }))
            .then((url) => {
                if (!isCurrent()) return;
                if (!url) {
                    setLoading(false);
                    setError(true);
                    return;
                }
                setResolvedSrc(url);
            })
            .catch(() => {
                if (isCurrent()) {
                    setLoading(false);
                    setError(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [src, storageKey, attempt, uploadPreview]);

    useEffect(() => {
        setSlow(false);
        if (!loading || error) return;
        const timer = setTimeout(() => setSlow(true), 8_000);
        return () => clearTimeout(timer);
    }, [loading, error, attempt]);

    if (!src && !storageKey) return null;

    return (
        <CanvasMediaPreviewShell title={alt} kind="图片" size={stageSize} onClose={onClose}>
            <div className="canvas-image-preview-viewer">
                <div
                    ref={setStage}
                    className="canvas-image-preview-stage"
                    style={{ width: stageSize.width, height: stageSize.height }}
                    data-canvas-no-zoom
                    data-canvas-wheel-scroll
                    tabIndex={0}
                    role="region"
                    aria-label="图片查看区域，可滚动查看放大的图片"
                    aria-busy={loading}
                >
                    {loading && !error ? (
                        <div className="canvas-media-preview-state" role="status">
                            <LoaderCircle className="canvas-image-preview-spinner" aria-hidden="true" />
                            <span className="sr-only">正在加载原图。{slow ? "原图较大或网络较慢，请稍候" : "原图就绪后显示完整细节"}</span>
                        </div>
                    ) : null}
                    {error ? (
                        <div className="canvas-media-preview-state" role="alert">
                            <ImageIcon size={28} aria-hidden="true" />
                            <span>图片暂时无法显示</span>
                            <small>可重新加载原图，无需重新生成</small>
                            <button type="button" className="canvas-image-preview-retry" onClick={() => setAttempt((value) => value + 1)}>重新加载原图</button>
                        </div>
                    ) : null}
                    {resolvedSrc ? (
                        <div className="canvas-image-preview-image-space">
                            <img
                                key={`${attempt}:${resolvedSrc}`}
                                src={resolvedSrc}
                                alt={alt}
                                draggable={false}
                                className="canvas-image-preview-image"
                                style={{
                                    width: imageSize.width * fitScale * zoom,
                                    height: imageSize.height * fitScale * zoom,
                                    visibility: ready ? "visible" : "hidden",
                                }}
                                onLoad={(event) => {
                                    setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight });
                                    setLoading(false);
                                    setError(false);
                                }}
                                onError={() => {
                                    setLoading(false);
                                    setError(true);
                                }}
                            />
                        </div>
                    ) : null}
                </div>
                <div className="canvas-image-preview-toolbar" role="group" aria-label="图片缩放">
                    <button type="button" aria-label="缩小图片" title="缩小" disabled={!ready || zoom <= 0.25} onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))}><Minus size={18} aria-hidden="true" /></button>
                    <output aria-label="相对适应窗口的缩放比例" aria-live="polite">{Math.round(zoom * 100)}%</output>
                    <button type="button" aria-label="放大图片" title="放大" disabled={!ready || zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value + 0.25))}><Plus size={18} aria-hidden="true" /></button>
                    <button type="button" className="canvas-image-preview-fit" disabled={!ready} onClick={fit}><Maximize size={16} aria-hidden="true" />适应窗口</button>
                </div>
            </div>
        </CanvasMediaPreviewShell>
    );
}
