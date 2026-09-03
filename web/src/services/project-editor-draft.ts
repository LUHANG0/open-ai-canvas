import { localForageStorageForScope } from "@/lib/localforage-storage";
import { getActiveUserScope } from "@/lib/user-scope";

export type ProjectEditorDraftKind = "chapter" | "shot";

export type ProjectEditorDraft<T> = {
    version: 1;
    kind: ProjectEditorDraftKind;
    projectId: string;
    entityId: string;
    sourceUpdatedAt: string;
    savedAt: string;
    payload: T;
};

const PROJECT_EDITOR_DRAFT_PREFIX = "project-editor-draft-v1";

export function projectEditorDraftKey(kind: ProjectEditorDraftKind, projectId: string, entityId: string) {
    return `${PROJECT_EDITOR_DRAFT_PREFIX}:${kind}:${projectId}:${entityId}`;
}

export async function loadProjectEditorDraft<T>(kind: ProjectEditorDraftKind, projectId: string, entityId: string) {
    const storage = localForageStorageForScope(getActiveUserScope());
    const raw = await storage.getItem(projectEditorDraftKey(kind, projectId, entityId));
    return raw ? parseProjectEditorDraft<T>(raw, { kind, projectId, entityId }) : null;
}

export async function saveProjectEditorDraft<T>(input: Omit<ProjectEditorDraft<T>, "version" | "savedAt">) {
    const storage = localForageStorageForScope(getActiveUserScope());
    const draft: ProjectEditorDraft<T> = { ...input, version: 1, savedAt: new Date().toISOString() };
    await storage.setItem(projectEditorDraftKey(input.kind, input.projectId, input.entityId), JSON.stringify(draft));
    return draft;
}

export async function removeProjectEditorDraft(kind: ProjectEditorDraftKind, projectId: string, entityId: string) {
    const storage = localForageStorageForScope(getActiveUserScope());
    await storage.removeItem(projectEditorDraftKey(kind, projectId, entityId));
}

export function parseProjectEditorDraft<T>(raw: string, expected: { kind: ProjectEditorDraftKind; projectId: string; entityId: string }): ProjectEditorDraft<T> | null {
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object" || Array.isArray(value)) return null;
        const draft = value as Partial<ProjectEditorDraft<T>>;
        if (
            draft.version !== 1
            || draft.kind !== expected.kind
            || draft.projectId !== expected.projectId
            || draft.entityId !== expected.entityId
            || typeof draft.sourceUpdatedAt !== "string"
            || typeof draft.savedAt !== "string"
            || !("payload" in draft)
        ) return null;
        return draft as ProjectEditorDraft<T>;
    } catch {
        return null;
    }
}
