export type GeneratedStory = {
    title: string;
    synopsis: string;
    chapters: Array<{ title: string; content: string }>;
};

export function parseGeneratedStory(answer: string): GeneratedStory {
    const cleaned = answer
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    let payload: Record<string, unknown> = {};
    try {
        payload = match ? JSON.parse(match[0]) as Record<string, unknown> : {};
    } catch {
        throw new Error("AI 返回的章节格式无法解析，请重试或改用手动创建");
    }
    const title = String(payload.title || "").trim();
    const synopsis = String(payload.synopsis || "").trim();
    const chapters = Array.isArray(payload.chapters)
        ? payload.chapters
              .map((chapter: unknown) => {
                  const item = typeof chapter === "object" && chapter ? (chapter as Record<string, unknown>) : {};
                  return { title: String(item.title || "").trim(), content: String(item.content || "").trim() };
              })
              .filter((chapter: { title: string; content: string }) => chapter.title && chapter.content)
        : [];
    return { title: title || storyTitleFromAnswer(answer), synopsis, chapters };
}

export function projectNameCandidates(title: string) {
    const base = title.trim().slice(0, 24) || "AI 生成短剧";
    return Array.from({ length: 6 }, (_, attempt) => attempt === 0 ? base : `${base}（${attempt + 1}）`);
}

export function isProjectNameConflict(error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return message.includes("UNIQUE") || message.includes("projects.user_id") || message.includes("projects.name");
}

export const generationSteps = [{ label: "AI 正在生成故事大纲与章节" }, { label: "正在创建项目" }, { label: "正在导入章节" }];

export function generationStepDone(label: string, status: string) {
    if (label === "AI 正在生成故事大纲与章节") return status.startsWith("正在创建项目") || status.startsWith("正在导入");
    if (label === "正在创建项目") return status.startsWith("正在导入");
    return false;
}

function storyTitleFromAnswer(answer: string) {
    const line = answer.split(/\r?\n/).find((item) => item.trim());
    return line ? line.trim().slice(0, 24) : "AI 生成短剧";
}
