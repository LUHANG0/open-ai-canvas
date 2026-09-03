import type { ProjectUnit } from "@/services/api/projects";

export const CANVAS_PROJECT_CHAPTER_DND_TYPE = "application/x-infinite-canvas-project-chapter";

export type CanvasProjectChapterPayload = Pick<ProjectUnit, "id" | "title" | "position"> & {
    projectId: string;
    sourceText?: string;
};
