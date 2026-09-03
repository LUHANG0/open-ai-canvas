import { describe, expect, test } from "bun:test";

import { chapterAssetCandidateDetails, freshChapterAssetBreakdowns, parseChapterAssetBreakdown } from "@/pages/projects/detail/project-chapter-assets";
import type { ProjectAssetCandidate } from "@/services/api/projects";

const validResult = JSON.stringify({
    assets: [
        {
            name: "林夏",
            aliases: ["小夏"],
            category: "character",
            description: "加班晚归的都市上班族",
            visualPrompt: "26 岁东亚女性，米色风衣，深色帆布包",
            continuityNotes: "跨镜头保持风衣和帆布包一致",
            sourceEvidence: "正文中林夏提灯进入楼道并与邻居交谈",
            character: {
                role: "女主角，吴奶奶的邻居",
                appearance: "26 岁东亚女性，面带疲态",
                clothing: "米色风衣",
                physique: "年轻女性常规体态",
                personality: "善良内敛，观察力强",
                props: "深色帆布工作包",
                consistencyPrompt: "保持发型、风衣与工作包一致",
                multiViewPrompt: "正侧背保持风衣和工作包一致",
                voiceLanguage: "中文普通话",
                voiceAge: "青年女性",
                voiceTimbre: "温和、略带疲惫感",
            },
        },
        {
            name: "老楼道",
            aliases: ["楼道"],
            category: "environment",
            description: "老旧住宅楼内的狭长公共楼道",
            visualPrompt: "斑驳墙面，暖色感应灯，狭长纵深",
            continuityNotes: "门牌和灯位跨镜头固定",
            sourceEvidence: "主要对话和动作发生在楼道",
            character: null,
        },
    ],
});

describe("章节资产拆分", () => {
    test("从带推理文字的结果中解析角色和非角色资产", () => {
        const assets = parseChapterAssetBreakdown(`先分析：{不是 JSON}\n\n\`\`\`json\n${validResult}\n\`\`\``);
        expect(assets.map((asset) => [asset.name, asset.category])).toEqual([["林夏", "character"], ["老楼道", "environment"]]);
        expect(assets[0].character?.voiceLanguage).toBe("中文普通话");
        expect(chapterAssetCandidateDetails(assets[0]).role).toBe("女主角，吴奶奶的邻居");
        expect(chapterAssetCandidateDetails(assets[1]).visualPrompt).toContain("感应灯");
    });

    test("按分类和别名去重，只屏蔽尚待确认的同类资产", () => {
        const assets = parseChapterAssetBreakdown(validResult);
        const existing = [candidate({ name: "小夏", category: "character", status: "pending_confirmation" })];
        expect(freshChapterAssetBreakdowns(assets, existing).map((asset) => asset.name)).toEqual(["老楼道"]);
        expect(freshChapterAssetBreakdowns(assets, [candidate({ name: "小夏", category: "environment", status: "pending_confirmation" })]).length).toBe(2);
        expect(freshChapterAssetBreakdowns(assets, [candidate({ name: "小夏", category: "character", status: "confirmed" })]).length).toBe(2);
    });

    test("拒绝缺少制作描述或角色卡字段的结果", () => {
        expect(() => parseChapterAssetBreakdown(JSON.stringify({ assets: [{ name: "钥匙", aliases: [], category: "prop", description: "", visualPrompt: "黄铜钥匙", continuityNotes: "", sourceEvidence: "用于开门", character: null }] }))).toThrow("缺少制作描述");
        expect(() => parseChapterAssetBreakdown(JSON.stringify({ assets: [{ ...JSON.parse(validResult).assets[0], character: { role: "女主角" } }] }))).toThrow("缺少剧情定位");
    });
});

function candidate(overrides: Partial<ProjectAssetCandidate>): ProjectAssetCandidate {
    return {
        id: "candidate-1",
        projectId: "project-1",
        name: "候选",
        category: "prop",
        status: "pending_confirmation",
        detailsJson: "{}",
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
        ...overrides,
    };
}
