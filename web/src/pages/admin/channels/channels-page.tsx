import { Alert, App, Button, Form, Input, InputNumber, Modal, Select, Switch } from "antd";
import type { FormInstance } from "antd";
import type { ColumnsType } from "antd/es/table";
import { Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";

import { ChannelHeadersEditor, validateChannelHeaders } from "@/components/channel-headers-editor";
import { PaginationBar } from "@/components/layout/workspace-page";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { desktopLocalChannelFormState, desktopLocalChannelPayloadValue, DESKTOP_LOCAL_CHANNEL_EXAMPLE_BASE_URL } from "@/lib/desktop-local-channel";
import { refreshSystemChannels } from "@/lib/user-session";
import { createAdminChannel, deleteAdminChannel, listAdminChannels, updateAdminChannel } from "@/services/api/auth";
import { type ChannelHeader, type ModelChannel } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { useAdminContext } from "../admin-context";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminBatchBar, AdminDataTable, AdminRowActions, AdminStatusBadge, AdminTableEmpty, configuredSecretText } from "../components/admin-ui";
import { ChannelModelManager } from "../components/channel-model-manager";
import "./channels-page.css";

type ChannelFormValues = { name: string; baseUrl: string; allowLocalChannel?: boolean; apiKey?: string; secretKey?: string; headers?: ChannelHeader[]; useGlobalConcurrency?: boolean; concurrencyLimit?: number; enabled?: boolean };

export function adminLocalChannelFormOwner(desktopLocalChannelsEnabled: boolean, hostname: string, requestedAllowLocalChannel?: boolean) {
    const state = desktopLocalChannelFormState(desktopLocalChannelsEnabled, hostname, requestedAllowLocalChannel);
    return { ...state, payloadValue: desktopLocalChannelPayloadValue(desktopLocalChannelsEnabled, hostname, requestedAllowLocalChannel) };
}

export function AdminLocalChannelSwitch({ visible, checked, onChange }: { visible: boolean; checked: boolean; onChange: (checked: boolean) => void }) {
    if (!visible) return null;
    return (
        <Form.Item name="allowLocalChannel" label="允许本机渠道" valuePropName="checked" extra={`仅放行精确 localhost 或 127.0.0.1；示例：${DESKTOP_LOCAL_CHANNEL_EXAMPLE_BASE_URL}`}>
            <Switch checked={checked} onChange={onChange} />
        </Form.Item>
    );
}

export function AdminLocalChannelFields({ visible, checked, form }: { visible: boolean; checked: boolean; form: Pick<FormInstance<ChannelFormValues>, "setFieldValue"> }) {
    return (
        <>
            <Form.Item name="baseUrl" label="Base URL" rules={[{ required: true, message: "请填写 Base URL" }]}>
                <Input placeholder={checked ? DESKTOP_LOCAL_CHANNEL_EXAMPLE_BASE_URL : "填写渠道 Base URL"} />
            </Form.Item>
            <AdminLocalChannelSwitch visible={visible} checked={checked} onChange={(value) => form.setFieldValue("allowLocalChannel", value)} />
        </>
    );
}

export function adminChannelSavePayload(values: ChannelFormValues, desktopLocalChannelsEnabled: boolean, hostname: string) {
    return {
        name: values.name.trim(),
        baseUrl: values.baseUrl.trim(),
        allowLocalChannel: adminLocalChannelFormOwner(desktopLocalChannelsEnabled, hostname, values.allowLocalChannel).payloadValue,
        apiKey: values.apiKey?.trim() || "",
        secretKey: values.secretKey?.trim() || "",
        headers: values.headers || [],
        useGlobalConcurrency: values.useGlobalConcurrency !== false,
        concurrencyLimit: values.useGlobalConcurrency === false ? values.concurrencyLimit : undefined,
        enabled: values.enabled !== false,
    };
}

