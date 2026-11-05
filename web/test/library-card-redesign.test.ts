import { describe, expect, test } from "bun:test";
import { zhCN as canvasBZh } from "../src/i18n/messages/areas/canvasB/zh-CN";
import { readFileSync } from "node:fs";

import { formatAbsoluteDateTime, formatRelativeTime } from "../src/lib/relative-time";
import { skillAccent, skillAccentNames, skillGlyph } from "../src/pages/skills/skill-catalog";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const css = read("../src/styles/workspace-product.css").replace(/\/\*[\s\S]*?\*\//g, "");

describe("relative time", () => {
    const now = Date.parse("2026-10-24T12:00:00+08:00");
    test("formats recent times relatively and older ones as dates", () => {
        expect(formatRelativeTime(now - 20_000, now)).toBe("刚刚");
        expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
        expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3 小时前");
        expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2 天前");
        expect(formatRelativeTime(now - 30 * 86_400_000, now)).not.toContain("前");
        expect(formatRelativeTime("", now)).toBe("时间未知");
        expect(formatAbsoluteDateTime("not-a-date")).toBe("时间未知");
    });
});

describe("skill identity", () => {
    test("glyph uses the first grapheme of the name", () => {
        expect(skillGlyph("分镜大师")).toBe("分");
        expect(skillGlyph("  storyboard")).toBe("S");
        expect(skillGlyph("")).toBe("技");
    });
    test("accent is fixed for built-in categories and stable for custom ones", () => {
        expect(skillAccent("drama")).toBe("blue");
        expect(skillAccent("custom-root")).toBe(skillAccent("custom-root"));
        expect(skillAccentNames).toContain(skillAccent("custom-root"));
        for (const name of skillAccentNames) expect(css).toContain(`.skill-tile[data-accent="${name}"]`);
    });
});

describe("canvas library card", () => {
    const card = read("../src/components/canvas/canvas-folder-card.tsx");
    const page = read("../src/pages/canvas/index.tsx");
    test("footer preserves project ownership and full creation/update time while keeping the local card", () => {
        expect(card).toContain("formatProjectTime(project.updatedAt)");
        expect(card).toContain("formatCanvasDate(project.updatedAt)");
        expect(card).toContain("formatCanvasDate(project.createdAt)");
        expect(card).toContain('{projectName || "自由画布"}');
        expect(canvasBZh.folderCard.freeCanvas).toBe("自由画布");
        expect(page).toContain('projectName={project.projectId ? projectNames.get(project.projectId) || "未同步项目" : undefined}');
        expect(page).not.toContain("已加载全部");
        expect(page).toContain('className="library-load-more" aria-live="polite"');
        expect(page).toContain("继续下滑加载更多");
    });
    test("page header no longer offers deleting every loaded canvas", () => {
        expect(page).not.toContain("删除当前已加载画布");
        expect(page).not.toContain("更多画布操作");
    });
    test("cover preserves sampled summaries and never mounts autoplay video", () => {
        const cover = read("../src/components/canvas/canvas-library-cover.tsx");
        expect(card).toContain("<CanvasLibraryCover project={project}");
        expect(cover).toContain("project.nodeCount === project.previewNodes.length");
        expect(cover).toContain("视频节点预览");
        expect(cover).toContain("canvasNodeVideoPreviewReference");
        expect(cover).not.toContain("<video");
        expect(css).toContain(".canvas-library-page .canvas-collection-preview { aspect-ratio: 16 / 9;");
    });
    test("card controls preserve normal-flow renaming and a separate link", () => {
        expect(card).toContain("canvas-collection-title-input");
        expect(card).toContain("canvas-collection-more");
        expect(card).toContain("canvas-collection-open");
        expect(card).toContain("selectionMode ? <label");
        expect(css).toMatch(/@media \(hover: none\) \{ :is\(\.canvas-collection-select, \.canvas-collection-rename, \.canvas-collection-actions\) \{ opacity: 1; \} \}/);
    });
});

describe("skills library", () => {
    const page = read("../src/pages/skills/index.tsx");
    test("curated browsing coexists with personal categories and keyboard scope tabs", () => {
        expect(page).toContain("<SkillCurationBrowser");
        expect(page).toContain("skills-library-category-item");
        expect(page).toContain('role="tablist"');
        expect(page).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
    });
    test("cards label their stats and keep add as a compact toggle", () => {
        expect(page).toContain("人已加入");
        expect(page).toContain("aria-pressed={skill.isAdded}");
        expect(page).toContain("aria-pressed={skill.isLike}");
        expect(page).toContain("/skills/${encodeURIComponent(skill.skillId)}/edit");
        expect(css).toMatch(/\.skill-tile:is\(:hover, :focus-within\) \.skill-tile-actions/);
        expect(css).toMatch(/\.skill-tile-name-text \{[^}]*-webkit-line-clamp: 2;/);
        expect(css).toMatch(/\.skill-tile-description \{[^}]*-webkit-line-clamp: 2;/);
    });
});
