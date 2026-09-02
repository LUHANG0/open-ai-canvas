import { describe, expect, test } from "bun:test";

import { buildWorkflowArtifactPrompt, workflowArtifactSpecification, workflowArtifactSpecificationLabel } from "../src/pages/projects/detail/workflow-generation-prompt";

describe("短剧镜头生成提示与规格", () => {
    test("分镜图保留项目视觉语义，不强制黑白预演", () => {
        const prompt = buildWorkflowArtifactPrompt("storyboard", { plotDescription: "雨夜街口", action: "主角回头" });
        expect(prompt).toContain("雨夜街口");
        expect(prompt).not.toContain("黑白");
    });

    test("动作预演明确使用黑白节拍约束", () => {
        const prompt = buildWorkflowArtifactPrompt("previz", { imagePrompt: "雨夜街口", action: "主角回头" });
        expect(prompt).toContain("黑白动作预演");
        expect(prompt).toContain("人物走位");
    });

    test("视频保留对白和接戏信息", () => {
        const prompt = buildWorkflowArtifactPrompt("video", { videoPrompt: "镜头推近", dialogue: "别回头", continuityNotes: "右手持伞" });
        expect(prompt).toContain("台词：别回头");
        expect(prompt).toContain("右手持伞");
    });

    test("图片与视频记录各自真实规格", () => {
        expect(workflowArtifactSpecification("storyboard", "1080", "high")).toEqual({ quality: "high" });
        expect(workflowArtifactSpecification("video", "1080", "high")).toEqual({ resolution: "1080" });
        expect(workflowArtifactSpecificationLabel("storyboard", "1080", "high")).toBe("HIGH");
        expect(workflowArtifactSpecificationLabel("video", "1080", "high")).toBe("1080p");
    });
});
