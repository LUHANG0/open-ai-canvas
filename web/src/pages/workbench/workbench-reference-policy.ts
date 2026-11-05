import type { WorkbenchReferenceSlot } from "@/services/api/workbench";

type MediaKind = "image" | "video" | "audio";
type Reference = { resourceId?: string; kind: MediaKind; slotKey?: string };

/** Resolve the entire old selection before the caller replaces any live input. */
export async function prepareWorkbenchReferences<T extends { resourceId: string; kind: MediaKind }>(references: readonly T[], resolve: (reference: T) => Promise<string | undefined>, active: () => boolean): Promise<Array<T & { previewUrl: string }>> {
    const assertCurrent = () => {
        if (!active()) throw new DOMException("创作输入或账号已变化，请重新载入参数", "AbortError");
    };
    assertCurrent();
    const resolved = await Promise.all(references.map(async (reference) => ({ ...reference, previewUrl: (await resolve(reference)) || "" })));
    assertCurrent();
    if (resolved.some((reference) => !reference.previewUrl)) throw new Error("参考素材不存在或暂时无法读取，当前创作输入已保留");
    return resolved;
}

/** Plan the complete selection before changing the composer; never silently drop excess items. */
export function planWorkbenchReferences<T extends { resourceId: string; kind: MediaKind }>(
    current: readonly Reference[],
    picked: readonly T[],
    slots: readonly WorkbenchReferenceSlot[],
    limits: Record<MediaKind, number>,
    targetSlotKey?: string,
): Array<T & { slotKey?: string }> {
    const counts = { image: current.filter((item) => item.kind === "image").length, video: current.filter((item) => item.kind === "video").length, audio: current.filter((item) => item.kind === "audio").length };
    const used = new Map(slots.map((slot) => [slot.key, current.filter((item) => item.slotKey === slot.key).length]));
    const planned: Array<T & { slotKey?: string }> = [];
    for (const item of picked) {
        if (counts[item.kind] >= Math.max(0, limits[item.kind])) throw new Error(`当前模型的${{ image: "图片", video: "视频", audio: "音频" }[item.kind]}参考数量已达上限`);
        const slot = slots.length ? slots.find((entry) => (!targetSlotKey || entry.key === targetSlotKey) && entry.mediaTypes.includes(item.kind) && (used.get(entry.key) || 0) < entry.maxCount) : undefined;
        if ((slots.length || targetSlotKey) && !slot) throw new Error("所选素材不符合当前模板的类型或数量要求");
        if ([...current, ...planned].some((entry) => entry.resourceId === item.resourceId && entry.slotKey === slot?.key)) throw new Error("同一个素材已在该参考位置，请取消重复选择");
        counts[item.kind]++;
        if (slot) used.set(slot.key, (used.get(slot.key) || 0) + 1);
        planned.push({ ...item, ...(slot ? { slotKey: slot.key } : {}) });
    }
    return planned;
}
