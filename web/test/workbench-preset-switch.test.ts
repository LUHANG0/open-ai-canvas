import { expect, test } from "bun:test";
import { canReplaceWorkbenchPrompt, planWorkbenchPresetSwitch } from "../src/lib/workbench-preset-switch";
import type { WorkbenchPromptPreset } from "../src/services/api/workbench";
const old = { id: "old", promptTemplate: "原工具模板" } as WorkbenchPromptPreset;
const first = { id: "first", promptTemplate: "新工具模板" } as WorkbenchPromptPreset;
const linked = { id: "linked", promptTemplate: "链接指定模板" } as WorkbenchPromptPreset;

test("switching tools replaces only an empty or untouched template", () => {
    expect(planWorkbenchPresetSwitch("", old, [first])).toEqual({ prompt: first.promptTemplate, preset: first, pending: null });
    expect(planWorkbenchPresetSwitch("  原工具模板\n", old, [first])).toEqual({ prompt: first.promptTemplate, preset: first, pending: null });
});
test("edited prompts remain byte-for-byte until the user chooses replacement or append", () => {
    const prompt = "原工具模板，保留我修改的对白\n";
    expect(planWorkbenchPresetSwitch(prompt, old, [first])).toEqual({ prompt, preset: null, pending: first });
    expect(canReplaceWorkbenchPrompt(prompt, old)).toBe(false);
});
test("URL preset selection uses the specified template and falls back to the first available", () => {
    expect(planWorkbenchPresetSwitch("", null, [first, linked], "linked").preset).toBe(linked);
    expect(planWorkbenchPresetSwitch("", null, [first, linked], "removed").preset).toBe(first);
});
test("switching to a tool without presets clears untouched text and retains edited text", () => {
    expect(planWorkbenchPresetSwitch(old.promptTemplate, old, [])).toEqual({ prompt: "", preset: null, pending: null });
    expect(planWorkbenchPresetSwitch("我写的内容", old, [])).toEqual({ prompt: "我写的内容", preset: null, pending: null });
});
