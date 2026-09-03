import { Image, Modal } from "antd";

import { VideoPlayer } from "@/components/video-player";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";

type CanvasProjectMediaPreviewProps = {
    node: CanvasNodeData;
    onClose: () => void;
};

export function CanvasProjectMediaPreview({ node, onClose }: CanvasProjectMediaPreviewProps) {
    const content = node.metadata?.content;

    if (!content) return null;

    if (node.type === CanvasNodeType.Video) {
        return (
            <Modal
                rootClassName="pc-canvas-overlay pc-canvas-modal pc-canvas-preview-modal"
                title="视频预览"
                open
                centered
                onCancel={onClose}
                footer={null}
                width="min(1200px, calc(100vw - 32px))"
                styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "84vh", overflow: "hidden", background: "#090909" } }}
            >
                <VideoPlayer src={content} mimeType={node.metadata?.mimeType} title={node.title || "视频预览"} className="max-h-[84vh] max-w-full bg-black" />
            </Modal>
        );
    }

    if (node.type === CanvasNodeType.Image) {
        return (
            <Image
                src={content}
                alt={node.title || "图片"}
                style={{ display: "none" }}
                preview={{
                    open: true,
                    rootClassName: "pc-canvas-overlay pc-canvas-image-preview",
                    movable: true,
                    minScale: 0.5,
                    maxScale: 12,
                    scaleStep: 0.25,
                    onOpenChange: (open) => !open && onClose(),
                }}
            />
        );
    }

    return null;
}
