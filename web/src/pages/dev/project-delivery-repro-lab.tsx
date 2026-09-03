import type { ProjectDetail } from "@/services/api/projects";
import { DeliveryStage } from "@/pages/projects/detail/workflow-stage-views";
import "@/pages/projects/detail/workflow.css";

const createdAt = "2026-09-03T00:00:00.000Z";

function deliveryFixture(): ProjectDetail {
    return {
        project: { id: "delivery-project", userId: "delivery-user", name: "交付验收", type: "short_drama", aspectRatio: "16:9", sourceType: "manual", description: "", stylePresetId: "", status: "active", revision: 1, createdAt, updatedAt: createdAt },
        units: [{ id: "delivery-unit", projectId: "delivery-project", kind: "chapter", title: "第一集", sourceText: "", wordCount: 0, status: "ready", position: 0, createdAt, updatedAt: createdAt }],
        shots: [
            { id: "delivery-shot-1", projectId: "delivery-project", unitId: "delivery-unit", currentRevisionId: "delivery-revision-1", title: "SC.01", description: "红色开场", position: 0, durationMs: 600, status: "ready", createdAt, updatedAt: createdAt },
            { id: "delivery-shot-2", projectId: "delivery-project", unitId: "delivery-unit", currentRevisionId: "delivery-revision-2", title: "SC.02", description: "蓝色收束", position: 1, durationMs: 600, status: "ready", createdAt, updatedAt: createdAt },
        ],
        shotRevisions: [
            { id: "delivery-revision-1", shotId: "delivery-shot-1", version: 1, plotDescription: "红色开场", action: "向右移动", dialogue: "准备开始", shotSize: "中景", cameraAngle: "平视", cameraMovement: "固定", durationMs: 600, imagePrompt: "red frame", videoPrompt: "move right", negativePrompt: "", continuityNotes: "", actionBeatsJson: "[]", createdAt },
            { id: "delivery-revision-2", shotId: "delivery-shot-2", version: 1, plotDescription: "蓝色收束", action: "向左移动", dialogue: "交付完成", shotSize: "中景", cameraAngle: "平视", cameraMovement: "固定", durationMs: 600, imagePrompt: "blue frame", videoPrompt: "move left", negativePrompt: "", continuityNotes: "", actionBeatsJson: "[]", createdAt },
        ],
        shotArtifacts: [
            { id: "delivery-video-1", projectId: "delivery-project", unitId: "delivery-unit", shotId: "delivery-shot-1", revisionId: "delivery-revision-1", type: "video", version: 1, resourceId: "delivery-resource-1", status: "ready", selected: true, metadataJson: "{}", createdAt, updatedAt: createdAt },
            { id: "delivery-video-2", projectId: "delivery-project", unitId: "delivery-unit", shotId: "delivery-shot-2", revisionId: "delivery-revision-2", type: "video", version: 1, resourceId: "delivery-resource-2", status: "ready", selected: true, metadataJson: "{}", createdAt, updatedAt: createdAt },
            { id: "delivery-video-old", projectId: "delivery-project", unitId: "delivery-unit", shotId: "delivery-shot-1", revisionId: "delivery-revision-1", type: "video", version: 0, resourceId: "delivery-resource-old", status: "stale", selected: false, metadataJson: "{}", createdAt, updatedAt: createdAt },
        ],
        canvases: [],
        canvasUnitLinks: [],
        assets: [],
        assetFolders: [],
        workflows: [],
        shotReferences: [],
        assetCandidates: [],
        tasks: [],
    };
}

/** DEV-only 交付包复现台；资源由 Chrome E2E 拦截为一次性视频。 */
export default function ProjectDeliveryReproLab() {
    return (
        <main className="min-h-screen overflow-auto bg-background px-8 py-10 text-foreground" data-delivery-repro>
            <DeliveryStage detail={deliveryFixture()} unitId="delivery-unit" enableServerDelivery={false} />
        </main>
    );
}
