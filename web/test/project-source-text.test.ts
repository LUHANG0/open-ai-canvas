import { describe, expect, test } from "bun:test";

import { projectSourceTextToPlainText } from "../src/lib/project-source-text";

describe("项目章节正文显示", () => {
    test("将富文本章节转换为可读纯文本而不是展示 HTML 标签", () => {
        expect(projectSourceTextToPlainText("<p>第一幕<br>雨夜</p><p>&lt;转场&gt; &amp; 追车</p>")).toBe("第一幕\n雨夜\n<转场> & 追车");
    });

    test("保留列表阅读顺序并压缩多余空行", () => {
        expect(projectSourceTextToPlainText("<ul><li>角色登场</li><li>冲突升级</li></ul>\n\n")).toBe("• 角色登场\n• 冲突升级");
    });
});
