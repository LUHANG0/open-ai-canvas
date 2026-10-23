import { expect, test } from "bun:test";

import { parseSkillDocument } from "@/lib/skill-document";

test("separates a complete SKILL.md header and preserves every original source character", () => {
    const source = "---\nname: character-design\ndescription: 角色设计\nlicense: MIT\n---\n\n# 角色设计\n\n正文\n---\n尾段\n";
    const result = parseSkillDocument("skills/character/SKILL.md", source);
    expect(result.metadata).toEqual({ name: "character-design", description: "角色设计", license: "MIT" });
    expect(result.body).toBe("\n# 角色设计\n\n正文\n---\n尾段\n");
    expect(result.source).toBe(source);
    expect(result.frontmatter! + result.body).toBe(source);
});

test("accepts BOM and CRLF without normalizing the source or body", () => {
    const source = "\uFEFF---\r\nname: example\r\ndescription: >\r\n  第一行\r\n  第二行\r\n---\r\n\r\n# 标题\r\n正文\r\n";
    const result = parseSkillDocument("SKILL.md", source);
    expect(result.metadata?.description).toBe("第一行 第二行\n");
    expect(result.body).toBe("\r\n# 标题\r\n正文\r\n");
    expect(result.source).toBe(source);
    expect(result.frontmatter! + result.body).toBe(source);
});

test("keeps multiline descriptions, nested metadata and ordinary Markdown body intact", () => {
    const source = "---\nname: multiline\ndescription: |\n  第一行\n  第二行\nmetadata:\n  version: 2\nallowed-tools: [Read, Write]\n---\nTitle\n-----\n\n```yaml\nname: body\n```\n";
    const result = parseSkillDocument("SKILL.md", source);
    expect(result.metadata?.description).toBe("第一行\n第二行\n");
    expect(result.metadata?.metadata).toEqual({ version: 2 });
    expect(result.metadata?.["allowed-tools"]).toEqual(["Read", "Write"]);
    expect(result.body).toBe("Title\n-----\n\n```yaml\nname: body\n```\n");
});

test("never separates front matter from a different file or a noninitial header", () => {
    const header = "---\nname: example\n---\n# Body";
    for (const path of ["README.md", "skill.md", "SKILL.md.backup", "SKILL.md/README.md"]) {
        expect(parseSkillDocument(path, header)).toEqual({ source: header, body: header, frontmatter: null, metadata: null });
    }
    for (const source of [`\n${header}`, `Intro\n${header}`, `\`\`\`yaml\n${header}\n\`\`\``]) {
        expect(parseSkillDocument("SKILL.md", source).body).toBe(source);
        expect(parseSkillDocument("SKILL.md", source).metadata).toBeNull();
    }
});

test("preserves Setext headings and horizontal rules rather than swallowing prose", () => {
    for (const source of ["Title\n---\nBody", "---\nA heading\n---\nBody", "---\nnotes: ordinary prose\n---\nBody", "---\n# A heading\n\nText\n---\nBody", "---\n- first\n- second\n---\nBody"]) {
        const result = parseSkillDocument("SKILL.md", source);
        expect(result.body).toBe(source);
        expect(result.metadata).toBeNull();
    }
});

test("preserves missing, malformed, duplicate and unsupported YAML headers in full", () => {
    for (const source of [
        "---\nname: missing close\n# Body",
        "---\nname: [broken\n---\nBody",
        "---\nname: first\nname: second\n---\nBody",
        "---\nname: !unsupported value\n---\nBody",
        "---\nname: ''\ndescription: '  '\n---\nBody",
        "---\nname: 12\n---\nBody",
        "---\n---\nBody",
        "---x\nname: example\n---\nBody",
    ]) {
        const result = parseSkillDocument("SKILL.md", source);
        expect(result.source).toBe(source);
        expect(result.body).toBe(source);
        expect(result.frontmatter).toBeNull();
        expect(result.metadata).toBeNull();
    }
});
