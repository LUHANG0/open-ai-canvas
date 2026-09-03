import type { Asset } from "@/stores/use-asset-store";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import type { CreationConversation } from "@/pages/create/creation-types";
import { apiClient, request } from "@/services/api/request";

const api = apiClient;

export type RemoteUserDataSummary = {
    id: string;
    kind?: string;
    title: string;
    createdAt: string;
    updatedAt: string;
};

export type RemoteUserDataSnapshot = {
    assets: Asset[];
    projects: CanvasProject[];
};

export type RemoteCreationConversationRecord = {
    conversation: CreationConversation;
    revision: number;
};

export function getRemoteUserDataSnapshot() {
    return request<RemoteUserDataSnapshot>(api.get("/user-data/snapshot"));
}

export function listRemoteAssets() {
    return request<{ assets: RemoteUserDataSummary[] }>(api.get("/assets"));
}

export function getRemoteAsset(id: string) {
    return request<{ asset: Asset }>(api.get(`/assets/${encodeURIComponent(id)}`));
}

export function upsertRemoteAsset(asset: Asset) {
    return request<{ asset: RemoteUserDataSummary }>(api.put(`/assets/${encodeURIComponent(asset.id)}`, { asset }));
}

export function deleteRemoteAsset(id: string) {
    return request<{ id: string }>(api.delete(`/assets/${encodeURIComponent(id)}`));
}

export function listRemoteCanvasProjects() {
    return request<{ projects: RemoteUserDataSummary[] }>(api.get("/canvas-projects"));
}

export function getRemoteCanvasProject(id: string) {
    return request<{ project: CanvasProject }>(api.get(`/canvas-projects/${encodeURIComponent(id)}`));
}

export function upsertRemoteCanvasProject(project: CanvasProject) {
    return request<{ project: RemoteUserDataSummary }>(api.put(`/canvas-projects/${encodeURIComponent(project.id)}`, { project }));
}

export function deleteRemoteCanvasProject(id: string) {
    return request<{ id: string }>(api.delete(`/canvas-projects/${encodeURIComponent(id)}`));
}

export function listRemoteCreationConversations() {
    return request<{ conversations: RemoteCreationConversationRecord[] }>(api.get("/creation-conversations", { timeout: 10_000 }));
}

export function upsertRemoteCreationConversation(conversation: CreationConversation, expectedRevision: number) {
    return request<{ record: RemoteCreationConversationRecord }>(api.put(`/creation-conversations/${encodeURIComponent(conversation.id)}`, { conversation, expectedRevision }, { timeout: 10_000 }));
}

export function deleteRemoteCreationConversation(id: string, revision: number) {
    return request<{ id: string }>(api.delete(`/creation-conversations/${encodeURIComponent(id)}`, { params: { revision }, timeout: 10_000 }));
}
