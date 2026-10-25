import { describe, test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandSite } from "../src/components/brand/brand-site";
import { DEFAULT_BRAND_CONTENT } from "../src/services/api/brand-site";

describe("MengCeng public renderer", () => {
    test("honest content, login-first primary entries and controlled sections", () => {
        const html = renderToStaticMarkup(<BrandSite content={DEFAULT_BRAND_CONTENT} />);
        const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
        expect(nav).not.toContain('class="mc-login"');
        expect(nav).not.toContain("探索影像");
        expect(nav).not.toContain("创作方式");
        expect(nav).not.toContain("进入工作台");
        expect(html).toContain('href="/login"');
        expect(html).not.toContain('id="entries"');
        expect(DEFAULT_BRAND_CONTENT.primaryLink).toBe("/create");
        expect(html).toContain("MengCeng");
        expect(html).not.toContain("影像参考来自");
        expect(html).not.toContain('class="mc-gallery-disclosure"');
        expect(html).not.toContain("AI 功能概念图");
        expect(html).not.toContain("影策");
        expect(html).not.toContain("github.com");
        expect(html).not.toContain('id="process"');
        expect(html).toContain('id="examples"');
        expect(html).toContain('id="techniques"');
        expect(html).toContain('href="/login"');
        expect(html).not.toContain('id="faq"');
        expect(html).toContain("/brand/b/wave.webp");
        expect(html).toContain("/brand/b/architecture.webp");
        expect(html).toContain("/brand/b/glass-city.webp");
        expect(html).not.toContain("workspace-create.jpg");
        const hidden = renderToStaticMarkup(<BrandSite content={{ ...DEFAULT_BRAND_CONTENT, sections: DEFAULT_BRAND_CONTENT.sections.map((s) => ({ ...s, visible: false })) }} />);
        expect(hidden).not.toContain('id="process"');
        expect(hidden).not.toContain('href="#process"');
        expect(hidden).not.toContain('id="techniques"');
    });
    test("custom media does not inherit unrelated story and draft preview uses admin delivery", () => {
        const content = { ...DEFAULT_BRAND_CONTENT, heroMedia: { resourceId: "owned-image", kind: "image" as const, alt: "自有创作", posterId: "" } };
        const html = renderToStaticMarkup(<BrandSite content={content} preview />);
        expect(html).toContain("/admin/settings/brand-site/media/owned-image");
        expect(html).not.toContain('class="mc-script"');
        expect(html).not.toContain("mc-frame-back");
        expect(html).toContain("自有创作");
    });
    test("editable story is escaped and retained in default brand artwork mode", () => {
        const html = renderToStaticMarkup(<BrandSite content={{ ...DEFAULT_BRAND_CONTENT, storyTitle: "故事标题", storyText: "<script>not executable</script>", sections: DEFAULT_BRAND_CONTENT.sections.map((s) => s.id === "process" ? { ...s, visible: true } : s) }} />);
        expect(html).toContain("故事标题");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>");
    });
    test("interactive process retains an odd final step, both custom media and long editable copy", () => {
        const original = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === "process")!;
        const media = (resourceId: string) => ({ resourceId, kind: "image" as const, alt: "自定义品牌画面", posterId: "" });
        const items = [
            { ...original.items[0], title: "第一步自定义文字", media: media("custom-first") },
            { ...original.items[1], title: "第二步自定义文字", media: media("custom-second") },
            { ...original.items[2], title: "这是一个保留完整内容与自然换行的较长流程标题", description: "长说明保持完整，不因流程配对、可选媒体或奇数条目被截断。", link: "/canvas" },
        ];
        const html = renderToStaticMarkup(<BrandSite preview content={{ ...DEFAULT_BRAND_CONTENT, sections: DEFAULT_BRAND_CONTENT.sections.map((section) => (section.id === "process" ? { ...section, visible: true, items } : section)) }} />);
        for (const item of items) {
            expect(html).toContain(item.title);
            expect(html).toContain(item.description);
        }
        expect(html).toContain("/admin/settings/brand-site/media/custom-first");
        expect(html).toContain("/admin/settings/brand-site/media/custom-second");
        expect(html).toContain('href="/canvas"');
    });
    test("minimal branded header retains one creation action and preview never fetches video", () => {
        const html = renderToStaticMarkup(<BrandSite content={DEFAULT_BRAND_CONTENT} authenticated preview />);
        const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
        expect(nav.match(/开始创作/g)).toHaveLength(1);
        expect(nav).not.toContain("进入工作台");
        expect(html).not.toMatch(/<video[^>]*src=/);
        expect(html).not.toContain('autoPlay');
        expect(html).toContain("/brand/b/wave.webp");
        expect(html).not.toContain("hero-loop.mp4");
    });
});
