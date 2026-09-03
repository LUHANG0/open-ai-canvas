import { describe, expect, test } from "bun:test";

import { generationStepDone, isProjectNameConflict, parseGeneratedStory, projectNameCandidates } from "../src/pages/projects/project-story-generation";

describe("AI 创建短剧项目", () => {
    test("解析代码块中的故事并丢弃空章节", () => {
        expect(parseGeneratedStory('```json\n{"title":"雨夜","synopsis":"归城","chapters":[{"title":"第一章","content":"开场"},{"title":"","content":"忽略"}]}\n```')).toEqual({
            title: "雨夜",
            synopsis: "归城",
            chapters: [{ title: "第一章", content: "开场" }],
        });
    });

    test("格式损坏时给出可操作错误", () => {
        expect(() => parseGeneratedStory("{invalid json}")).toThrow("无法解析");
    });

    test("生成进度只将已越过的阶段标记为完成", () => {
        expect(generationStepDone("AI 正在生成故事大纲与章节", "正在创建项目…")).toBeTrue();
        expect(generationStepDone("正在创建项目", "正在导入 5 个章节…")).toBeTrue();
        expect(generationStepDone("正在导入章节", "正在导入 5 个章节…")).toBeFalse();
    });

    test("项目重名候选保持长度限制并只重试名称冲突", () => {
        const candidates = projectNameCandidates("一二三四五六七八九十一二三四五六七八九十二三四五六七八九十");
        expect(candidates).toHaveLength(6);
        expect(candidates[0]).toHaveLength(24);
        expect(candidates[1]).toBe(`${candidates[0]}（2）`);
        expect(candidates[5]).toBe(`${candidates[0]}（6）`);
        expect(isProjectNameConflict(new Error("UNIQUE constraint failed: projects.user_id, projects.name"))).toBeTrue();
        expect(isProjectNameConflict(new Error("network unavailable"))).toBeFalse();
    });
});
