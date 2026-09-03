import { normalizeCharacterName, parseCharacterBreakdown, type CharacterBreakdown } from "@/lib/canvas/canvas-character-reference";
import type { ProjectAssetCandidate } from "@/services/api/projects";

export const CHAPTER_ASSET_CATEGORIES = ["character", "environment", "wardrobe", "prop", "weapon"] as const;

export type ChapterAssetCategory = (typeof CHAPTER_ASSET_CATEGORIES)[number];

export type ChapterAssetBreakdown = {
    name: string;
    aliases: string[];
    category: ChapterAssetCategory;
    description: string;
    visualPrompt: string;
    continuityNotes: string;
    sourceEvidence: string;
    character?: CharacterBreakdown;
};

export function parseChapterAssetBreakdown(raw: string): ChapterAssetBreakdown[] {
    const parsed = extractAssetBreakdownJson(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""));
    const candidates = (parsed as { assets?: unknown }).assets;
    if (!Array.isArray(candidates)) throw new Error("资产拆分结果缺少 assets 数组");
    if (candidates.length > 100) throw new Error("单章资产拆分结果超过 100 项，请拆分章节后重试");

    const seen = new Set<string>();
    const assets: ChapterAssetBreakdown[] = [];
    candidates.forEach((candidate) => {
        if (!candidate || typeof candidate !== "object") return;
        const value = candidate as Record<string, unknown>;
        const name = String(value.name || "").trim();
        const category = String(value.category || "").trim() as ChapterAssetCategory;
        if (!name || !CHAPTER_ASSET_CATEGORIES.includes(category)) return;
        const aliases = Array.isArray(value.aliases) ? value.aliases.map((alias) => String(alias).trim()).filter(Boolean) : [];
        const identityKeys = [name, ...aliases].map(normalizeCharacterName).filter(Boolean).map((key) => `${category}:${key}`);
        if (!identityKeys.length || identityKeys.some((key) => seen.has(key))) return;

        const description = String(value.description || "").trim();
        const visualPrompt = String(value.visualPrompt || "").trim();
        const continuityNotes = String(value.continuityNotes || "").trim();
        const sourceEvidence = String(value.sourceEvidence || "").trim();
        if (!description || !visualPrompt || !sourceEvidence) throw new Error(`资产“${name}”缺少制作描述、视觉约束或正文依据，请重新拆分`);

        let character: CharacterBreakdown | undefined;
        if (category === "character") {
            const characterValue = value.character && typeof value.character === "object" ? value.character as Record<string, unknown> : {};
            character = parseCharacterBreakdown(JSON.stringify({ characters: [{ ...characterValue, name, aliases }] }))[0];
        }
        identityKeys.forEach((key) => seen.add(key));
        assets.push({ name, aliases: uniqueAliases(name, aliases), category, description, visualPrompt, continuityNotes, sourceEvidence, character });
    });
    if (!assets.length) throw new Error("没有从章节正文中识别到需要跨镜头保持一致的资产");
    return assets;
}

export function freshChapterAssetBreakdowns(assets: ChapterAssetBreakdown[], existing: ProjectAssetCandidate[]) {
    const known = new Set(existing
        .filter((candidate) => candidate.status === "pending_confirmation")
        .flatMap((candidate) => candidateIdentityKeys(candidate)));
    const fresh: ChapterAssetBreakdown[] = [];
    for (const asset of assets) {
        const keys = [asset.name, ...asset.aliases].map(normalizeCharacterName).filter(Boolean).map((key) => `${asset.category}:${key}`);
        if (keys.some((key) => known.has(key))) continue;
        fresh.push(asset);
        keys.forEach((key) => known.add(key));
    }
    return fresh;
}

export function chapterAssetCandidateDetails(asset: ChapterAssetBreakdown): Record<string, unknown> {
    const common = {
        aliases: asset.aliases,
        description: asset.description,
        visualPrompt: asset.visualPrompt,
        continuityNotes: asset.continuityNotes,
        sourceEvidence: asset.sourceEvidence,
    };
    return asset.character ? { ...common, ...asset.character } : common;
}

function candidateIdentityKeys(candidate: ProjectAssetCandidate) {
    let aliases: string[] = [];
    try {
        const details = JSON.parse(candidate.detailsJson || "{}") as { aliases?: unknown };
        if (Array.isArray(details.aliases)) aliases = details.aliases.map((alias) => String(alias));
    } catch {
        // A malformed historical details payload must not hide the candidate's primary name.
    }
    return [candidate.name, ...aliases]
        .map(normalizeCharacterName)
        .filter(Boolean)
        .map((key) => `${candidate.category}:${key}`);
}

function uniqueAliases(name: string, aliases: string[]) {
    const nameKey = normalizeCharacterName(name);
    const seen = new Set<string>();
    return aliases.filter((alias) => {
        const key = normalizeCharacterName(alias);
        if (!key || key === nameKey || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function extractAssetBreakdownJson(raw: string): Record<string, unknown> {
    for (let start = 0; start < raw.length; start += 1) {
        if (raw[start] !== "{") continue;
        const end = findJsonValueEnd(raw, start);
        if (end < start) continue;
        try {
            const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && Array.isArray((parsed as { assets?: unknown }).assets)) return parsed as Record<string, unknown>;
        } catch {
            // Ignore prose braces and continue to the next complete JSON object.
        }
    }
    throw new Error("资产拆分没有返回符合契约的 JSON");
}

function findJsonValueEnd(source: string, start: number) {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index += 1) {
        const character = source[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === "\"") inString = false;
            continue;
        }
        if (character === "\"") { inString = true; continue; }
        if (character === "{" || character === "[") { stack.push(character); continue; }
        if (character !== "}" && character !== "]") continue;
        const opener = stack.pop();
        if ((character === "}" && opener !== "{") || (character === "]" && opener !== "[")) return -1;
        if (!stack.length) return index;
    }
    return -1;
}
