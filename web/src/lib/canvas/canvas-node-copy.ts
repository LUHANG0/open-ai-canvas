import { resetGenerationTaskMetadata } from "@/lib/canvas/canvas-project-generation";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type StoryboardRow } from "@/types/canvas";

const COPY_TITLE_SUFFIX = /^(.*)_copy(\d+)$/i;

const VIDEO_VARIANT_RESULT_FIELDS = [
    "content", "previewContent", "videoPreview", "imageRotation", "storageKey", "mimeType", "bytes",
    "durationMs", "hasAudio", "naturalWidth", "naturalHeight",
    "assetId", "producedModel", "producedModelCandidate", "resultRecord",
    "subtitleEntries", "subtitleHighlights", "subtitleUpdatedAt",
    "agentGenerationContinuation", "lastGenerationRequestFingerprint",
    "fileUpload", "fileUploadProgress", "mediaConversion",
] as const satisfies ReadonlyArray<keyof CanvasNodeMetadata>;

export function nextCopiedNodeTitle(sourceTitle: string, existingTitles: Iterable<string>) {
    const sourceMatch = sourceTitle.match(COPY_TITLE_SUFFIX);
    const baseTitle = (sourceMatch?.[1] || sourceTitle.replace(/ Copy$/i, "")).trim() || sourceTitle.trim() || "未命名节点";
    let maxCopyIndex = 0;
    for (const title of existingTitles) {
        const match = title.match(COPY_TITLE_SUFFIX);
        if (!match || match[1] !== baseTitle) continue;
        const copyIndex = Number(match[2]);
        if (Number.isSafeInteger(copyIndex)) maxCopyIndex = Math.max(maxCopyIndex, copyIndex);
    }
    return `${baseTitle}_copy${maxCopyIndex + 1}`;
}

function remapReferenceId(nodeId: string | undefined, idMap: ReadonlyMap<string, string>) {
    return nodeId ? idMap.get(nodeId) || nodeId : undefined;
}

function remapOwnedNodeId(nodeId: string | undefined, idMap: ReadonlyMap<string, string>) {
    return nodeId ? idMap.get(nodeId) : undefined;
}

function remapReferenceIds(nodeIds: string[] | undefined, idMap: ReadonlyMap<string, string>) {
    return nodeIds ? Array.from(new Set(nodeIds.map((nodeId) => idMap.get(nodeId) || nodeId))) : undefined;
}

function copyStoryboardRow(row: StoryboardRow, idMap: ReadonlyMap<string, string>): StoryboardRow {
    const imageNodeId = remapOwnedNodeId(row.imageNodeId, idMap);
    const videoNodeId = remapOwnedNodeId(row.videoNodeId, idMap);
    const hasCopiedOutput = Boolean(imageNodeId || videoNodeId);
    return {
        ...row,
        characters: (row.characters || []).map((character) => ({
            ...character,
            characterImageNodeId: remapReferenceId(character.characterImageNodeId, idMap),
        })),
        assetBindings: (row.assetBindings || []).map((binding) => ({ ...binding, nodeId: remapReferenceId(binding.nodeId, idMap)! })),
        imageNodeId,
        videoNodeId,
        status: hasCopiedOutput ? row.status : "idle",
        errorDetails: undefined,
    };
}

/**
 * 副本继承内容和用户引用，但不能继承原节点的任务、批次与结果持久化身份。
 * @param node 原节点，复制过程不会修改它的元数据。
 * @param idMap 本次复制的节点 ID 映射，用于更新副本内部引用。
 * @param options 仅视频参数变体清空旧结果并保留外部参考；普通复制继续继承内容。
 * @returns 可独立生成与保存的副本元数据。
 */
