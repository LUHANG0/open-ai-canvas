import { isAudioFile } from "@/lib/canvas/canvas-project-generation";

export type CanvasUploadBatchResult = {
    createdIds: string[];
    failedFiles: File[];
    rejectedFiles: File[];
};

export function isSupportedCanvasUploadFile(file: File) {
    return file.type.startsWith("image/") || file.type.startsWith("video/") || isAudioFile(file);
}

export function partitionCanvasUploadFiles(files: File[]) {
    const supportedFiles: File[] = [];
    const rejectedFiles: File[] = [];
    files.forEach((file) => (isSupportedCanvasUploadFile(file) ? supportedFiles : rejectedFiles).push(file));
    return { supportedFiles, rejectedFiles };
}
