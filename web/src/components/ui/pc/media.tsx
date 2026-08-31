import { File, FileAudio, Image as ImageIcon, Video } from "lucide-react";
import { useEffect, useState, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./pc-ui.css";

export type MediaKind = "image" | "video" | "audio" | "file";

export type MediaFallbackProps = HTMLAttributes<HTMLDivElement> & {
    kind?: MediaKind;
    label?: ReactNode;
    icon?: ReactNode;
    compact?: boolean;
};

const MEDIA_LABELS: Record<MediaKind, string> = {
    image: "图片不可用",
    video: "视频不可用",
    audio: "音频不可用",
    file: "文件不可用",
};

function MediaKindIcon({ kind }: { kind: MediaKind }) {
    if (kind === "image") return <ImageIcon />;
    if (kind === "video") return <Video />;
    if (kind === "audio") return <FileAudio />;
    return <File />;
}

export function MediaFallback({ kind = "file", label, icon, compact = false, className, ...props }: MediaFallbackProps) {
    return (
        <div className={cn("pc-media-fallback", compact && "pc-media-fallback--compact", className)} role="img" aria-label={typeof label === "string" ? label : MEDIA_LABELS[kind]} {...props}>
            <span className="pc-media-fallback__icon" aria-hidden="true">
                {icon || <MediaKindIcon kind={kind} />}
            </span>
            <span className="pc-media-fallback__label">{label || MEDIA_LABELS[kind]}</span>
        </div>
    );
}

export type MediaThumbnailProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
    src?: string | null;
    alt: string;
    kind?: "image" | "video";
    poster?: string;
    fit?: "cover" | "contain";
    aspect?: "asset" | "video" | "square" | "auto";
    fallback?: ReactNode;
    overlay?: ReactNode;
    loading?: "eager" | "lazy";
    interactive?: boolean;
};

export function MediaThumbnail({ src, alt, kind = "image", poster, fit = "cover", aspect = "asset", fallback, overlay, loading = "lazy", interactive = false, className, ...props }: MediaThumbnailProps) {
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        setFailed(false);
    }, [src]);

    const showFallback = !src || failed;

    return (
        <div className={cn("pc-media-thumbnail", `pc-media-thumbnail--${aspect}`, `pc-media-thumbnail--${fit}`, interactive && "pc-media-thumbnail--interactive", className)} {...props}>
            {showFallback ? (
                fallback || <MediaFallback kind={kind} label={alt || undefined} />
            ) : kind === "video" ? (
                <video className="pc-media-thumbnail__media" src={src || undefined} poster={poster} preload="metadata" muted playsInline aria-label={alt} onError={() => setFailed(true)} />
            ) : (
                <img className="pc-media-thumbnail__media" src={src || undefined} alt={alt} loading={loading} onError={() => setFailed(true)} />
            )}
            {overlay ? <div className="pc-media-thumbnail__overlay">{overlay}</div> : null}
        </div>
    );
}
