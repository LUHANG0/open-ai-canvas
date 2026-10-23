import { parseDocument } from "yaml";

export type SkillDocument = {
    source: string;
    body: string;
    frontmatter: string | null;
    metadata: Record<string, unknown> | null;
};

/** Only a complete, identifiable skill header is separated from the original file. */
export function parseSkillDocument(path: string, source: string): SkillDocument {
    const original: SkillDocument = { source, body: source, frontmatter: null, metadata: null };
    if (path.split("/").at(-1) !== "SKILL.md") return original;
    const opening = /^\uFEFF?---[\t ]*(?:\r\n|\n|\r)/.exec(source);
    if (!opening) return original;
    const closingPattern = /^---[\t ]*(?:\r\n|\n|\r|$)/gm;
    closingPattern.lastIndex = opening[0].length;
    const closing = closingPattern.exec(source);
    if (!closing) return original;

    try {
        const document = parseDocument(source.slice(opening[0].length, closing.index), { schema: "core", maxAliasCount: 100 });
        if (document.errors.length || document.warnings.length) return original;
        const metadata: unknown = document.toJSON();
        if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return original;
        const fields = metadata as Record<string, unknown>;
        if (![fields.name, fields.description].some((value) => typeof value === "string" && value.trim())) return original;
        // A cyclic alias cannot be displayed as compact file information.
        JSON.stringify(fields);
        const bodyStart = closing.index + closing[0].length;
        return { source, body: source.slice(bodyStart), frontmatter: source.slice(0, bodyStart), metadata: fields };
    } catch {
        return original;
    }
}