export default function ChannelsPage() {
    const { message, modal } = App.useApp();
    const { reloadReferences } = useAdminContext();
    const [searchParams, setSearchParams] = useSearchParams();
    const keyword = searchParams.get("filter") || "";
    const status = normalizeStatus(searchParams.get("status"));
    const page = positiveInt(searchParams.get("page"), 1);
    const pageSize = normalizePageSize(searchParams.get("pageSize"));
    const debouncedKeyword = useDebouncedValue(keyword);
    const [channels, setChannels] = useState<ModelChannel[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<ModelChannel | null>(null);
    const [saving, setSaving] = useState(false);
    const [readError, setReadError] = useState("");
    const [saveError, setSaveError] = useState("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const savingRef = useRef(false);
    const formSnapshot = useRef("");
    const mutationIds = useRef(new Set<string>());
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [batchSaving, setBatchSaving] = useState(false);
    const [batchError, setBatchError] = useState("");
    const batchRef = useRef(false);
    const [managingChannel, setManagingChannel] = useState<ModelChannel | null>(null);
    const requestSequence = useRef(0);
    const [form] = Form.useForm<ChannelFormValues>();
    const useGlobalConcurrency = Form.useWatch("useGlobalConcurrency", form) !== false;
    const requestedAllowLocalChannel = Form.useWatch("allowLocalChannel", form) === true;
    const desktopLocalChannelsEnabled = useUserStore((state) => state.features.desktopLocalChannelsEnabled);
    const desktopLocalChannelHostname = typeof window === "undefined" ? "" : window.location.hostname;
    const desktopLocalChannelControl = adminLocalChannelFormOwner(desktopLocalChannelsEnabled, desktopLocalChannelHostname, requestedAllowLocalChannel);
    const allowLocalChannel = desktopLocalChannelControl.checked;
    const showDesktopLocalChannelControl = desktopLocalChannelControl.visible;
    const hasFilters = Boolean(keyword || status !== "all");

    const updateUrl = (patch: Record<string, string | number>, replace = false) => {
        if (batchRef.current) return;
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => {
            const isDefault = (key === "filter" && value === "") || (key === "status" && value === "all") || (key === "page" && value === 1) || (key === "pageSize" && value === 20);
            if (isDefault) next.delete(key);
            else next.set(key, String(value));
        });
        setSearchParams(next, { replace });
    };

    const reload = async () => {
        const sequence = ++requestSequence.current;
        setLoading(true);
        setReadError("");
        setChannels([]);
        try {
            const result = await listAdminChannels({ keyword: debouncedKeyword || undefined, status: status === "all" ? undefined : status, page, limit: pageSize });
            if (sequence !== requestSequence.current) return;
            setChannels(result.channels);
            setSelectedIds((current) => current.filter((id) => result.channels.some((channel) => channel.id === id)));
            setTotal(result.total);
            if (result.channels.length === 0 && page > 1) updateUrl({ page: 1 }, true);
        } catch (error) {
            if (sequence === requestSequence.current) setReadError(error instanceof Error ? error.message : "读取渠道列表失败");
        } finally {
            if (sequence === requestSequence.current) setLoading(false);
        }
    };

    useEffect(() => {
        setSelectedIds([]);
        void reload();
        return () => {
            requestSequence.current++;
        };
    }, [debouncedKeyword, status, page, pageSize]);

    const syncChannels = async () => {
        try {
            await reloadReferences();
            await refreshSystemChannels();
        } catch (error) {
            message.warning(error instanceof Error ? `后台已保存，但配置同步失败：${error.message}` : "后台已保存，但配置同步失败，请稍后重新打开配置");
        }
    };

    const openDrawer = (channel?: ModelChannel) => {
        if (batchRef.current) return;
        setSaveError("");
        setEditingChannel(channel || null);
        form.resetFields();
        form.setFieldsValue(
            channel
                ? {
                      name: channel.name,
                      baseUrl: channel.baseUrl,
                      allowLocalChannel: adminLocalChannelFormOwner(desktopLocalChannelsEnabled, desktopLocalChannelHostname, channel.allowLocalChannel).checked,
                      apiKey: "",
                      secretKey: "",
                      headers: channel.headers || [],
                      useGlobalConcurrency: !channel.concurrencyLimit,
                      concurrencyLimit: channel.concurrencyLimit || undefined,
                      enabled: channel.enabled !== false,
                  }
                : { name: "", baseUrl: "", allowLocalChannel: false, apiKey: "", secretKey: "", headers: [], useGlobalConcurrency: true, concurrencyLimit: undefined, enabled: true },
        );
        formSnapshot.current = JSON.stringify(form.getFieldsValue(true));
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        if (saving) return;
        if (JSON.stringify(form.getFieldsValue(true)) === formSnapshot.current) {
            setDrawerOpen(false);
            return;
        }
        setConfirmOpen(true);
        modal.confirm({ title: "放弃渠道修改？", content: "尚未保存的连接信息将丢失。", okText: "放弃修改", cancelText: "继续编辑", okButtonProps: { danger: true }, onOk: () => setDrawerOpen(false), afterClose: () => setConfirmOpen(false) });
    };

    const save = async () => {
        if (savingRef.current) return;
        savingRef.current = true;
        setSaving(true);
        setSaveError("");
        try {
            const values = await form.validateFields();
            const headerError = validateChannelHeaders(values.headers);
            if (headerError) {
                message.error(headerError);
                return;
            }
            if (!editingChannel && !values.apiKey?.trim()) {
                message.error("请填写 API Key 或 Access Key");
                return;
            }
            const payload = adminChannelSavePayload(values, desktopLocalChannelsEnabled, desktopLocalChannelHostname);
            await (editingChannel ? updateAdminChannel(editingChannel.id, payload) : createAdminChannel(payload));
            await syncChannels();
            setDrawerOpen(false);
            form.resetFields();
            await reload();
            message.success(editingChannel ? "系统渠道已更新" : "系统渠道已创建");
        } catch (error) {
            if (!(error && typeof error === "object" && "errorFields" in error)) setSaveError(error instanceof Error ? error.message : "保存系统渠道失败");
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const toggleChannel = async (channel: ModelChannel) => {
        if (batchRef.current) return;
        if (mutationIds.current.has(channel.id)) return;
        mutationIds.current.add(channel.id);
        try {
            await updateAdminChannel(channel.id, { enabled: channel.enabled === false });
            await syncChannels();
            await reload();
            message.success(channel.enabled === false ? "系统渠道已启用" : "系统渠道已停用");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更新系统渠道失败");
        } finally {
            mutationIds.current.delete(channel.id);
        }
    };

    const changeSelectedStatus = async (enabled: boolean) => {
        if (batchRef.current) return;
        batchRef.current = true;
        setBatchSaving(true);
        setBatchError("");
        const ids = [...selectedIds];
        try {
            const results = await Promise.allSettled(ids.map((id) => updateAdminChannel(id, { enabled })));
            const failedIds = ids.filter((_, index) => results[index].status === "rejected");
            const succeeded = ids.length - failedIds.length;
            setSelectedIds(failedIds);
            if (succeeded) message.success(`已${enabled ? "启用" : "停用"} ${succeeded} 个渠道`);
            if (failedIds.length) setBatchError(`${failedIds.length} 个渠道未能更新，已保留选择，可重试；其他渠道的修改已保存。`);
            await syncChannels();
            await reload();
        } finally {
            batchRef.current = false;
            setBatchSaving(false);
        }
    };

    const removeChannel = async (channel: ModelChannel) => {
        if (batchRef.current) return;
        if (mutationIds.current.has(channel.id)) return;
        mutationIds.current.add(channel.id);
        try {
            await deleteAdminChannel(channel.id);
            await syncChannels();
            await reload();
            message.success("系统渠道已删除");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "删除系统渠道失败");
        } finally {
            mutationIds.current.delete(channel.id);
        }
    };

    const columns: ColumnsType<ModelChannel> = [
        {
            title: "渠道",
            dataIndex: "name",
            render: (_, channel) => (
                <div>
                    <div className="font-medium">{channel.name}</div>
                    <div className="admin-monospace max-w-lg truncate text-foreground/45">{channel.baseUrl}</div>
                </div>
            ),
        },
        { title: "模型", dataIndex: "models", width: 100, align: "center", render: (models: string[]) => `${models?.length || 0} 个` },
        { title: "最大并发", dataIndex: "concurrencyLimit", width: 120, align: "center", render: (value: number) => (value > 0 ? value : <span className="text-foreground/45">跟随系统</span>) },
        { title: "凭证", width: 130, align: "center", render: (_, channel) => <AdminStatusBadge label={channel.hasApiKey ? (channel.hasSecretKey ? "AK/SK 已配置" : "API Key 已配置") : "未配置"} tone={channel.hasApiKey ? "success" : "neutral"} /> },
        { title: "状态", dataIndex: "enabled", width: 100, align: "center", render: (enabled) => <AdminStatusBadge label={enabled !== false ? "已启用" : "已停用"} tone={enabled !== false ? "success" : "neutral"} /> },
        {
            title: "操作",
            width: 250,
            align: "center",
            render: (_, channel) => (
                <AdminRowActions
                    primary={{ label: "模型管理", disabled: batchSaving, onClick: () => setManagingChannel(channel) }}
                    actions={[
                        { key: "edit", label: "编辑", icon: <Pencil className="size-3.5" />, onClick: () => openDrawer(channel) },
                        {
                            key: "toggle",
                            label: channel.enabled !== false ? "停用渠道" : "启用渠道",
                            icon: <Power className="size-3.5" />,
                            danger: channel.enabled !== false,
                            confirm: {
                                title: channel.enabled !== false ? "停用这个系统渠道？" : "启用这个系统渠道？",
                                description: channel.enabled !== false ? "停用后新任务不会再使用该渠道，但仍会保留在列表中，可随时重新启用。" : "启用后，配置完整的模型会重新进入系统可用模型集合。",
                                okText: channel.enabled !== false ? "确认停用" : "确认启用",
                            },
                            onClick: () => toggleChannel(channel),
                        },
                        {
                            key: "delete",
                            label: "删除渠道",
                            icon: <Trash2 className="size-3.5" />,
                            danger: true,
                            confirm: { title: "删除这个系统渠道？", description: "删除后渠道及所属模型将不再显示，API Key 会被清除，历史账单和调用记录继续保留。该操作不能在页面恢复。", okText: "确认删除" },
                            onClick: () => removeChannel(channel),
                        },
                    ]}
                />
            ),
        },
    ];

    if (managingChannel) {
        return (
            <ChannelModelManager
                channel={managingChannel}
                onClose={() => setManagingChannel(null)}
                onChanged={async () => {
                    await syncChannels();
                    await reload();
                }}
            />
        );
    }

    return (
        <AdminPageFrame
            title="系统渠道"
            description="管理供应渠道、凭证与模型价格；前台展示范围在前台模型目录配置。"
            actions={
                <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openDrawer()}>
                    新增系统渠道
                </Button>
            }
        >
            {readError ? <Alert type="error" showIcon title="渠道列表读取失败" description={readError} action={<Button onClick={() => void reload()}>重试</Button>} /> : null}
            {batchError ? <Alert type="error" showIcon title="部分渠道未更新" description={batchError} /> : null}
            <AdminDataTable
                batchActions={
                    <AdminBatchBar
                        count={selectedIds.length}
                        onClear={() => {
                            if (!batchSaving) setSelectedIds([]);
                        }}
                    >
                        <Button
                            disabled={batchSaving}
                            onClick={() => modal.confirm({ title: `启用选中的 ${selectedIds.length} 个渠道？`, content: "配置完整的模型将恢复供新任务使用。", okText: "确认启用", cancelText: "取消", onOk: () => changeSelectedStatus(true) })}
                        >
                            批量启用
                        </Button>
                        <Button
                            danger
                            disabled={batchSaving}
                            onClick={() =>
                                modal.confirm({
                                    title: `停用选中的 ${selectedIds.length} 个渠道？`,
                                    content: "停用后新任务不再使用这些渠道，已有配置继续保留。",
                                    okText: "确认停用",
                                    cancelText: "取消",
                                    okButtonProps: { danger: true },
                                    onOk: () => changeSelectedStatus(false),
                                })
                            }
                        >
                            批量停用
                        </Button>
                    </AdminBatchBar>
                }
                toolbar={
                    <Input
                        id="admin-channel-search"
                        aria-label="搜索系统渠道"
                        autoComplete="off"
                        allowClear
                        className="app-list-search"
                        prefix={<Search className="size-4 text-foreground/40" />}
                        value={keyword}
                        placeholder="搜索渠道名称或地址"
                        onChange={(event) => updateUrl({ filter: event.target.value, page: 1 }, true)}
                    />
                }
                toolbarFilters={
                    <Select
                        aria-label="筛选渠道状态"
                        className="w-32"
                        value={status}
                        onChange={(value) => updateUrl({ status: value, page: 1 })}
                        options={[
                            { label: "全部状态", value: "all" },
                            { label: "已启用", value: "enabled" },
                            { label: "已停用", value: "disabled" },
                        ]}
                    />
                }
                toolbarActive={hasFilters}
                onReset={() => updateUrl({ filter: "", status: "all", page: 1 })}
                skeletonColumns={6}
                table={{
                    rowSelection: { selectedRowKeys: selectedIds, onChange: (keys) => setSelectedIds(keys as string[]), getCheckboxProps: () => ({ disabled: batchSaving }) },
                    className: "app-data-table",
                    size: "small",
                    rowKey: "id",
                    loading,
                    columns,
                    dataSource: channels,
                    locale: {
                        emptyText: (
                            <AdminTableEmpty
                                filtered={hasFilters}
                                title={readError ? "暂时无法显示渠道" : hasFilters ? undefined : "还没有系统渠道"}
                                action={
                                    hasFilters || readError ? undefined : (
                                        <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openDrawer()}>
                                            新增系统渠道
                                        </Button>
                                    )
                                }
                            />
                        ),
                    },
                    pagination: false,
                    scroll: { x: 820 },
                }}
                footer={<PaginationBar alwaysShow current={page} pageSize={pageSize} total={total} onChange={(nextPage, nextSize) => updateUrl({ page: nextSize !== pageSize ? 1 : nextPage, pageSize: nextSize })} />}
            />
            <Modal
                className="workspace-modal workspace-modal-wide admin-channel-modal"
                rootClassName="admin-channel-modal-root"
                focusable={{ trap: !confirmOpen }}
                title={editingChannel ? "编辑系统渠道" : "新增系统渠道"}
                open={drawerOpen}
                width={640}
                closable={!saving}
                keyboard={!saving}
                onCancel={closeDrawer}
                mask={{ closable: !saving }}
                destroyOnHidden
                footer={
                    <div className="flex justify-end gap-2">
                        <Button disabled={saving} onClick={closeDrawer}>
                            取消
                        </Button>
                        <Button type="primary" loading={saving} onClick={() => void save()}>
                            保存配置
                        </Button>
                    </div>
                }
            >
                <p className="mb-4 text-sm text-foreground/60">保存仅更新配置，不会测试上游连接。已有凭证留空保留，不会回显原文。</p>
                {saveError ? <Alert className="mb-4" type="error" showIcon title="配置未保存" description={saveError} /> : null}
                <Form form={form} inert={saving} disabled={saving} layout="vertical" requiredMark={false}>
                    <Form.Item name="name" label="渠道名称" rules={[{ required: true, message: "请填写渠道名称" }]}>
                        <Input placeholder="例如：OpenAI 官方渠道" />
                    </Form.Item>
                    <AdminLocalChannelFields visible={showDesktopLocalChannelControl} checked={allowLocalChannel} form={form} />
                    <Form.Item
                        name="apiKey"
                        label={editingChannel ? `API Key / Access Key（${configuredSecretText}）` : "API Key / Access Key"}
                        rules={editingChannel ? [] : [{ required: true, message: "请填写 API Key 或 Access Key" }]}
                        extra="OpenAI 兼容协议填写 API Key；即梦官方协议填写 IAM Access Key。"
                    >
                        <Input.Password autoComplete="new-password" placeholder={editingChannel ? "留空保留原凭证" : "API Key 或 Access Key"} />
                    </Form.Item>
                    <Form.Item name="secretKey" label={editingChannel ? `Secret Key（${channelSecretText(editingChannel)}）` : "Secret Key（可选）"} extra="仅即梦官方等 AK/SK 签名协议需要；其他渠道留空。">
                        <Input.Password autoComplete="new-password" placeholder={editingChannel ? "留空保留原 Secret Key" : "IAM Secret Key"} />
                    </Form.Item>
                    <div className="mb-6">
                        <Form.Item name="headers" noStyle>
                            <ChannelHeadersEditor />
                        </Form.Item>
                    </div>
                    <Form.Item name="useGlobalConcurrency" label="跟随系统并发配置" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        name="concurrencyLimit"
                        label="渠道最大并发数"
                        extra="后台任务和系统代理请求共享该渠道上限；槽位暂满时请求会等待。"
                        rules={
                            useGlobalConcurrency
                                ? []
                                : [
                                      { required: true, message: "请填写渠道最大并发数" },
                                      { type: "number", min: 1, max: 999, message: "请输入 1-999 的整数" },
                                  ]
                        }
                    >
                        <InputNumber className="w-full" min={1} max={999} precision={0} disabled={useGlobalConcurrency} placeholder={useGlobalConcurrency ? "使用系统默认值" : "1-999"} />
                    </Form.Item>
                    <Form.Item name="enabled" label="启用" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                </Form>
            </Modal>
        </AdminPageFrame>
    );
}

function positiveInt(value: string | null, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizePageSize(value: string | null) {
    const parsed = positiveInt(value, 20);
    return [20, 50, 100].includes(parsed) ? parsed : 20;
}
function normalizeStatus(value: string | null): "all" | "enabled" | "disabled" {
    return value === "enabled" || value === "disabled" ? value : "all";
}
function channelSecretText(channel: ModelChannel) {
    return channel.hasSecretKey ? "已配置，留空不修改" : "未配置";
}
