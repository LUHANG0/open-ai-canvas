import { useEffect, useState } from "react";
import { useCanvasPlaybackController, useCanvasPlaybackSound } from "./canvas-playback-context";
import { VideoPlayer } from "@/components/video-player";
import { resolveVideoMediaUrl } from "@/services/file-storage";
import { CanvasMediaPreviewShell, useCanvasMediaSize } from "./canvas-media-preview";

type Props = { src?: string; storageKey?: string; mimeType?: string; title: string; hasAudio?: boolean; onClose: () => void };
export function CanvasVideoPreview(props: Props) {
    return <VideoPreview key={JSON.stringify([props.src, props.storageKey])} {...props} />;
}
function VideoPreview({ src = "", storageKey, mimeType, title, hasAudio, onClose }: Props) {
    const playback = useCanvasPlaybackController();
    const sound = useCanvasPlaybackSound();
    const [resolvedSrc, setResolvedSrc] = useState(storageKey ? "" : src);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
    const size = useCanvasMediaSize(naturalSize);
    useEffect(() => {
        let cancelled = false;
        void resolveVideoMediaUrl(storageKey, src).then((url) => {
            if (cancelled) return;
            setResolvedSrc(url);
            if (!url) { setFailed(true); setLoading(false); }
        }).catch(() => {
            if (!cancelled) { setFailed(true); setLoading(false); }
        });
        return () => { cancelled = true; };
    }, [src, storageKey]);
    return (
        <CanvasMediaPreviewShell title={title} kind="视频" size={size} onClose={onClose}>
            <div className="canvas-video-preview-stage" style={size} aria-busy={loading}
                onLoadedMetadataCapture={(event) => {
                    const video = event.target;
                    if (!(video instanceof HTMLVideoElement) || !video.videoWidth || !video.videoHeight) return;
                    setNaturalSize({ width: video.videoWidth, height: video.videoHeight });
                    setLoading(false);
                    setFailed(false);
                }}>
                {resolvedSrc ? <VideoPlayer key={resolvedSrc} src={resolvedSrc} mimeType={mimeType} title={title} hasAudio={hasAudio} muted={sound.muted} volume={sound.volume} onSoundChange={playback?.setSound}
                    onError={() => { setLoading(false); setFailed(true); }} /> : null}
                {failed ? <div className="canvas-media-preview-state" role="alert">视频暂时无法播放，请关闭后重试</div>
                    : loading ? <div className="canvas-media-preview-state" role="status">正在加载视频…</div> : null}
            </div>
        </CanvasMediaPreviewShell>
    );
}
