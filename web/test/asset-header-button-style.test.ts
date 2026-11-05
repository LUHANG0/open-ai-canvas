import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getWorkspaceAntThemeConfig } from "../src/lib/app-theme";
describe("asset library header buttons", () => {
    test("user pages share control geometry without a light-only outline override", () => {
        const css = readFileSync(resolve(import.meta.dir, "../src/styles/globals.css"), "utf8");
        const theme = getWorkspaceAntThemeConfig();
        // 保留梦层工作台密度：38px 常规 / 30px 紧凑，按钮与输入控件共用 12px 圆角。
        expect(theme.token?.controlHeight).toBe(38);
        expect(theme.token?.controlHeightSM).toBe(30);
        expect(theme.components?.Button?.borderRadius).toBe(theme.token?.borderRadius);
        expect(theme.components?.Input?.borderRadius).toBe(theme.token?.borderRadius);
        expect(theme.components?.Select?.borderRadius).toBe(theme.token?.borderRadius);
        expect(css).toContain("--user-control-height: 38px;");
        expect(css).toContain("--user-radius-button: 12px;");
        // 工作台继续使用随主题切换的柔和表面和透明边缘，不增加亮色专用覆盖。
        expect(theme.components?.Button?.defaultBg).toBe("var(--user-surface-muted)");
        expect(theme.components?.Button?.defaultColor).toBe("var(--user-ink)");
        expect(theme.components?.Button?.defaultBorderColor).toBe("transparent");
        expect(theme.components?.Button?.defaultHoverBg).toBe("var(--user-surface-hover)");
        expect(css).not.toContain("html:not(.dark) .library-page .app-page-header .ant-btn");
        expect(css).not.toContain("html .assets-library-page .app-page-header .assets-header-action-buttons .ant-btn");
    });
});
