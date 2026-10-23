import type { PluginManifest, PluginManifestV2 } from "@/lib/plugins/plugin-types";

const permissionLabels: Record<string, string> = {
    "canvas.read": "读取画布",
    "canvas.write": "修改画布",
    "asset.read": "读取素材",
    "asset.search": "搜索素材",
    "asset.import": "导入素材",
    "asset.upload": "上传素材",
    "generation.run": "调用生成",
    "ai.text": "调用已配置的文本/视觉理解模型",
    "external.open": "打开外部详情",
};

export function getPluginDocumentation(manifest: PluginManifest | PluginManifestV2) {
    if (manifest.documentation?.trim()) return manifest.documentation.trim();

    const capabilities = manifest.permissions.map((permission) => permissionLabels[permission] || permission);
    return [
        `# ${manifest.name}`,
        "",
        manifest.description || "该插件没有提供简介。",
        "",
        "## 插件信息",
        "",
        `- 作者：${manifest.author || "未声明"}`,
        `- 版本：${manifest.version}`,
        `- 能力：${capabilities.join("、") || "未声明"}`,
        "",
        manifest.contributes.providers?.length
            ? "> 此插件没有提供接入文档。请联系插件作者补充 `documentation`，不要仅凭清单字段推测上游接口。"
            : "> 该插件当前没有单独的使用文档。",
    ].join("\n");
}

function plainDocumentationText(value: string) {
    return !/[`*_\[\]<>\\~]/.test(value)
        && !/&(?:#(?:x[\da-f]+|\d+)|[a-z][a-z\d]+);/i.test(value)
        && !/(?:[a-z][a-z\d+.-]*:\/\/|www\.|\S+@\S+\.\S+)/i.test(value);
}

function skipBlankLines(value: string) {
    return value.replace(/^(?:[ \t]*\r?\n)+/, "");
}

/** 只消除外层已展示的纯文本首块；含链接、代码或其它 Markdown 结构时保留原文。 */
export function getPluginDocumentationDisplaySource(source: string, identity: { name: string; description?: string }) {
    let body = skipBlankLines(source);
    let changed = false;
    const firstLine = body.match(/^([^\r\n]*)(?:\r?\n|$)/);
    const name = identity.name.trim();
    if (firstLine && name && plainDocumentationText(name)) {
        const atx = firstLine[1].match(/^ {0,3}#{1,6}[ \t]+(.+?)\s*$/);
        const heading = atx?.[1].replace(/[ \t]+#+[ \t]*$/, "").trim();
        const afterFirstLine = body.slice(firstLine[0].length);
        const setext = afterFirstLine.match(/^ {0,3}(?:=+|-+)[ \t]*(?:\r?\n|$)/);
        if (heading === name || (!atx && /^ {0,3}\S/.test(firstLine[1]) && firstLine[1].trim() === name && setext)) {
            const headingLength = firstLine[0].length + (heading === name ? 0 : setext![0].length);
            body = skipBlankLines(body.slice(headingLength));
            changed = true;
        }
    }

    const description = identity.description?.trim();
    const firstParagraph = body.split(/\r?\n[ \t]*\r?\n/, 1)[0];
    const blockSyntax = /^(?: {4}|\t)|^ {0,3}(?:#{1,6}(?:[ \t]|$)|>|(?:[-+]|\d+[.)])[ \t]|(?:-{3,}|=+)[ \t]*$)/m;
    if (description && firstParagraph.trim() === description && plainDocumentationText(firstParagraph) && !blockSyntax.test(firstParagraph)) {
        body = skipBlankLines(body.slice(firstParagraph.length));
        changed = true;
    }
    return changed ? body : source;
}
