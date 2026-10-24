import { test, expect } from "bun:test";
import { applyAppearanceMetadata, DEFAULT_PUBLIC_APPEARANCE } from "../src/stores/use-appearance-store";
import { Window } from "happy-dom";
test("brand metadata retains configured identity on public and workspace pages", () => {
    const window = new Window({ url: "http://localhost:3000/" });
    const appearance = { ...DEFAULT_PUBLIC_APPEARANCE, seoTitle: "梦层 MengCeng", seoDescription: "创作工作台" };
    applyAppearanceMetadata(appearance, window.document);
    expect(window.document.title).toBe("梦层 MengCeng");
    expect(window.document.querySelector('meta[property="og:site_name"]').content).toBe("梦层");
    expect(window.document.querySelector('link[rel="icon"]').getAttribute("href")).toContain("logo.svg");
    applyAppearanceMetadata({ ...appearance, seoTitle: "运营自定义 SEO" }, window.document);
    expect(window.document.title).toBe("运营自定义 SEO");
    window.happyDOM.cancelAsync();
});
