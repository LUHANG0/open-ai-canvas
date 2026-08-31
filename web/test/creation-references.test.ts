import { describe, expect, test } from "bun:test";

import { canvasResourceMentionToken } from "../src/lib/canvas/canvas-resource-references";
import {
    canAddCreationAttachment,
    countCreationAttachments,
    creationAttachmentKind,
    creationFileAccepted,
    creationMediaAspectRatio,
    creationUploadAccept,
    creationVideoFrameAttachmentIds,
    creationVideoImageRole,
    filterCreationUploadFiles,
    normalizeCreationVideoImageRoles,
    reconcileCreationAttachmentLimits,
    setCreationVideoImageRole,
    type CreationAttachment,
    type CreationAttachmentLimits,
} from "../src/pages/create/creation-assets";
import { buildCreationMentionReferences, displayCreationPrompt, reconcileCreationAttachmentLimit, removeCreationReferenceTokens, replaceCreationAttachmentReference, selectedCreationReferences } from "../src/pages/create/creation-references";

function imageAttachment(id: string): CreationAttachment {
    return {
        id,
        name: `${id}.png`,
        type: "image/png",
        dataUrl: `data:image/png;base64,${id}`,
        previewUrl: `data:image/png;base64,${id}`,
    };
}

function mediaAttachment(id: string, kind: "video" | "audio" | "file"): CreationAttachment {
    const extension = kind === "video" ? "mp4" : kind === "audio" ? "mp3" : "pdf";
    const type = kind === "video" ? "video/mp4" : kind === "audio" ? "audio/mpeg" : "application/pdf";
    return {
        id,
        name: `${id}.${extension}`,
        type,
        url: `https://example.com/${id}.${extension}`,
        storageKey: `${kind}:${id}`,
        bytes: 100,
        previewUrl: "",
    };
}

const mixedMediaLimits: CreationAttachmentLimits = { maxImages: 2, maxVideos: 1, maxAudios: 1, maxFiles: 1 };

