import { expect, test } from "bun:test";

test("插件中心使用面向客户的能力与处理状态文案", async () => {
    const source = await Bun.file(new URL("../src/pages/plugins/index.tsx", import.meta.url)).text();

    expect(source).toContain('label: "文本能力"');
    expect(source).toContain('label: "视频能力"');
    expect(source).toContain("视频生成、进度与成片");
    expect(source).toContain("后台处理");
    expect(source).not.toContain('label: "文本协议"');
    expect(source).not.toContain("异步轮询");
});
