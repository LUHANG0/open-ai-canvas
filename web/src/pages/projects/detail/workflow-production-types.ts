import type { ShotRevisionInput } from "@/services/api/projects";

export type ShotEditorValues = Omit<ShotRevisionInput, "durationMs"> & {
    title: string;
    durationSeconds: number;
};

const shotEditorValueKeys: Array<keyof ShotEditorValues> = [
    "title",
    "plotDescription",
    "action",
    "dialogue",
    "shotSize",
    "cameraAngle",
    "cameraMovement",
    "durationSeconds",
    "imagePrompt",
    "videoPrompt",
    "negativePrompt",
    "continuityNotes",
];

export const productionStageCopy = {
    storyboard: { label: "分镜图", action: "生成分镜图", empty: "生成静态分镜图，确认构图、景别与角色位置" },
    previz: { label: "动作预演", action: "生成黑白预演", empty: "生成黑白动作预演，确认表演节拍与镜头运动" },
    video: { label: "镜头视频", action: "生成镜头视频", empty: "选择视频模型后生成当前镜头" },
} as const;

export function revisionInput(values: ShotEditorValues): ShotRevisionInput {
    return {
        plotDescription: values.plotDescription,
        action: values.action,
        dialogue: values.dialogue,
        shotSize: values.shotSize,
        cameraAngle: values.cameraAngle,
        cameraMovement: values.cameraMovement,
        durationMs: Math.round(values.durationSeconds * 1000),
        imagePrompt: values.imagePrompt,
        videoPrompt: values.videoPrompt,
        negativePrompt: values.negativePrompt,
        continuityNotes: values.continuityNotes,
    };
}

export function shotEditorValuesEqual(left: Partial<ShotEditorValues>, right: Partial<ShotEditorValues>) {
    return shotEditorValueKeys.every((key) => (left[key] ?? "") === (right[key] ?? ""));
}

export function shotEditorValuesKey(values: Partial<ShotEditorValues>) {
    return JSON.stringify(shotEditorValueKeys.map((key) => values[key] ?? ""));
}

export function workflowShotEditorInitiallyDirty(hasSelectedShot: boolean, revisionVideoPrompt: string | undefined, serverVideoPrompt: string | undefined) {
    return hasSelectedShot && (revisionVideoPrompt === undefined || serverVideoPrompt !== revisionVideoPrompt);
}

export function formatTaskElapsed(startedAt: number, now: number) {
    const totalSeconds = Math.max(0, Math.floor((now - (Number.isFinite(startedAt) ? startedAt : now)) / 1_000));
    return `${Math.floor(totalSeconds / 60)}分钟${String(totalSeconds % 60).padStart(2, "0")}秒`;
}