describe("creation references", () => {
    test("removes attachments and prompt tokens beyond the current model limit", () => {
        const attachments = [imageAttachment("first"), imageAttachment("second"), imageAttachment("third")];
        const references = buildCreationMentionReferences([], attachments);
        const result = reconcileCreationAttachmentLimit(attachments, references, 1);
        const prompt = references.map(canvasResourceMentionToken).join(" ");
        const nextPrompt = removeCreationReferenceTokens(prompt, result.removedReferences);

        expect(result.attachments).toEqual([attachments[0]]);
        expect(result.removedReferences.map((reference) => reference.attachmentId)).toEqual(["second", "third"]);
        expect(nextPrompt).toContain(canvasResourceMentionToken(references[0]));
        expect(nextPrompt).not.toContain(canvasResourceMentionToken(references[1]));
        expect(nextPrompt).not.toContain(canvasResourceMentionToken(references[2]));
    });

    test("returns the original attachment list when it is already within the limit", () => {
        const attachments = [imageAttachment("first")];
        const result = reconcileCreationAttachmentLimit(attachments, buildCreationMentionReferences([], attachments), 1);

        expect(result.attachments).toBe(attachments);
        expect(result.removedReferences).toEqual([]);
    });

    test("文本创作允许媒体和常用文档，图片创作仍只接受图片", () => {
        expect(creationFileAccepted("text", { name: "story.pdf", type: "application/pdf" })).toBe(true);
        expect(creationFileAccepted("text", { name: "clip.mp4", type: "video/mp4" })).toBe(true);
        expect(creationFileAccepted("image", { name: "story.pdf", type: "application/pdf" })).toBe(false);
        expect(creationUploadAccept("text")).toContain(".docx");
    });

    test("文档附件会作为文本资源参与引用", () => {
        const attachment: CreationAttachment = { id: "document", name: "script.pdf", type: "application/pdf", url: "https://example.com/script.pdf", storageKey: "resource:document", bytes: 1024, previewUrl: "" };
        const [reference] = buildCreationMentionReferences([], [attachment]);

        expect(creationAttachmentKind(attachment)).toBe("file");
        expect(reference.kind).toBe("text");
        expect(reference.label).toBe("文件1");
    });

    test("不同附件类型分别按自己的引入顺序编号", () => {
        const audio: CreationAttachment = { id: "audio", name: "audio.mp3", type: "audio/mpeg", url: "blob:audio", storageKey: "audio:key", previewUrl: "" };
        const references = buildCreationMentionReferences([], [imageAttachment("first"), audio, imageAttachment("second")]);

        expect(references.map((reference) => reference.label)).toEqual(["图片1", "音频1", "图片2"]);
    });

    test("媒体占位按本次选择的画幅展示并为异常值提供模式回退", () => {
        expect(creationMediaAspectRatio("16:9", "video")).toBe("16 / 9");
        expect(creationMediaAspectRatio("1:1", "image")).toBe("1 / 1");
        expect(creationMediaAspectRatio("1920x1080", "image")).toBe("1920 / 1080");
        expect(creationMediaAspectRatio("auto", "video")).toBe("16 / 9");
        expect(creationMediaAspectRatio("auto", "image")).toBe("1 / 1");
    });

    test("替换图片时保留目标位置且提示词无需修改", () => {
        const attachments = [imageAttachment("first"), imageAttachment("second"), imageAttachment("third")];
        const references = buildCreationMentionReferences([], attachments);
        const oldToken = canvasResourceMentionToken(references[1]);
        const replacement = imageAttachment("replacement");

        const result = replaceCreationAttachmentReference(`让 ${oldToken} 靠近 ${oldToken}`, attachments, "second", replacement);
        const nextReferences = buildCreationMentionReferences([], result.attachments);
        const replacementReference = nextReferences.find((reference) => reference.attachmentId === replacement.id)!;
        const replacementToken = canvasResourceMentionToken(replacementReference);

        expect(result.attachments.map((attachment) => attachment.id)).toEqual(["first", "replacement", "third"]);
        expect(replacementReference.label).toBe("图片2");
        expect(result.prompt).toBe(`让 ${replacementToken} 靠近 ${replacementToken}`);
        expect(result.prompt).not.toContain(oldToken);
        expect(displayCreationPrompt(result.prompt, nextReferences)).toBe("让 @图片2 靠近 @图片2");
    });

    test("删除中间附件后只移除该附件引用，后续附件仍按稳定身份保留", () => {
        const attachments = ["first", "second", "third", "fourth", "fifth"].map(imageAttachment);
        const references = buildCreationMentionReferences([], attachments);
        const third = references[2];
        const fifth = references[4];
        const prompt = `删除前比较 ${canvasResourceMentionToken(third)} 和 ${canvasResourceMentionToken(fifth)}`;
        const remaining = attachments.filter((attachment) => attachment.id !== "third");
        const nextPrompt = removeCreationReferenceTokens(prompt, [third]);
        const nextReferences = buildCreationMentionReferences([], remaining);

        expect(nextPrompt).not.toContain(canvasResourceMentionToken(third));
        expect(nextPrompt).toContain(canvasResourceMentionToken(fifth));
        expect(selectedCreationReferences(nextPrompt, nextReferences).map((reference) => reference.attachmentId)).toEqual(["fifth"]);
        expect(displayCreationPrompt(nextPrompt, nextReferences)).toBe("删除前比较  和 @图片4");
    });

    test("替换会归一化可见标签并去除已存在的重复附件", () => {
        const attachments = [imageAttachment("source"), imageAttachment("target"), imageAttachment("third")];
        const result = replaceCreationAttachmentReference("让 @图片2 参考 @图片2。", attachments, "target", attachments[0]);
        const references = buildCreationMentionReferences([], result.attachments);
        const sourceReference = references.find((reference) => reference.attachmentId === "source")!;

        expect(result.attachments.map((attachment) => attachment.id)).toEqual(["third", "source"]);
        expect(sourceReference.label).toBe("图片2");
        expect(result.prompt).toBe(`让 ${canvasResourceMentionToken(sourceReference)} 参考 ${canvasResourceMentionToken(sourceReference)}。`);
    });

    test("目标附件不存在时拒绝替换", () => {
        expect(() => replaceCreationAttachmentReference("", [imageAttachment("first")], "missing", imageAttachment("next"))).toThrow("要替换的参考内容不存在");
    });

    test("混合媒体按图片、视频、音频和文件分别统计与判断剩余额度", () => {
        const attachments = [imageAttachment("image-1"), mediaAttachment("video-1", "video"), mediaAttachment("audio-1", "audio"), mediaAttachment("document-1", "file")];

        expect(countCreationAttachments(attachments)).toEqual({ image: 1, video: 1, audio: 1, file: 1 });
        expect(canAddCreationAttachment(attachments, "video", mixedMediaLimits, "image")).toBe(true);
        expect(canAddCreationAttachment(attachments, "video", mixedMediaLimits, "video")).toBe(false);
        expect(canAddCreationAttachment(attachments, "video", mixedMediaLimits, "file")).toBe(false);
        expect(canAddCreationAttachment([], "video", { ...mixedMediaLimits, maxAudios: 0 }, "audio")).toBe(false);
        expect(canAddCreationAttachment([], "image", mixedMediaLimits, "video")).toBe(false);
    });

    test("分类上限调整会稳定保留每类最早的附件并返回被移除项", () => {
        const attachments = [
            imageAttachment("image-1"),
            mediaAttachment("video-1", "video"),
            imageAttachment("image-2"),
            mediaAttachment("audio-1", "audio"),
            mediaAttachment("video-2", "video"),
            imageAttachment("image-3"),
            mediaAttachment("document-1", "file"),
        ];
        const result = reconcileCreationAttachmentLimits(attachments, "video", mixedMediaLimits);

        expect(result.attachments.map((attachment) => attachment.id)).toEqual(["image-1", "video-1", "image-2", "audio-1"]);
        expect(result.removedAttachments.map((attachment) => attachment.id)).toEqual(["video-2", "image-3", "document-1"]);
        expect(reconcileCreationAttachmentLimits(result.attachments, "video", mixedMediaLimits).attachments).toBe(result.attachments);
    });

    test("批量上传按当前剩余分类额度稳定过滤，且不向视频模式混入文件", () => {
        const files = [
            { name: "video.mp4", type: "video/mp4" },
            { name: "image-2.png", type: "image/png" },
            { name: "notes.pdf", type: "application/pdf" },
            { name: "image-3.png", type: "image/png" },
            { name: "audio.mp3", type: "audio/mpeg" },
            { name: "video-2.mp4", type: "video/mp4" },
        ];
        const result = filterCreationUploadFiles(files, "video", mixedMediaLimits, [imageAttachment("image-1")]);

        expect(result.acceptedFiles.map((file) => file.name)).toEqual(["video.mp4", "image-2.png", "audio.mp3"]);
        expect(result.rejectedFiles.map((file) => file.name)).toEqual(["notes.pdf", "image-3.png", "video-2.mp4"]);
        expect(result.rejections.map(({ file, kind, reason }) => [file.name, kind, reason])).toEqual([
            ["notes.pdf", undefined, "unsupported_type"],
            ["image-3.png", "image", "limit_reached"],
            ["video-2.mp4", "video", "limit_reached"],
        ]);
    });

    test("文本模式可按独立文件额度接收文档，图片模式不接收音视频", () => {
        const files = [
            { name: "notes.pdf", type: "application/pdf" },
            { name: "extra.md", type: "text/markdown" },
            { name: "clip.mp4", type: "video/mp4" },
        ];

        expect(filterCreationUploadFiles(files, "text", { ...mixedMediaLimits, maxFiles: 1 }).acceptedFiles.map((file) => file.name)).toEqual(["notes.pdf", "clip.mp4"]);
        expect(filterCreationUploadFiles(files, "image", mixedMediaLimits).acceptedFiles).toEqual([]);
    });

    test("视频图片角色兼容旧附件，并保证首帧和尾帧各自唯一", () => {
        const original = [imageAttachment("first"), imageAttachment("second"), mediaAttachment("video", "video"), imageAttachment("third")];
        expect(creationVideoImageRole(original[0])).toBe("reference_image");
        expect(creationVideoImageRole(original[2])).toBeUndefined();

        const withFirst = setCreationVideoImageRole(original, "first", "first_frame");
        const withLast = setCreationVideoImageRole(withFirst, "second", "last_frame");
        const movedFirst = setCreationVideoImageRole(withLast, "third", "first_frame");

        expect(movedFirst.map(creationVideoImageRole)).toEqual(["reference_image", "last_frame", undefined, "first_frame"]);
        expect(creationVideoFrameAttachmentIds(movedFirst)).toEqual({ videoStartFrameNodeId: "third", videoEndFrameNodeId: "second" });
        expect(setCreationVideoImageRole(movedFirst, "video", "first_frame")).toBe(movedFirst);
        expect(creationVideoFrameAttachmentIds(movedFirst.filter((attachment) => attachment.id !== "second"))).toEqual({ videoStartFrameNodeId: "third", videoEndFrameNodeId: undefined });
    });

    test("只为未设置角色的图片自动初始化首尾帧", () => {
        const original = [imageAttachment("first"), imageAttachment("second"), imageAttachment("third")];
        const framed = normalizeCreationVideoImageRoles(original, "image_to_video");

        expect(framed.map(creationVideoImageRole)).toEqual(["first_frame", "last_frame", "reference_image"]);
        expect(creationVideoFrameAttachmentIds(framed)).toEqual({ videoStartFrameNodeId: "first", videoEndFrameNodeId: "second" });

        const explicitReference = setCreationVideoImageRole(framed, "second", "reference_image");
        expect(normalizeCreationVideoImageRoles(explicitReference, "image_to_video")).toBe(explicitReference);
        expect(explicitReference.map(creationVideoImageRole)).toEqual(["first_frame", "reference_image", "reference_image"]);
        expect(creationVideoFrameAttachmentIds(explicitReference)).toEqual({ videoStartFrameNodeId: "first", videoEndFrameNodeId: undefined });

        const singleTail = setCreationVideoImageRole([imageAttachment("only")], "only", "last_frame");
        expect(normalizeCreationVideoImageRoles(singleTail, "image_to_video")).toBe(singleTail);
        expect(singleTail.map(creationVideoImageRole)).toEqual(["last_frame"]);
        expect(creationVideoFrameAttachmentIds(singleTail)).toEqual({ videoStartFrameNodeId: undefined, videoEndFrameNodeId: "only" });
    });

    test("切换全模态时清除帧标记，再切回时可重新自动初始化", () => {
        const framed = normalizeCreationVideoImageRoles([imageAttachment("first"), imageAttachment("second"), imageAttachment("third")], "image_to_video");

        const referenced = normalizeCreationVideoImageRoles(framed, "reference_to_video");
        expect(referenced.map(creationVideoImageRole)).toEqual(["reference_image", "reference_image", "reference_image"]);
        expect(creationVideoFrameAttachmentIds(referenced)).toEqual({ videoStartFrameNodeId: undefined, videoEndFrameNodeId: undefined });

        const reframed = normalizeCreationVideoImageRoles(referenced, "image_to_video");
        expect(reframed.map(creationVideoImageRole)).toEqual(["first_frame", "last_frame", "reference_image"]);
        expect(creationVideoFrameAttachmentIds(reframed)).toEqual({ videoStartFrameNodeId: "first", videoEndFrameNodeId: "second" });
    });
});
