import { App, Button, Input, Skeleton, Tabs } from "antd";
import { Select } from "@/components/ui/base/select";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { StatusBadge } from "@/components/ui/base/badges";
import { Callout } from "@/components/ui/product/callout";
import { EmptyState } from "@/components/ui/product/empty-state";
import { RotateCcw, Save, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { PromptCodeEditor } from "@/components/prompt/prompt-code-editor";
import {
    listUserPromptPreferences,
    resetUserPromptCustomization,
    updateUserPromptCustomization,
    type UserPromptCustomization,
    type UserPromptPreference,
} from "@/services/api/auth";

type CustomizationMode = UserPromptCustomization["mode"];

const modeOptions = [
    { label: "跟随平台", value: "inherit" },
    { label: "追加要求", value: "append" },
    { label: "高级改写", value: "rewrite" },
];

export function PromptPreferencesPane() {
    const { message, modal } = App.useApp();
    const [preferences, setPreferences] = useState<UserPromptPreference[]>([]);
    const [selectedOperation, setSelectedOperation] = useState("");
    const [mode, setMode] = useState<CustomizationMode>("inherit");
    const [appendContent, setAppendContent] = useState("");
    const [rewriteContent, setRewriteContent] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState("");
    const requestIdRef = useRef(0);

    const reload = async (preferredOperation?: string) => {
        const reqId = ++requestIdRef.current;
        setLoading(true);
        setLoadError("");
        try {
            const result = await listUserPromptPreferences();
            if (reqId !== requestIdRef.current) return;
            setPreferences(result.preferences);
            setSelectedOperation((current) => preferredOperation || current || result.preferences[0]?.definition.operation || "");
        } catch (error) {
            if (reqId !== requestIdRef.current) return;
            const msg = error instanceof Error ? error.message : "读取提示词偏好失败";
            setLoadError(msg);
            message.error(msg);
        } finally {
            if (reqId === requestIdRef.current) {
                setLoading(false);
            }
        }
    };

    useEffect(() => { void reload(); }, []);

    const selected = useMemo(() => preferences.find((item) => item.definition.operation === selectedOperation), [preferences, selectedOperation]);
    const savedMode = selected?.customization?.mode || "inherit";
    const savedAppendContent = savedMode === "append" ? selected?.customization?.content || "" : "";
    const savedRewriteContent = savedMode === "rewrite" ? selected?.customization?.content || "" : selected?.template?.content || "";
    const activeContent = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
    const savedActiveContent = savedMode === "append" ? savedAppendContent : savedMode === "rewrite" ? savedRewriteContent : "";
    const dirty = mode !== savedMode || activeContent !== savedActiveContent;

    const restoreDraft = (preference = selected) => {
        const customization = preference?.customization;
        setMode(customization?.mode || "inherit");
        setAppendContent(customization?.mode === "append" ? customization.content : "");
        setRewriteContent(customization?.mode === "rewrite" ? customization.content : preference?.template?.content || "");
    };

    useEffect(() => { restoreDraft(selected); }, [selected]);

    useEffect(() => {
        if (!dirty) return undefined;
        const preventUnload = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", preventUnload);
        return () => window.removeEventListener("beforeunload", preventUnload);
    }, [dirty]);

    const selectOperation = (operation: string) => {
        if (operation === selectedOperation) return;
        if (!dirty) {
            setSelectedOperation(operation);
            return;
        }
        modal.confirm({
            rootClassName: "settings-workspace-overlay",
            title: "切换模板并放弃修改？",
            content: "当前模板还有未保存内容。切换后这些修改将丢失。",
            okText: "放弃并切换",
            cancelText: "继续编辑",
            okButtonProps: { danger: true },
            onOk: () => setSelectedOperation(operation),
        });
    };

    const save = async () => {
        if (!selected) return;
        const content = mode === "append" ? appendContent : mode === "rewrite" ? rewriteContent : "";
        if (mode !== "inherit" && !content.trim()) {
            message.warning("请填写个人提示词内容");
            return;
        }
        setSaving(true);
        try {
            await updateUserPromptCustomization(selected.definition.operation, { mode, content });
            await reload(selected.definition.operation);
            message.success("提示词偏好已保存");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存提示词偏好失败");
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        if (!selected) return;
        modal.confirm({
            rootClassName: "settings-workspace-overlay",
            title: "恢复平台模板？",
            content: `将删除“${selected.definition.label}”的个人定制，后续自动跟随平台版本。`,
            okText: "恢复平台模板",
            cancelText: "取消",
            onOk: async () => {
                try {
                    await resetUserPromptCustomization(selected.definition.operation);
                    await reload(selected.definition.operation);
                    message.success("已恢复平台模板");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "恢复平台模板失败");
                }
            },
        });
    };

    if (loading && preferences.length === 0) return <div className="settings-prompt-preferences" role="status" aria-label="正在加载提示词偏好" aria-busy="true"><Skeleton active paragraph={{ rows: 10 }} /></div>;
    if (loadError && preferences.length === 0) {
        return (
            <div className="settings-prompt-preferences flex flex-col items-center justify-center gap-3 py-16">
                <Callout tone="error" role="alert" title="加载提示词偏好失败">{loadError}</Callout>
                <Button icon={<RotateCcw className="size-4" />} onClick={() => void reload()}>重试</Button>
            </div>
        );
    }
    if (!selected) return <EmptyState title="暂无可配置的提示词模板" />;

    const templateContent = selected.template?.content || "当前没有启用的平台模板";
    const previewCreative = mode === "inherit" ? templateContent : mode === "append" ? `${templateContent}\n\n【用户个性化创作要求】\n${appendContent}` : rewriteContent;
    const outputLabel = selected.definition.outputType === "json" ? selected.definition.schemaKey || "JSON" : "文本";

    return (
        <div className="settings-prompt-preferences flex min-h-full min-w-0 flex-col" aria-busy={loading || saving}>
            <header className="shrink-0 pb-4">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <label htmlFor="settings-prompt-template" className="mb-2 block text-xs font-medium text-[var(--user-ink-muted)]">提示词模板</label>
                        <Select
                            id="settings-prompt-template"
                            ariaLabel="提示词模板"
                            className="w-full max-w-md"
                            value={selectedOperation}
                            onChange={selectOperation}
                            options={preferences.map((item) => ({
                                value: item.definition.operation,
                                label: `${item.definition.category} · ${item.definition.label}${item.customization && item.customization.mode !== "inherit" ? " · 已定制" : ""}`,
                            }))}
                        />
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button icon={<Undo2 className="size-4" />} disabled={!dirty || saving} onClick={() => restoreDraft()}>撤销修改</Button>
                        <Button icon={<RotateCcw className="size-4" />} disabled={!selected.customization || saving} onClick={reset}>恢复平台</Button>
                        <Button type="primary" icon={<Save className="size-4" />} loading={saving} disabled={!dirty} onClick={() => void save()}>保存更改</Button>
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-base font-semibold">{selected.definition.label}</h2>
                            <StatusBadge variant="filled" tone="neutral" label={`平台 v${selected.template?.version || "--"}`} />
                            <StatusBadge variant="filled" tone="neutral" label={outputLabel} />
                            {dirty ? <span role="status"><StatusBadge variant="filled" tone="warning" label="未保存" /></span> : null}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-[var(--user-ink-muted)]">{selected.definition.description}</p>
                    </div>
                    <SegmentedControl indicator="static" ariaLabel="提示词定制方式" value={mode} options={modeOptions} onChange={(value) => setMode(value as CustomizationMode)} />
                </div>
            </header>

            {selected.outdated ? <Callout className="mt-4" tone="warning" title="平台模板已更新">当前高级改写基于旧版本。可以保留现有改写，或恢复平台后再基于新版本调整。</Callout> : null}

            <div className="grid min-h-0 flex-1 gap-4 pt-4 lg:grid-cols-3">
                <section className="flex min-h-0 min-w-0 flex-col lg:col-span-2">
                    <div className="mb-3 shrink-0">
                        <h3 id="settings-prompt-editor-title" className="text-sm font-semibold">{mode === "inherit" ? "当前平台模板" : mode === "append" ? "追加个人要求" : "改写创作策略"}</h3>
                        <p id="settings-prompt-editor-description" className="mt-1 text-xs leading-5 text-[var(--user-ink-muted)]">
                            {mode === "inherit" ? "平台升级后自动使用新版本。" : mode === "append" ? "内容追加在平台策略之后，仍会自动继承平台升级。" : "只替换创作策略；动态项目数据和输出契约仍由服务端强制注入。"}
                        </p>
                    </div>
                    {mode === "append" ? (
                        <Input.TextArea
                            aria-labelledby="settings-prompt-editor-title"
                            aria-describedby="settings-prompt-editor-description"
                            className="min-h-96 resize-none"
                            value={appendContent}
                            maxLength={12000}
                            showCount
                            placeholder="例如：仙侠项目采用明亮、宏大、高清的休闲剧质感；避免阴森恐怖色调，人物表演自然、轻松。"
                            onChange={(event) => setAppendContent(event.target.value)}
                        />
                    ) : (
                        <div className="min-h-96 flex-1 overflow-hidden rounded-md bg-surface-active">
                            <PromptCodeEditor
                                value={mode === "inherit" ? templateContent : rewriteContent}
                                readOnly={mode === "inherit"}
                                ariaLabel={mode === "inherit" ? "平台提示词模板" : "个人提示词改写"}
                                onChange={mode === "rewrite" ? setRewriteContent : undefined}
                            />
                        </div>
                    )}
                </section>

                <aside className="min-h-0 min-w-0 pt-4 lg:pl-6 lg:pt-0" aria-label="提示词参考">
                    <Tabs
                        size="small"
                        animated={{ inkBar: false, tabPane: false }}
                        items={[
                            {
                                key: "baseline",
                                label: "平台基线",
                                children: <pre className="settings-prompt-scroll thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[var(--user-ink-muted)]" tabIndex={0} role="region" aria-label="平台基线内容">{templateContent}</pre>,
                            },
                            {
                                key: "contract",
                                label: "输出契约",
                                children: <div><div className="mb-3 flex items-center gap-2 text-xs font-medium"><ShieldCheck className="size-4" aria-hidden="true" />服务端只读</div><pre className="settings-prompt-scroll thin-scrollbar max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[var(--user-ink-muted)]" tabIndex={0} role="region" aria-label="输出契约内容">{selected.definition.outputContract}</pre></div>,
                            },
                            {
                                key: "preview",
                                label: "最终结构",
                                children: <div className="space-y-5 text-xs leading-6"><section><div className="mb-2 font-medium text-foreground">创作策略</div><pre className="settings-prompt-scroll thin-scrollbar max-h-64 overflow-auto whitespace-pre-wrap text-[var(--user-ink-muted)]" tabIndex={0} role="region" aria-label="最终创作策略">{previewCreative || "尚未填写"}</pre></section><section><div className="mb-2 font-medium text-foreground">运行时强制追加</div><p className="text-[var(--user-ink-muted)]">当前剧情、项目画风、当前角色版本、画布资产与受保护输出契约。</p></section></div>,
                            },
                        ]}
                    />
                </aside>
            </div>
        </div>
    );
}
