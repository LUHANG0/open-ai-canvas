import { App, Button, Form, Input, InputNumber, Select } from "antd";
import { ArrowLeft, Boxes, Bug, Info, Cloud, MessageSquareText, MonitorUp, RadioTower, SlidersHorizontal, SquareTerminal, Workflow } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { UserOSSSettingsForm } from "@/components/layout/user-oss-settings-form";
import { PageHeader, WorkspacePage } from "@/components/ui/pc/page";
import { SubnavLayout } from "@/components/ui/pc";
import { audioFormatOptions, audioVoiceOptions, normalizeAudioSpeedValue } from "@/lib/audio-generation";
import { refreshSystemChannels } from "@/lib/user-session";
import { defaultConfig, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { useUserStore } from "@/stores/use-user-store";
import { ChannelSettingsPane, channelValidationError, focusInvalidChannelField, isChannelReady } from "./channel-settings-pane";
export { UserLocalChannelFields, UserLocalChannelSwitch, userLocalChannelChangePatch, userLocalChannelFormOwner } from "./channel-settings-pane";
import { ComfyUIBridgeSettingsPane } from "./comfyui-bridge-settings-pane";
import { ModelDefaultGrid } from "./model-default-grid";
import { LocalCliSettings } from "./local-cli-settings";
import { PromptPreferencesPane } from "./prompt-preferences-pane";
import DiagnosticsPanel from "./diagnostics-panel";
import { RunningHubSettingsPane } from "./runninghub-settings-pane";
import { COMFYUI_PLUGIN_ID, RUNNINGHUB_PLUGIN_ID } from "@/lib/plugins/builtin/workflows";
import { usePluginStore } from "@/stores/use-plugin-store";
import "./settings.css";

type ConfigSectionKey = "local-cli" | "channels" | "models" | "runninghub" | "comfyui" | "preferences" | "prompts" | "storage" | "diagnostics";

const configSections: Array<{ key: ConfigSectionKey; label: string; description: string; icon: ReactNode }> = [
    { key: "local-cli", label: "本机工具", description: "连接 Runtime 与官方 CLI", icon: <SquareTerminal className="size-4" /> },
    { key: "channels", label: "个人渠道", description: "模型服务与个人工作流", icon: <RadioTower className="size-4" /> },
    { key: "runninghub", label: "RunningHub 工作流", description: "个人渠道的云端工作流配置", icon: <Workflow className="size-4" /> },
    { key: "comfyui", label: "ComfyUI Bridge", description: "个人渠道的 Bridge 工作流配置", icon: <MonitorUp className="size-4" /> },
    { key: "models", label: "模型选择", description: "按领域选择默认模型", icon: <Boxes className="size-4" /> },
    { key: "preferences", label: "生成偏好", description: "画布、视频与音频默认值", icon: <SlidersHorizontal className="size-4" /> },
    { key: "prompts", label: "提示词偏好", description: "按任务定制平台模板", icon: <MessageSquareText className="size-4" /> },
    { key: "storage", label: "我的对象存储", description: "管理个人媒体存储", icon: <Cloud className="size-4" /> },
    { key: "diagnostics", label: "问题诊断", description: "导出日志协助排查", icon: <Bug className="size-4" /> },
];

export function isConfigSection(value: string | null): value is ConfigSectionKey {
    return configSections.some((section) => section.key === value);
}

export default function SettingsPage() {
    const { message } = App.useApp();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedSection = searchParams.get("section");
    const customChannelsEnabled = useUserStore((state) => state.features.customChannelsEnabled);
    const runtimeStatuses = usePluginStore((state) => state.runtimeStatuses);
    const runningHubPluginEnabled = runtimeStatuses[RUNNINGHUB_PLUGIN_ID] === "enabled";
    const comfyUIPluginEnabled = runtimeStatuses[COMFYUI_PLUGIN_ID] === "enabled";
    const requestedSectionEnabled = (requestedSection !== "runninghub" && requestedSection !== "comfyui") || (requestedSection === "runninghub" && runningHubPluginEnabled) || (requestedSection === "comfyui" && comfyUIPluginEnabled);
    const initialSection = isConfigSection(requestedSection) && requestedSectionEnabled ? requestedSection : customChannelsEnabled ? "channels" : "models";
    const [activeTab, setActiveTab] = useState<ConfigSectionKey>(initialSection === "channels" && !customChannelsEnabled ? "models" : initialSection);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const shouldPromptContinue = searchParams.get("continue") === "1";
    const userId = useUserStore((state) => state.user?.id);
    const userChannels = config.channels.filter((channel) => channel.scope !== "system");
    const visibleConfigSections = useMemo(
        () =>
            (customChannelsEnabled ? configSections : configSections.filter((section) => section.key !== "channels"))
                .filter((section) => section.key !== "runninghub" || runningHubPluginEnabled)
                .filter((section) => section.key !== "comfyui" || comfyUIPluginEnabled),
        [comfyUIPluginEnabled, customChannelsEnabled, runningHubPluginEnabled],
    );
    const activeSectionMeta = visibleConfigSections.find((section) => section.key === activeTab) || visibleConfigSections[0];

    const isVisibleConfigSection = (value: string | null): value is ConfigSectionKey => isConfigSection(value) && visibleConfigSections.some((section) => section.key === value);

    useEffect(() => {
        if (isVisibleConfigSection(requestedSection)) {
            setActiveTab(requestedSection);
            return;
        }
        setActiveTab((current) => (visibleConfigSections.some((section) => section.key === current) ? current : customChannelsEnabled ? "channels" : "models"));
    }, [customChannelsEnabled, requestedSection, visibleConfigSections]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        void refreshSystemChannels().catch((error) => {
            if (!cancelled) message.warning(error instanceof Error ? `系统模型刷新失败：${error.message}` : "系统模型刷新失败，继续使用本地缓存");
        });
        return () => {
            cancelled = true;
        };
    }, [message, userId]);

    const selectSection = (section: ConfigSectionKey) => {
        if ((section === "runninghub" && !runningHubPluginEnabled) || (section === "comfyui" && !comfyUIPluginEnabled)) return;
        setActiveTab(section);
        const next = new URLSearchParams(searchParams);
        next.set("section", section);
        setSearchParams(next, { replace: true });
    };

    const finishConfig = () => {
        const invalidChannel = customChannelsEnabled ? userChannels.find((channel) => channelValidationError(channel)) : undefined;
        if (invalidChannel) {
            selectSection("channels");
            message.warning(`${invalidChannel.name || "未命名渠道"}：${channelValidationError(invalidChannel)}`);
            focusInvalidChannelField(invalidChannel);
            return;
        }
        const hasReadyLocalRuntime = effectiveConfig.channels.some((channel) => channel.transport === "local-runtime" && channel.enabled !== false && Boolean(channel.localModels?.length));
        const workflowReady = Boolean(
            (runningHubPluginEnabled && config.runningHub.enabled && config.runningHub.workflowId.trim() && config.runningHub.baseUrl.trim() && config.runningHub.apiKey.trim()) ||
            (comfyUIPluginEnabled && config.comfyBridge.enabled && config.comfyBridge.bridgeId.trim() && config.comfyBridge.workflowId.trim()),
        );
        if (!effectiveConfig.channels.some(isChannelReady) && !hasReadyLocalRuntime && !workflowReady) {
            selectSection(customChannelsEnabled ? "channels" : "models");
            message.error(customChannelsEnabled ? (shouldPromptContinue ? "请先完成至少一个渠道的 Base URL、API Key 和模型配置" : "当前没有可用渠道，请先完成连接信息和模型配置") : "当前没有可用的系统模型，请联系管理员配置系统渠道");
            return;
        }
        message.success("本机配置检查通过，正在返回创作页面");
        navigate(-1);
    };

    const panes: Record<ConfigSectionKey, ReactNode> = {
        "local-cli": (
            <SettingsPane>
                <LocalCliSettings />
            </SettingsPane>
        ),
        channels: (
            <SettingsPane>
                <ChannelSettingsPane
                    onOpenModels={() => selectSection("models")}
                    onOpenRunningHub={runningHubPluginEnabled ? () => selectSection("runninghub") : undefined}
                    onOpenComfyUI={comfyUIPluginEnabled ? () => selectSection("comfyui") : undefined}
                />
            </SettingsPane>
        ),
        models: (
            <SettingsPane>
                <div className="settings-pane-header">
                    <div className="min-w-0">
                        <h2>模型选择</h2>
                        <p>按领域选择默认模型；模型能力与请求协议在渠道“模型与能力”中配置。</p>
                    </div>
                </div>
                <div className="settings-section">
                    <ModelDefaultGrid config={effectiveConfig} onChange={(key, model) => updateConfig(key, model)} />
                </div>
            </SettingsPane>
        ),
        runninghub: (
            <SettingsPane>
                <RunningHubSettingsPane />
            </SettingsPane>
        ),
        comfyui: (
            <SettingsPane>
                <ComfyUIBridgeSettingsPane />
            </SettingsPane>
        ),
        preferences: (
            <SettingsPane>
                <div className="settings-pane-header">
                    <div className="min-w-0">
                        <h2>生成偏好</h2>
                        <p>画布、视频与音频默认值，节点内仍可单独覆盖。</p>
                    </div>
                </div>
                <div className="settings-section">
                    <Form layout="vertical" requiredMark={false}>
                        <section className="settings-preference-block pb-6">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">画布生成</h3>
                                <p className="mt-1 text-xs text-foreground/55">设置新建生成任务时使用的初始值，节点内仍可单独覆盖。</p>
                            </div>
                            <Form.Item label="默认生图张数" className="mb-0 max-w-xs">
                                <InputNumber
                                    min={1}
                                    max={15}
                                    precision={0}
                                    className="w-full"
                                    value={Number(config.canvasImageCount)}
                                    onChange={(value) => updateConfig("canvasImageCount", normalizeImageCount(String(value ?? defaultConfig.canvasImageCount)))}
                                />
                            </Form.Item>
                        </section>
                        <section className="settings-preference-block py-6">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">音频默认值</h3>
                                <p className="mt-1 text-xs text-foreground/55">用于新建音频节点和未单独设置参数的生成任务。</p>
                            </div>
                            <div className="grid gap-4 md:grid-cols-3">
                                <Form.Item label="默认声音" className="mb-0">
                                    <Select value={config.audioVoice} options={audioVoiceOptions} onChange={(value) => updateConfig("audioVoice", value)} />
                                </Form.Item>
                                <Form.Item label="文件格式" className="mb-0">
                                    <Select value={config.audioFormat} options={audioFormatOptions} onChange={(value) => updateConfig("audioFormat", value)} />
                                </Form.Item>
                                <Form.Item label="语速" className="mb-0">
                                    <InputNumber
                                        min={0.25}
                                        max={4}
                                        step={0.05}
                                        precision={2}
                                        className="w-full"
                                        value={Number(config.audioSpeed)}
                                        onChange={(value) => updateConfig("audioSpeed", normalizeAudioSpeedValue(String(value ?? defaultConfig.audioSpeed)))}
                                    />
                                </Form.Item>
                            </div>
                        </section>
                        <section className="settings-preference-block pt-6">
                            <div className="mb-4">
                                <h3 className="text-sm font-semibold">音频指令</h3>
                                <p className="mt-1 text-xs text-foreground/55">在音频节点没有单独填写时使用。</p>
                            </div>
                            <div className="max-w-2xl">
                                <Form.Item label="默认音频指令" className="mb-0">
                                    <Input.TextArea rows={5} value={config.audioInstructions} placeholder="例如：自然、温暖、适合旁白。" onChange={(event) => updateConfig("audioInstructions", event.target.value)} />
                                </Form.Item>
                            </div>
                        </section>
                    </Form>
                </div>
            </SettingsPane>
        ),
        prompts: (
            <SettingsPane fill>
                <PromptPreferencesPane />
            </SettingsPane>
        ),
        diagnostics: (
            <SettingsPane>
                <DiagnosticsPanel taskId={searchParams.get("taskId") || undefined} projectId={searchParams.get("projectId") || undefined} />
            </SettingsPane>
        ),
        storage: (
            <SettingsPane>
                <div className="settings-section">
                    <UserOSSSettingsForm />
                </div>
            </SettingsPane>
        ),
    };

    return (
        <WorkspacePage className="settings-page" contentClassName="settings-page-content">
            <PageHeader
                eyebrow="账户与偏好"
                title="个人设置"
                description="管理本机工具、模型渠道、工作流、生成偏好与个人存储。"
                actions={
                    shouldPromptContinue ? (
                        <>
                            <Button icon={<ArrowLeft className="size-4" />} onClick={() => navigate(-1)}>
                                返回创作
                            </Button>
                            <Button type="primary" onClick={finishConfig}>
                                完成并返回
                            </Button>
                        </>
                    ) : undefined
                }
            />
            <SubnavLayout
                className="settings-subnav"
                ariaLabel="配置分类"
                items={visibleConfigSections.map((item) => ({
                    value: item.key,
                    label: item.label,
                    description: item.description,
                    icon: item.icon,
                }))}
                activeValue={activeTab}
                onChange={selectSection}
                navigationHeader={
                    <div className="settings-subnav-heading">
                        <span>设置分类</span>
                        <strong>{visibleConfigSections.length}</strong>
                    </div>
                }
            >
                <div className={`settings-pane-root ${activeTab === "prompts" ? "is-editor" : ""}`}>
                    {activeSectionMeta ? (
                        <header className="settings-section-context" aria-label={`当前设置：${activeSectionMeta.label}`}>
                            <span className="settings-section-context-icon" aria-hidden="true">
                                {activeSectionMeta.icon}
                            </span>
                            <div className="settings-section-context-copy">
                                <span>当前设置</span>
                                <strong>{activeSectionMeta.label}</strong>
                                <small>{activeSectionMeta.description}</small>
                            </div>
                            <span className="settings-section-save-note">
                                <Info className="size-3.5" aria-hidden="true" />
                                {activeTab === "storage" || activeTab === "prompts"
                                    ? "修改后需保存到当前账号"
                                    : activeTab === "diagnostics" ? "按当前账号收集诊断信息"
                                    : activeTab === "local-cli" ? "连接状态以本机检测结果为准"
                                    : activeTab === "comfyui" || activeTab === "runninghub" ? "连接信息存本机，工作流按面板提示保存"
                                    : "修改自动保存在当前账号的本机配置"}
                            </span>
                        </header>
                    ) : null}
                    {panes[activeTab]}
                </div>
            </SubnavLayout>
        </WorkspacePage>
    );
}

function SettingsPane({ children, fill = false }: { children: ReactNode; fill?: boolean }) {
    return <div className={fill ? "settings-pane h-full" : "settings-pane"}>{children}</div>;
}

function normalizeImageCount(value: string) {
    return String(Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || Number(defaultConfig.canvasImageCount)))));
}
