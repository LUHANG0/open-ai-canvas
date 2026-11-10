import { isWordUploadFile, isLegacyWordUploadFile, readTextUploadFile } from "@/lib/document-upload";
import { resourceStorageKey, uploadResourceFile } from "@/services/api/resources";
import { captureUploadScope, type UploadScopeOptions } from "@/services/upload-scope";
import type { NewAsset } from "@/stores/use-asset-store";

export const ASSET_UPLOAD_ACCEPT = "image/*,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export function isAssetUploadDocument(file: Pick<File, "name" | "type">) {
    return !isLegacyWordUploadFile(file) && isWordUploadFile(file);
}

export async function uploadAssetDocument(file: File, options: UploadScopeOptions & { idempotencyKey?: string } = {}, onProgress?: (loaded: number, total: number) => void): Promise<NewAsset> {
    const { assertCurrent, options: scopedOptions } = captureUploadScope(options);
    const content = await readTextUploadFile(file);
    assertCurrent();
    // 原件必须上传成功才入素材库，失败保留队列供用户重试。
    const resource = await uploadResourceFile(file, "file", { ...scopedOptions, fileName: file.name, idempotencyKey: options.idempotencyKey }, onProgress);
    assertCurrent();
    return {
        kind: "text", title: file.name.replace(/\.[^.]+$/, ""), coverUrl: "", tags: [], status: "confirmed", source: "Word 文档",
        metadata: { source: "manual-batch", originalDocument: { storageKey: resourceStorageKey(resource.id), fileName: file.name, mimeType: file.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: file.size } },
        data: { content },
    };
}
