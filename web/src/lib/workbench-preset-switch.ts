import type { WorkbenchPromptPreset } from "@/services/api/workbench";

export function canReplaceWorkbenchPrompt(prompt: string, preset: WorkbenchPromptPreset | null) {
    return !prompt.trim() || (preset !== null && prompt.trim() === preset.promptTemplate.trim());
}

/** Tool changes may replace untouched templates, but edited prompts require an explicit choice. */
export function planWorkbenchPresetSwitch(prompt: string, current: WorkbenchPromptPreset | null, presets: WorkbenchPromptPreset[], preferredId?: string | null) {
    const next = presets.find((preset) => preset.id === preferredId) || presets[0] || null;
    const replaceable = canReplaceWorkbenchPrompt(prompt, current);
    return {
        prompt: replaceable ? next?.promptTemplate || "" : prompt,
        preset: replaceable ? next : null,
        pending: replaceable ? null : next,
    };
}
