import type { ShortDramaWorkflowStage } from "./workflow-shared";

export const WORKFLOW_ACTION_BOARD_LAYOUT = { rows: 4, columns: 3, frameCount: 12 } as const;

type WorkflowPromptValues = {
    plotDescription?: string;
    action?: string;
    dialogue?: string;
    imagePrompt?: string;
    videoPrompt?: string;
    continuityNotes?: string;
};

export function buildWorkflowArtifactPrompt(stage: ShortDramaWorkflowStage, values: WorkflowPromptValues) {
    if (stage === "video") {
        return [
            values.videoPrompt || values.plotDescription,
            values.action,
            values.dialogue && `台词：${values.dialogue}`,
            values.continuityNotes,
        ].filter(Boolean).join("\n");
    }
    if (stage === "previz") {
        return [
            `生成一张电影动作拆分 ${WORKFLOW_ACTION_BOARD_LAYOUT.frameCount} 宫格预演图，严格 ${WORKFLOW_ACTION_BOARD_LAYOUT.columns} 列 ${WORKFLOW_ACTION_BOARD_LAYOUT.rows} 行，${WORKFLOW_ACTION_BOARD_LAYOUT.frameCount} 个格子按时间从左到右、从上到下排列，分隔清晰。`,
            values.imagePrompt || values.plotDescription,
            values.action && `动作链：${values.action}`,
            "使用黑白分镜草图表现，保持同一角色、服装、场景、道具、光线和视线方向连续；依次展示起势、推进、转折、落点与结束姿态。",
            "每格只表现一个明确动作节拍，突出人物走位和镜头运动；不要文字、编号、标题、水印、彩色画面、重复格或额外画面。",
        ].filter(Boolean).join("\n");
    }
    return [values.imagePrompt || values.plotDescription, values.action].filter(Boolean).join("\n");
}

export function workflowArtifactSpecification(stage: ShortDramaWorkflowStage, resolution: string, imageQuality: string) {
    if (stage === "video") return { resolution };
    if (stage === "previz") return { quality: imageQuality, actionBoardRows: WORKFLOW_ACTION_BOARD_LAYOUT.rows, actionBoardColumns: WORKFLOW_ACTION_BOARD_LAYOUT.columns, actionBoardFrameCount: WORKFLOW_ACTION_BOARD_LAYOUT.frameCount };
    return { quality: imageQuality };
}

export function workflowArtifactSpecificationLabel(stage: ShortDramaWorkflowStage, resolution: string, imageQuality: string) {
    return stage === "video" ? `${resolution}p` : imageQuality.toUpperCase();
}
