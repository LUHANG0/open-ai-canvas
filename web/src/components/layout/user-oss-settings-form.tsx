import { App, Button, Form, Input, Tag } from "antd";
import { Switch } from "@/components/ui/base/switch";
import { Cloud, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { currentLocale } from "@/i18n";

import { changesRequireOSSRetest, DEFAULT_OSS_PATH_PREFIX, getS3PresetHints, S3_PRESET_OPTIONS, validateOSSConnectionDraft, VOLCENGINE_TOS_REGION_HINT, type OSSConnectionTestResult, type OSSProvider, type S3Preset } from "@/lib/oss-settings";
import { getUserOSSSetting, testUserOSSConnection, updateUserOSSSetting, type UserOSSSetting } from "@/services/api/resources";
import { useUserStore } from "@/stores/use-user-store";
import { StatusBadge } from "@/components/ui/base/badges";
import { Select } from "@/components/ui/base/select";
import { Callout } from "@/components/ui/product/callout";

type OSSFormValues = {
    enabled?: boolean;
    provider: OSSProvider;
    s3Preset?: S3Preset;
    region?: string;
    endpoint?: string;
    isCname?: boolean;
    cdnBaseUrl?: string;
    cdnAuthMode?: "" | "public" | "qiniu" | string;
    requireCDN?: boolean;
    allowPrivateProxy?: boolean;
    bucket?: string;
    accessKeyId?: string;
    accessKeySecret?: string;
    sessionToken?: string;
    pathPrefix?: string;
    pathStyle?: boolean;
};

export function UserOSSSettingsForm() {
    const { t } = useTranslation();
    const actor = useUserStore((state) => state.user);
    const { message } = App.useApp();
    const [form] = Form.useForm<OSSFormValues>();
    const [setting, setSetting] = useState<UserOSSSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<OSSConnectionTestResult | null>(null);
    const [testStale, setTestStale] = useState(false);
    const savedAt = formatSavedAt(setting?.updatedAt);
    const provider = Form.useWatch("provider", form) || "aliyun";
    const isTencentCOS = provider === "tencent";
    const isQiniuKodo = provider === "qiniu";
    const isVolcengineTOS = provider === "volcengine";
    const isS3 = provider === "s3";
    const s3Preset = Form.useWatch("s3Preset", form) || "custom";
    const hasCurrentProviderSecret = Boolean(setting && setting.provider === provider && setting.hasAccessKeySecret);
    const accessKeyIdLabel = isTencentCOS ? "SecretId" : isQiniuKodo ? "AccessKey" : isVolcengineTOS ? "Access Key ID" : "AccessKey ID";
    const accessKeySecretLabel = isTencentCOS ? "SecretKey" : isQiniuKodo ? "SecretKey" : isVolcengineTOS ? "Secret Access Key" : "AccessKey Secret";

    useEffect(() => {
        if (!actor?.id) return;
        let active = true;
        setLoading(true);
        setLoadError("");
        void getUserOSSSetting()
            .then((data) => {
                if (!active) return;
                setSetting(data.setting);
                form.setFieldsValue(toFormValues(data.setting));
                setTestResult(data.setting.testedAt ? { ok: true, testedAt: data.setting.testedAt, testedDigest: data.setting.testedDigest } : null);
            })
            .catch((error) => {
                if (!active) return;
                const detail = error instanceof Error ? error.message : "读取个人对象存储配置失败";
                setLoadError(detail);
                message.error(detail);
            })
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [actor?.id, form, message, t]);

    if (!actor) {
        return <div className="rounded-md border border-dashed border-border px-5 py-10 text-center text-sm text-foreground/55">{t("account.layout.oss.loginRequired")}</div>;
    }

    const save = async () => {
        const values = await form.validateFields();
        if (values.enabled && values.provider === "s3" && !setting?.allowUserS3) return message.error(t("account.layout.oss.s3NotAllowed"));
        setSaving(true);
        try {
            const data = await updateUserOSSSetting({
                enabled: values.enabled === true,
                provider: values.provider || "aliyun",
                s3Preset: values.s3Preset || "custom",
                region: values.region?.trim() || "",
                endpoint: values.endpoint?.trim() || "",
                cdnBaseUrl: values.cdnBaseUrl?.trim() || "",
                cdnAuthMode: values.cdnAuthMode || "",
                requireCDN: values.requireCDN === true,
                allowPrivateProxy: values.allowPrivateProxy === true,
                bucket: values.bucket?.trim() || "",
                accessKeyId: values.accessKeyId?.trim() || "",
                accessKeySecret: values.accessKeySecret?.trim() || "",
                sessionToken: values.sessionToken?.trim() || "",
                pathPrefix: values.pathPrefix?.trim() || DEFAULT_OSS_PATH_PREFIX,
                pathStyle: values.pathStyle === true,
                isCname: values.isCname === true,
            });
            setSetting(data.setting);
            setLoadError("");
            form.setFieldsValue(toFormValues(data.setting));
            setTestResult(data.setting.testedAt ? { ok: true, testedAt: data.setting.testedAt, testedDigest: data.setting.testedDigest } : null);
            setTestStale(false);
            message.success(data.setting.enabled ? t("account.layout.oss.enabledSuccess") : t("account.layout.oss.disabledSuccess"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("account.layout.oss.saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const testConnection = async () => {
        const values = await form.validateFields();
        const validationError = validateOSSConnectionDraft(values);
        if (validationError) {
            message.error(validationError);
            return;
        }
        setTesting(true);
        try {
            const result = await testUserOSSConnection(connectionInput(values));
            setTestResult(result);
            setTestStale(false);
            result.ok ? message.success(result.message || t("account.layout.oss.testPassed")) : message.error(result.message || t("account.layout.oss.testFailed"));
        } catch (error) {
            setTestResult({ ok: false, message: error instanceof Error ? error.message : t("account.layout.oss.testFailed") });
            setTestStale(false);
        } finally {
            setTesting(false);
        }
    };

    return (
        <Form className="settings-storage-pane" aria-busy={loading || saving || testing} form={form} layout="vertical" requiredMark={false} disabled={loading} onValuesChange={(changed) => changesRequireOSSRetest(changed) && setTestStale(true)}>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div className="min-w-0">
                    <h2 className="settings-storage-title flex items-center gap-2 text-sm font-semibold">
                        <Cloud className="size-4" aria-hidden="true" />
                        我的对象存储
                    </h2>
                    <p className="settings-storage-description mt-1 max-w-3xl text-xs leading-5 text-foreground/55">启用后，新上传和新生成的媒体优先写入你的存储桶；停用时回退到平台存储。</p>
                </div>
                <div className="flex shrink-0 gap-2">
                    <StatusBadge tone={!loading && !loadError && setting?.enabled ? "success" : "neutral"} label={loading ? "读取中" : loadError ? "读取失败" : setting?.enabled ? "已启用" : "未启用"} />
                    <Tag color={loading || loadError ? "default" : setting?.hasAccessKeySecret ? "processing" : "warning"} icon={<ShieldCheck className="size-3" aria-hidden="true" />}>
                        {loading ? "正在读取密钥状态" : loadError ? "密钥状态未确认" : setting?.hasAccessKeySecret ? "密钥已加密" : "未保存密钥"}
                    </Tag>
                </div>
            </div>

            {loadError ? <Callout className="settings-storage-feedback mb-3" tone="error" role="alert" title="个人对象存储配置读取失败">{loadError}，当前表单不能代表服务端已保存配置，请刷新页面后重试。</Callout> : null}

            <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2 xl:grid-cols-3">
                <Form.Item name="enabled" label="启用个人对象存储" valuePropName="checked" className="mb-3">
                    <Switch aria-label="启用个人对象存储" checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
                <Form.Item name="provider" label={t("account.layout.oss.provider")} rules={[{ required: true, message: t("account.layout.oss.providerRequired") }]} className="mb-3">
                    <Select
                        ariaLabel="存储服务"
                        options={[{ label: "阿里云 OSS", value: "aliyun" }, { label: "腾讯云 COS", value: "tencent" }, { label: "七牛云 Kodo", value: "qiniu" }, { label: "火山引擎 TOS", value: "volcengine" }, { label: "S3 兼容存储", value: "s3", disabled: setting?.allowUserS3 === false }]}
                        onChange={(nextProvider: OSSFormValues["provider"]) => {
                            if (nextProvider !== provider) form.setFieldsValue({ s3Preset: "custom", region: "", endpoint: "", cdnBaseUrl: "", cdnAuthMode: "", requireCDN: false, allowPrivateProxy: false, bucket: "", accessKeyId: "", accessKeySecret: "", sessionToken: "", isCname: false, pathStyle: false });
                        }}
                    />
                </Form.Item>
                {isS3 ? (
                    <Form.Item name="s3Preset" label="S3 预设" className="mb-3">
                        <Select ariaLabel="S3 预设" options={S3_PRESET_OPTIONS} onChange={(preset: S3Preset) => form.setFieldsValue(getS3PresetHints(preset))} />
                    </Form.Item>
                ) : null}
                <Form.Item name="region" label="Region" extra={isVolcengineTOS ? t("account.layout.oss.regionHint", { regions: VOLCENGINE_TOS_REGION_HINT }) : undefined} className="mb-3">
                    <Input spellCheck={false} placeholder={isS3 ? getS3PresetHints(s3Preset).region : isTencentCOS ? "ap-guangzhou" : isQiniuKodo ? "z0 / cn-east-1" : isVolcengineTOS ? "cn-beijing" : "oss-cn-hangzhou"} />
                </Form.Item>
                <Form.Item
                    name="endpoint"
                    label={isQiniuKodo ? t("account.layout.oss.uploadEndpoint") : "Endpoint"}
                    extra={
                        isS3
                            ? getS3PresetHints(s3Preset).help
                            : isTencentCOS
                              ? t("account.layout.oss.endpointHintTencent")
                              : isVolcengineTOS
                                ? t("account.layout.oss.endpointHintVolcengine")
                                : undefined
                    }
                    className="mb-3"
                >
                    <Input
                        inputMode="url"
                        spellCheck={false}
                        placeholder={
                            isS3
                                ? getS3PresetHints(s3Preset).endpoint
                                : isTencentCOS
                                  ? "https://cos.ap-guangzhou.myqcloud.com"
                                  : isQiniuKodo
                                    ? "https://up-z0.qiniup.com"
                                    : isVolcengineTOS
                                      ? "https://tos-s3-cn-beijing.volces.com"
                                      : "https://oss-cn-hangzhou.aliyuncs.com"
                        }
                    />
                </Form.Item>
                {provider === "aliyun" ? (
                    <Form.Item name="isCname" label="使用 OSS 自定义域名" valuePropName="checked" extra="Endpoint 为已绑定的 OSS 自定义域名时开启，需要有效的 HTTPS 证书。" className="mb-3">
                        <Switch aria-label="使用 OSS 自定义域名" />
                    </Form.Item>
                ) : null}
                <Form.Item
                    name="cdnBaseUrl"
                    label={isQiniuKodo ? t("account.layout.oss.cdnQiniu") : isS3 ? t("account.layout.oss.cdnS3") : t("account.layout.oss.cdnDefault")}
                    extra={
                        isTencentCOS
                            ? t("account.layout.oss.cdnHintTencent")
                            : isQiniuKodo
                              ? t("account.layout.oss.cdnHintQiniu")
                              : isVolcengineTOS
                                ? t("account.layout.oss.cdnHintVolcengine")
                                : t("account.layout.oss.cdnHintAliyun")
                    }
                    rules={[{ type: "url", message: t("account.layout.oss.cdnInvalid") }]}
                    className="mb-3"
                >
                    <Input inputMode="url" spellCheck={false} placeholder="https://media.example.com" />
                </Form.Item>
                <Form.Item
                    name="cdnAuthMode"
                    label={t("account.layout.oss.cdnAuth")}
                    extra={isQiniuKodo ? t("account.layout.oss.cdnAuthHintQiniu") : t("account.layout.oss.cdnAuthHintDefault")}
                    className="mb-3"
                >
                    <Select ariaLabel="CDN 访问鉴权" options={[{ label: "未配置", value: "" }, { label: "公开 CDN", value: "public" }, { label: "七牛私有下载签名", value: "qiniu", disabled: !isQiniuKodo }]} />
                </Form.Item>
                <Form.Item name="requireCDN" label="必须走 CDN" valuePropName="checked" extra="开启后 CDN 鉴权未配置或不支持时直接失败，不会静默回源。" className="mb-3">
                    <Switch aria-label="必须走 CDN" checkedChildren="必须" unCheckedChildren="允许回源" />
                </Form.Item>
                <Form.Item name="allowPrivateProxy" label="允许模型输入代理" valuePropName="checked" extra="仅允许服务端向第三方模型提交参考素材时读取私有源站。浏览器展示、复制、下载和本地处理始终直连 OSS/CDN，不会经平台中转媒体正文。" className="mb-3">
                    <Switch aria-label="允许模型输入代理" checkedChildren="允许" unCheckedChildren="禁止" />
                </Form.Item>
                <Form.Item name="bucket" label="Bucket" className="mb-3">
                    <Input spellCheck={false} placeholder={isTencentCOS ? "my-canvas-assets-1250000000" : isQiniuKodo ? t("account.layout.oss.bucketQiniu") : isVolcengineTOS ? t("account.layout.oss.bucketVolcengine") : "my-canvas-assets"} />
                </Form.Item>
                <Form.Item name="pathPrefix" label={t("account.layout.oss.pathPrefix")} className="mb-3">
                    <Input spellCheck={false} placeholder={DEFAULT_OSS_PATH_PREFIX} />
                </Form.Item>
                <Form.Item name="accessKeyId" label={accessKeyIdLabel} className="mb-3 xl:col-span-1">
                    <Input autoComplete="off" spellCheck={false} placeholder={isTencentCOS ? t("account.layout.oss.keyIdTencent") : isQiniuKodo ? t("account.layout.oss.keyIdQiniu") : isVolcengineTOS ? t("account.layout.oss.keyIdVolcengine") : t("account.layout.oss.keyIdAliyun")} />
                </Form.Item>
                <Form.Item name="accessKeySecret" label={hasCurrentProviderSecret ? t("account.layout.oss.keepBlank", { label: accessKeySecretLabel }) : accessKeySecretLabel} className="mb-3 xl:col-span-2">
                    <Input.Password autoComplete="new-password" spellCheck={false} placeholder={hasCurrentProviderSecret ? t("account.layout.oss.keepSecret") : isTencentCOS ? t("account.layout.oss.secretTencent") : isQiniuKodo ? t("account.layout.oss.secretQiniu") : isVolcengineTOS ? t("account.layout.oss.secretVolcengine") : t("account.layout.oss.secretAliyun")} />
                </Form.Item>
                {isS3 ? (
                    <>
                        <Form.Item name="sessionToken" label={setting?.hasSessionToken ? t("account.layout.oss.keepBlank", { label: "Session Token" }) : t("account.layout.oss.sessionTokenOptional")} className="mb-3">
                            <Input.Password autoComplete="new-password" spellCheck={false} placeholder={setting?.hasSessionToken ? t("account.layout.oss.keepToken") : t("account.layout.oss.sessionTokenPlaceholder")} />
                        </Form.Item>
                        <Form.Item name="pathStyle" label="Path Style" valuePropName="checked" extra="开启后强制 path-style；关闭时自动选择。" className="mb-3">
                            <Switch aria-label="强制使用 Path Style" checkedChildren="强制" unCheckedChildren="自动" />
                        </Form.Item>
                    </>
                ) : null}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="settings-storage-saved-status flex flex-wrap items-center gap-2" role="status" aria-live="polite"><span className="text-xs text-foreground/50">{loading ? "正在读取个人对象存储配置" : loadError ? "服务端配置状态尚未确认" : savedAt ? `上次保存：${savedAt}` : "尚未保存个人对象存储配置"}</span>{!loading && !loadError ? <ConnectionTestStatus result={testResult} stale={testStale} /> : null}</div>
                <div className="flex flex-wrap gap-2"><Button loading={testing} onClick={() => void testConnection()}>测试连接</Button><Button type="primary" loading={saving} onClick={() => void save()}>保存个人对象存储</Button></div>
            </div>
        </Form>
    );
}

function formatSavedAt(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.getFullYear() < 2000) return "";
    return date.toLocaleString(currentLocale());
}

function toFormValues(setting: UserOSSSetting): OSSFormValues {
    return {
        enabled: setting.enabled,
        provider: setting.provider || "aliyun",
        s3Preset: setting.s3Preset || "custom",
        region: setting.region,
        endpoint: setting.endpoint,
        cdnBaseUrl: setting.cdnBaseUrl,
        cdnAuthMode: setting.cdnAuthMode || "",
        requireCDN: setting.requireCDN === true,
        allowPrivateProxy: setting.allowPrivateProxy === true,
        bucket: setting.bucket,
        accessKeyId: setting.accessKeyId,
        accessKeySecret: "",
        sessionToken: "",
        pathPrefix: setting.pathPrefix || DEFAULT_OSS_PATH_PREFIX,
        pathStyle: setting.pathStyle === true,
        isCname: setting.isCname === true,
    };
}

function connectionInput(values: OSSFormValues) {
    return {
        provider: values.provider,
        s3Preset: values.s3Preset,
        region: values.region?.trim() || "",
        endpoint: values.endpoint?.trim() || "",
        cdnBaseUrl: values.cdnBaseUrl?.trim() || "",
        bucket: values.bucket?.trim() || "",
        accessKeyId: values.accessKeyId?.trim() || "",
        accessKeySecret: values.accessKeySecret?.trim() || "",
        sessionToken: values.sessionToken?.trim() || "",
        pathPrefix: values.pathPrefix?.trim() || DEFAULT_OSS_PATH_PREFIX,
        pathStyle: values.pathStyle === true,
        isCname: values.isCname === true,
    };
}

function ConnectionTestStatus({ result, stale }: { result: OSSConnectionTestResult | null; stale: boolean }) {
    const { t } = useTranslation();
    if (stale) return <StatusBadge tone="warning" label={t("account.layout.oss.retestNeeded")} />;
    if (!result) return null;
    return <StatusBadge tone={result.ok ? "success" : "error"} label={result.ok ? (result.testedAt ? t("account.layout.oss.testPassedAt", { time: formatSavedAt(result.testedAt) }) : t("account.layout.oss.testPassedShort")) : result.message || t("account.layout.oss.testFailedShort")} />;
}
