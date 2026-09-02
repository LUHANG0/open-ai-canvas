export const CANVAS_IMPORT_ACCEPT = "image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav";

export function shouldMountCanvasHeadlessAgent(compactAgent: boolean, assistantMounted: boolean) {
    return compactAgent && !assistantMounted;
}
