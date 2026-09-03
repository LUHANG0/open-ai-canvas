export const CANVAS_NODE_DETAIL_MIN_SCALE = 0.35;

export function shouldEnableCanvasNodeKeyboardControls(input: { scale: number; selected: boolean; active?: boolean; editing?: boolean }) {
    return input.scale >= CANVAS_NODE_DETAIL_MIN_SCALE || input.selected || Boolean(input.active) || Boolean(input.editing);
}
