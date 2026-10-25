import { describe, test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandSite } from "../src/components/brand/brand-site";
import { DEFAULT_BRAND_CONTENT } from "../src/services/api/brand-site";

describe("MengCeng public renderer", () => {
    test("published copy and enabled sections survive the reference recreation", () => {
        const html = renderToStaticMarkup(<BrandSite content={DEFAULT_BRAND_CONTENT} />);
        expect(html).toContain("把灵感，推进成画面。");
        expect(html).toContain(DEFAULT_BRAND_CONTENT.description);
        expect(html).not.toContain(DEFAULT_BRAND_CONTENT.footer);
        for (const section of DEFAULT_BRAND_CONTENT.sections) {
            expect(html.includes('id="' + section.id + '"')).toBe(section.visible);
            if (section.visible) {
                expect(html).toContain(section.title);
                for (const item of section.items) expect(html).toContain(item.title);
            }
        }
        expect(html).toContain('href="/login"');
        expect(html).toContain("MengCeng");
        expect(html).not.toContain("/brand/product-create.jpg");
        expect(html).not.toContain("影策");
        expect(html).not.toContain("订阅套餐");
        expect(html).not.toContain("创作者计划");
        expect(html).not.toContain("影像暂时无法加载");
    });

    test("hiding CMS sections removes their content and section navigation", () => {
        const content = { ...DEFAULT_BRAND_CONTENT, sections: DEFAULT_BRAND_CONTENT.sections.map((section) => ({ ...section, visible: false })) };
        const html = renderToStaticMarkup(<BrandSite content={content} />);
        for (const section of content.sections) {
            expect(html).not.toContain('id="' + section.id + '"');
            expect(html).not.toContain('href="#' + section.id + '"');
        }
        expect(html).toContain('id="inspiration"');
        expect(html).toContain("视频创作");
    });

    test("custom hero media uses the correct delivery boundary and replaces decorative hero", () => {
        const content = { ...DEFAULT_BRAND_CONTENT, heroMedia: { resourceId: "owned image/one", kind: "image" as const, alt: "自有创作", posterId: "" }, sections: DEFAULT_BRAND_CONTENT.sections.map((section) => section.id === "process" ? { ...section, visible: true } : section) };
        const preview = renderToStaticMarkup(<BrandSite content={content} preview />);
        const published = renderToStaticMarkup(<BrandSite content={content} />);
        expect(preview).toContain("/admin/settings/brand-site/media/owned%20image%2Fone");
        expect(published).toContain("/public/brand-site/media/owned%20image%2Fone");
        expect(published).not.toContain("/admin/settings/brand-site/media/");
        expect(preview).toContain("自有创作");
        expect(preview).not.toContain("选择开场影片");
        expect(preview).not.toContain(content.storyTitle);
    });

    test("editable story is escaped and retained only with the enabled process section", () => {
        const content = { ...DEFAULT_BRAND_CONTENT, storyTitle: "故事标题", storyText: "<script>not executable</script>", storyCaption: "自定义注释", sections: DEFAULT_BRAND_CONTENT.sections.map((section) => section.id === "process" ? { ...section, visible: true } : section) };
        const html = renderToStaticMarkup(<BrandSite content={content} />);
        expect(html).toContain("故事标题");
        expect(html).toContain("自定义注释");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>");
    });

    test("odd process items retain complete custom copy, media and destinations", () => {
        const original = DEFAULT_BRAND_CONTENT.sections.find((section) => section.id === "process")!;
        const items = [
            { ...original.items[0], title: "第一步自定义文字", media: { resourceId: "custom-first", kind: "image" as const, alt: "自定义第一幅", posterId: "" } },
            { ...original.items[1], title: "第二步自定义文字", media: { resourceId: "custom-second", kind: "video" as const, alt: "自定义影片", posterId: "custom-poster" } },
            { ...original.items[2], title: "这是一个保留完整内容与自然换行的较长流程标题", description: "长说明保持完整，不因流程配对、可选媒体或奇数条目被截断。", link: "https://example.com/creative-guide" },
        ];
        const html = renderToStaticMarkup(<BrandSite preview content={{ ...DEFAULT_BRAND_CONTENT, sections: [{ ...original, visible: true, items }] }} />);
        for (const item of items) {
            expect(html).toContain(item.title);
            expect(html).toContain(item.description);
        }
        expect(html).toContain("/admin/settings/brand-site/media/custom-first");
        expect(html).toContain("/admin/settings/brand-site/media/custom-second");
        expect(html).toContain("/admin/settings/brand-site/media/custom-poster");
        expect(html).toContain('href="https://example.com/creative-guide"');
        expect(html).not.toContain("autoplay");
    });

    test("preview renders posters without requesting decorative videos", () => {
        const html = renderToStaticMarkup(<BrandSite content={DEFAULT_BRAND_CONTENT} authenticated preview />);
        const nav = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
        expect(nav.match(/开始创作/g)).toHaveLength(1);
        expect(html).not.toMatch(/<video[^>]*src=/);
        expect(html).not.toContain("autoplay");
        expect(html).toContain("image01-aliyun.vidu.zone");
        expect(html).toContain("static-oiioii-sg.hogiai.cn");
        expect(html).not.toContain("<main");
    });
});
