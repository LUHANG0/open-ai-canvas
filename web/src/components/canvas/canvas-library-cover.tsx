import { FileText, Layers, Video } from "lucide-react";
import { ProjectPreview, projectPreviewMedia } from "./canvas-project-card";
import type { CanvasLibrarySummary } from "@/services/api/user-data";
import { useSyncProgressStore } from "@/stores/use-sync-progress-store";
import { canvasNodeVideoPreviewReference } from "@/lib/canvas/canvas-media-preview";
import { CachedResourceImage } from "@/components/cached-resource-image";
import { MediaPlaceholder } from "@/components/ui/product/media-placeholder";

const nodeLabels: Readonly<Record<string, string>> = { video: "视频节点", text: "文本节点", image: "图片节点", audio: "音频节点", script: "分镜脚本", drawing: "绘图节点", frame: "背板", config: "生成配置", skill: "技能节点" };

/** Library summaries are samples, not the complete canvas or proof of generated output. */
export function CanvasLibraryCover({ project }: { project: CanvasLibrarySummary }) {
    const progress = useSyncProgressStore((state) => state.syncingProjects[project.id]);
    const media = projectPreviewMedia(project.previewNodes, true);
    if (media?.node.type === "image") {
        return <ProjectPreview project={{ id: project.id, nodes: project.previewNodes }} preferLatestImage />;
    }
    const types = new Set(project.previewNodes.map((node) => node.type));
    const complete = project.nodeCount === project.previewNodes.length;
    const kind = types.size === 1 && types.has("video") ? complete ? "视频画布" : "视频节点预览" : types.size === 1 && types.has("text") ? complete ? "文本画布" : "文本节点预览" : "画布预览";
    const Icon = types.has("video") ? Video : types.has("text") ? FileText : Layers;
    const syncing = progress && (progress.phase === "uploading" || progress.phase === "saving");
    const poster = media?.node.type === "video" ? canvasNodeVideoPreviewReference(media.node) : null;
    if (poster) return <div className="canvas-library-poster">
        <CachedResourceImage storageKey={poster.storageKey} src={poster.src} alt="视频封面" loading="lazy" decoding="async" className="size-full object-cover" fallback={<MediaPlaceholder failed />} loadingFallback={<MediaPlaceholder label="正在读取封面" />} />
        {syncing ? <span className="canvas-collection-opening" role="status">云端同步中</span> : null}
    </div>;
    const summary = project.previewNodes
        .filter((node) => node.title && node.title !== nodeLabels[node.type] && node.title !== nodeLabels[node.type]?.replace(/节点$/, ""))
        .slice(0, 2)
        .map((node) => node.title)
        .join(" · ");
    return <div className="canvas-library-cover">
        <Icon aria-hidden="true" />
        <strong>{project.nodeCount === 0 ? "空白画布" : kind}</strong>
        <span>{project.nodeCount === 0 ? "添加素材或节点，开始创作" : types.size === 1 && types.has("video") ? "暂无视频预览" : "暂无媒体预览"}</span>
        {project.nodeCount > 0 && summary ? <p title={summary}>{summary}</p> : null}
        {syncing ? <span className="canvas-library-sync-status" role="status">云端同步中{progress.total > 0 ? ` ${progress.completed}/${progress.total}` : ""}</span> : null}
    </div>;
}
