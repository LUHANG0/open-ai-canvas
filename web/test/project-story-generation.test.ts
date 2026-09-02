import { describe, expect, test } from "bun:test";

import { generationStepDone, parseGeneratedStory } from "../src/pages/projects/project-story-generation";

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
});