export function isolateCopiedNodeMetadata(node: CanvasNodeData, idMap: ReadonlyMap<string, string>, options: { videoParameterVariant?: boolean } = {}): CanvasNodeMetadata {
    const videoParameterVariant = options.videoParameterVariant && node.type === CanvasNodeType.Video;
    const metadata = resetGenerationTaskMetadata(node.metadata, !videoParameterVariant && node.metadata?.content ? "success" : "idle");
    if (videoParameterVariant) {
        for (const field of VIDEO_VARIANT_RESULT_FIELDS) delete metadata[field];
    }
    // 原节点的提交标记不能证明副本已保存；继承后，普通保存会把新副本误判为未确认结果并排除。
    delete metadata.generationEffectKeys;
    delete metadata.generationBatches;
    delete metadata.batchInputSignature;
    delete metadata.batchResultInputSignature;
    delete metadata.batchRootId;
    delete metadata.batchChildIds;
    delete metadata.batchFailedCount;
    delete metadata.isBatchRoot;
    delete metadata.primaryImageId;
    delete metadata.imageBatchExpanded;
    delete metadata.batchUsesReferenceImages;
    delete metadata.layerDecomposition;
    delete metadata.imageLayerWorkflow;
    delete metadata.experimentalLayerPlan;
    delete metadata.layerExtraction;
    delete metadata.imageLayerMaterials;
    delete metadata.imageLayer;
    delete metadata.imageLayerGroup;
    if (node.metadata?.imageLayerGroup) {
        const layers = node.metadata.imageLayerGroup.layers.flatMap((layer) => {
            const nodeId = idMap.get(layer.nodeId);
            return nodeId ? [{ ...layer, nodeId }] : [];
        });
        if (layers.length === node.metadata.imageLayerGroup.layers.length) {
            metadata.imageLayerGroup = { ...node.metadata.imageLayerGroup, layers, compositeSignature: undefined };
            metadata.isBatchRoot = true;
            metadata.batchChildIds = layers.map((layer) => layer.nodeId);
            metadata.imageBatchExpanded = node.metadata.imageBatchExpanded;
        }
    }
    if (node.metadata?.imageLayer && idMap.has(node.metadata.imageLayer.groupId)) {
        const groupId = idMap.get(node.metadata.imageLayer.groupId)!;
        metadata.imageLayer = { ...node.metadata.imageLayer, groupId };
        metadata.batchRootId = groupId;
    }
    delete metadata.versionOfNodeId;
    delete metadata.versionLabel;
    delete metadata.versionPrimary;

    // 副本从当前媒体重新开始自己的版本历史。
    delete metadata.mediaVersions;
    delete metadata.currentMediaVersionId;
    metadata.copiedFromNodeId = node.id;
    if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
        metadata.generationResultPlacement = "replace-node";
    }
    metadata.frame = node.metadata?.frame ? { ...node.metadata.frame } : undefined;
    const remapReference = videoParameterVariant ? remapReferenceId : remapOwnedNodeId;
    metadata.referenceSetId = remapReference(node.metadata?.referenceSetId, idMap);
    metadata.referenceAssetNodeIds = node.metadata?.referenceAssetNodeIds?.map((nodeId) => remapReference(nodeId, idMap)).filter((nodeId): nodeId is string => Boolean(nodeId));
    metadata.videoStartFrameNodeId = remapReferenceId(node.metadata?.videoStartFrameNodeId, idMap);
    metadata.videoEndFrameNodeId = remapReferenceId(node.metadata?.videoEndFrameNodeId, idMap);
    metadata.previsPreviewNodeId = remapReference(node.metadata?.previsPreviewNodeId, idMap);
    metadata.previsDepthNodeId = remapReference(node.metadata?.previsDepthNodeId, idMap);
    metadata.previsDepthVideoNodeId = remapReference(node.metadata?.previsDepthVideoNodeId, idMap);
    metadata.previsNormalNodeId = remapReference(node.metadata?.previsNormalNodeId, idMap);
    if (videoParameterVariant) metadata.previsClayVideoNodeId = remapReferenceId(node.metadata?.previsClayVideoNodeId, idMap);

    const characterViewNodeIds = node.metadata?.characterViewNodeIds;
    const copiedCharacterViewNodeIds = characterViewNodeIds
        ? {
              front: remapReference(characterViewNodeIds.front, idMap),
              side: remapReference(characterViewNodeIds.side, idMap),
              back: remapReference(characterViewNodeIds.back, idMap),
          }
        : undefined;
    metadata.characterViewNodeIds = copiedCharacterViewNodeIds && Object.values(copiedCharacterViewNodeIds).some(Boolean) ? copiedCharacterViewNodeIds : undefined;
    metadata.emotionEdit = node.metadata?.emotionEdit
        ? {
              ...node.metadata.emotionEdit,
              sourceNodeId: remapReferenceId(node.metadata.emotionEdit.sourceNodeId, idMap)!,
              faceBox: { ...node.metadata.emotionEdit.faceBox },
              editRegion: node.metadata.emotionEdit.editRegion ? { ...node.metadata.emotionEdit.editRegion } : undefined,
          }
        : undefined;
    metadata.storyboard = node.metadata?.storyboard
        ? {
              rows: node.metadata.storyboard.rows.map((row) => copyStoryboardRow(row, idMap)),
              visibleColumns: [...node.metadata.storyboard.visibleColumns],
              referenceNodeIds: remapReferenceIds(node.metadata.storyboard.referenceNodeIds, idMap) || [],
          }
        : undefined;
    metadata.batchTable = node.metadata?.batchTable
        ? {
              ...node.metadata.batchTable,
              referenceColumns: node.metadata.batchTable.referenceColumns?.map((column) => ({ ...column })),
              textColumns: node.metadata.batchTable.textColumns?.map((column) => ({ ...column })),
              referenceColumnInputs: node.metadata.batchTable.referenceColumnInputs
                  ? Object.fromEntries(Object.entries(node.metadata.batchTable.referenceColumnInputs).map(([columnId, ids]) => [columnId, ids.map((nodeId) => idMap.get(nodeId) || nodeId)]))
                  : undefined,
              rows: node.metadata.batchTable.rows.map((row) => ({
                  ...row,
                  // 图片按列定位；空槽与重复引用都不能在复制时去重或移位。
                  inputNodeIds: row.inputNodeIds.map((nodeId) => idMap.get(nodeId) || nodeId),
                  textNodeIds: row.textNodeIds?.map((nodeId) => idMap.get(nodeId) || nodeId),
                  outputNodeId: remapOwnedNodeId(row.outputNodeId, idMap),
                  generatedInputSignature: undefined,
                  cells: row.cells ? { ...row.cells } : undefined,
              })),
              storyboardRows: node.metadata.batchTable.storyboardRows?.map((row) => copyStoryboardRow(row, idMap)),
              storyboardSourceNodeIds: remapReferenceIds(node.metadata.batchTable.storyboardSourceNodeIds, idMap),
          }
        : undefined;
    metadata.batchSourceNodeId = remapOwnedNodeId(node.metadata?.batchSourceNodeId, idMap);
    metadata.batchRowId = metadata.batchSourceNodeId ? node.metadata?.batchRowId : undefined;
    metadata.batchOperation = metadata.batchSourceNodeId ? node.metadata?.batchOperation : undefined;
    metadata.batchInputNodeIds = node.metadata?.batchInputNodeIds?.map((nodeId) => idMap.get(nodeId) || nodeId);
    return metadata;
}
