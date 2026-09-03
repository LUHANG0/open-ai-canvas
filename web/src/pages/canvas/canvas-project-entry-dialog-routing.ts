import type { DirectorTemplateId } from "@/lib/canvas/director/director-templates";
import type { Position } from "@/types/canvas";

export function resolveCanvasDirectorTemplateSelection(request: { position?: Position } | null, templateId: DirectorTemplateId) {
    return { templateId, position: request?.position };
}
