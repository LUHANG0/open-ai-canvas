import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { App, type FormInstance } from "antd";
import { useBlocker } from "react-router";

import { loadProjectEditorDraft, removeProjectEditorDraft, saveProjectEditorDraft } from "@/services/project-editor-draft";
import type { ProjectShot, ShotRevision } from "@/services/api/projects";

import { shotEditorValuesEqual, workflowShotEditorInitiallyDirty, type ShotEditorValues } from "./workflow-production-types";
import { projectDraftConfirmProps } from "./project-draft-confirm";

type Args = {
    form: FormInstance<ShotEditorValues>;
    projectId: string;
    selectedShot?: ProjectShot;
    revision?: ShotRevision;
    serverValues: ShotEditorValues;
    serverSnapshotKey: string;
    resetPreviewArtifactId: Dispatch<SetStateAction<string>>;
};

type Result = {
    editorDirty: boolean;
    markEditorChanged: () => void;
    reconcileSavedValues: (savedValues: ShotEditorValues) => boolean;
    clearSavedDraftIfUnchanged: (savedValues: ShotEditorValues) => boolean;
    discardCurrentDraft: () => void;
    removeDraft: (shotId: string) => void;
};

export function useWorkflowShotDraft({ form, projectId, selectedShot, revision, serverValues, serverSnapshotKey, resetPreviewArtifactId }: Args): Result {
    const { message, modal } = App.useApp();
    const [editorDirty, setEditorDirty] = useState(false);
    const [draftRevision, setDraftRevision] = useState(0);
    const draftLoadVersionRef = useRef(0);
    const userEditedRef = useRef(false);
    const navigationConfirmOpenRef = useRef(false);
    const draftStorageWarningRef = useRef(false);

    const reportDraftStorageFailure = useCallback(() => {
        if (draftStorageWarningRef.current) return;
        draftStorageWarningRef.current = true;
        message.warning("本机草稿保存失败，请尽快手动保存镜头脚本，离开或刷新前不要关闭页面");
    }, [message]);

    useEffect(() => {
        const loadVersion = ++draftLoadVersionRef.current;
        userEditedRef.current = false;
        form.setFieldsValue(serverValues);
        resetPreviewArtifactId("");
        setEditorDirty(workflowShotEditorInitiallyDirty(Boolean(selectedShot), revision?.videoPrompt, serverValues.videoPrompt));
        if (!selectedShot) return;
        void loadProjectEditorDraft<{ values: ShotEditorValues }>("shot", projectId, selectedShot.id).then((draft) => {
            if (!draft || draftLoadVersionRef.current !== loadVersion || userEditedRef.current) return;
            const values = draft.payload?.values;
            if (!values || typeof values !== "object" || shotEditorValuesEqual(values, serverValues)) {
                if (values && shotEditorValuesEqual(values, serverValues)) void removeProjectEditorDraft("shot", projectId, selectedShot.id).catch(reportDraftStorageFailure);
                return;
            }
            form.setFieldsValue(values);
            setEditorDirty(true);
            message.info(draft.sourceUpdatedAt === (revision?.createdAt || selectedShot.updatedAt) ? "已恢复本机未保存的镜头草稿" : "已恢复本机镜头草稿；服务端版本已变化，请核对后再保存");
        }).catch(reportDraftStorageFailure);
        // 按字段内容快照而非对象身份重载，避免等值轮询刷新覆盖未保存输入。
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [form, message, projectId, reportDraftStorageFailure, resetPreviewArtifactId, revision?.id, selectedShot?.id, serverSnapshotKey]);

    useEffect(() => {
        if (!editorDirty || !selectedShot || !draftRevision) return;
        const timer = window.setTimeout(() => {
            void saveProjectEditorDraft({
                kind: "shot",
                projectId,
                entityId: selectedShot.id,
                sourceUpdatedAt: revision?.createdAt || selectedShot.updatedAt,
                payload: { values: form.getFieldsValue(true) as ShotEditorValues },
            }).catch(reportDraftStorageFailure);
        }, 400);
        return () => window.clearTimeout(timer);
    }, [draftRevision, editorDirty, form, projectId, reportDraftStorageFailure, revision?.createdAt, selectedShot]);

    const navigationBlocker = useBlocker(editorDirty);

    useEffect(() => {
        const beforeUnload = (event: BeforeUnloadEvent) => {
            if (!editorDirty) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", beforeUnload);
        return () => window.removeEventListener("beforeunload", beforeUnload);
    }, [editorDirty]);

    useEffect(() => {
        if (navigationBlocker.state !== "blocked" || navigationConfirmOpenRef.current) return;
        navigationConfirmOpenRef.current = true;
        modal.confirm({
            title: "离开未保存的镜头脚本？",
            ...projectDraftConfirmProps,
            content: "当前修改已暂存在本机，返回这个镜头时会自动恢复；服务端版本只有点击保存或提交生成后才会更新。",
            okText: "保留草稿并离开",
            cancelText: "继续编辑",
            onOk: () => {
                navigationConfirmOpenRef.current = false;
                navigationBlocker.proceed();
            },
            onCancel: () => {
                navigationConfirmOpenRef.current = false;
                navigationBlocker.reset();
            },
        });
    }, [modal, navigationBlocker]);

    const markEditorChanged = useCallback(() => {
        userEditedRef.current = true;
        setEditorDirty(true);
        setDraftRevision((value) => value + 1);
    }, []);

    const removeDraft = useCallback((shotId: string) => {
        void removeProjectEditorDraft("shot", projectId, shotId).catch(reportDraftStorageFailure);
    }, [projectId, reportDraftStorageFailure]);

    const clearSavedDraftIfUnchanged = useCallback((savedValues: ShotEditorValues) => {
        if (!selectedShot || !shotEditorValuesEqual(form.getFieldsValue(true) as ShotEditorValues, savedValues)) return false;
        userEditedRef.current = false;
        setEditorDirty(false);
        removeDraft(selectedShot.id);
        return true;
    }, [form, removeDraft, selectedShot]);

    const reconcileSavedValues = useCallback((savedValues: ShotEditorValues) => {
        const currentValues = form.getFieldsValue(true) as ShotEditorValues;
        const unchangedSinceSubmit = shotEditorValuesEqual(currentValues, savedValues);
        if (unchangedSinceSubmit && selectedShot) {
            userEditedRef.current = false;
            setEditorDirty(false);
            removeDraft(selectedShot.id);
        } else if (selectedShot) {
            void saveProjectEditorDraft({
                kind: "shot",
                projectId,
                entityId: selectedShot.id,
                sourceUpdatedAt: new Date().toISOString(),
                payload: { values: currentValues },
            }).catch(reportDraftStorageFailure);
        }
        return unchangedSinceSubmit;
    }, [form, projectId, removeDraft, reportDraftStorageFailure, selectedShot]);

    const discardCurrentDraft = useCallback(() => {
        if (selectedShot) removeDraft(selectedShot.id);
        userEditedRef.current = false;
        setEditorDirty(false);
    }, [removeDraft, selectedShot]);

    return { editorDirty, markEditorChanged, reconcileSavedValues, clearSavedDraftIfUnchanged, discardCurrentDraft, removeDraft };
}
