import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { uploadNodeType } from "../src/lib/canvas/canvas-file-upload";
import { CanvasNodeType } from "../src/types/canvas";
import { Window } from "happy-dom";

const dom = new Window();
globalThis.DOMParser = dom.DOMParser as unknown as typeof DOMParser;

export function wordFile(body: string, name = "剧本.docx") {
    const bytes = zipSync({
        "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        "word/document.xml": strToU8(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
    });
    return new File([bytes], name, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

test("Word 文件可通过画布上传与拖入的共同类型检查", () => {
    expect(uploadNodeType({ name: "剧本.DOCX", type: "" })).toBe(CanvasNodeType.Text);
    expect(uploadNodeType({ name: "旧剧本.doc", type: "application/msword" })).toBeNull();
});

test("提取真实 DOCX 中的中文段落、换行和表格正文，不把 XML 当正文", async () => {
    const { readTextUploadFile } = await import("../src/lib/document-upload");
    const file = wordFile('<w:p><w:r><w:t>第一章 雨夜</w:t></w:r></w:p><w:p><w:r><w:t>你好 &amp; 再见</w:t><w:br/><w:t>下一行</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>对白</w:t></w:r></w:p></w:tc></w:tr></w:tbl>');
    const text = await readTextUploadFile(file);
    expect(text).toContain("第一章 雨夜\n\n你好 & 再见\n下一行");
    expect(text).toContain("对白");
    expect(text).not.toContain("<w:");
});

test("损坏、空白和旧版 Word 明确失败，纯文本仍可读取", async () => {
    const { readTextUploadFile } = await import("../src/lib/document-upload");
    await expect(readTextUploadFile(new File(["broken"], "坏文件.docx"))).rejects.toThrow("无法读取 Word 文档");
    await expect(readTextUploadFile(wordFile("<w:p/>"))).rejects.toThrow("没有可读取的正文");
    await expect(readTextUploadFile(new File(["binary"], "旧文件.doc"))).rejects.toThrow("另存为 .docx");
    expect(await readTextUploadFile(new File(["# 中文\n正文"], "笔记.md"))).toBe("# 中文\n正文");
});
