import { App, Button, Input, Skeleton } from "antd";
import { AlertTriangle, Archive, BadgeCheck, Circle, ExternalLink, History, RefreshCw, RotateCcw, ServerCog, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { checkSystemUpdate, getSystemUpdateStatus, rollbackSystemUpdate, startSystemUpdate, type SystemUpdateStatus, type UpdatePhase } from "@/services/api/system-update";
import { AdminPageFrame } from "../components/admin-shell";
import { AdminStatusBadge, SettingsSectionCard } from "../components/admin-ui";
import { formatUpdateComponent, formatUpdateDate as formatDate, formatUpdateTime as formatTime } from "./system-update-presentation";

const activePhases = new Set<UpdatePhase>(["checking", "preflight", "backing_up", "pulling", "draining", "migrating", "switching", "verifying", "rolling_back"]);

const phaseLabels: Record<UpdatePhase, string> = {
    idle: "等待检查",
    checking: "正在检查",
    ready: "可更新",
    no_update: "已是最新",
    preflight: "前置检查",
    backing_up: "正在备份",
    pulling: "拉取镜像",
    draining: "停止旧服务",
    migrating: "迁移数据库",
    switching: "切换版本",
    verifying: "健康验证",
    succeeded: "更新成功",
    rolling_back: "正在回退",
    rolled_back: "已回退",
    failed: "更新失败",
    manual_intervention: "需人工介入",
};

export default function SystemUpdatePage() {
    const { message, modal } = App.useApp();
    const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [starting, setStarting] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);
    const [loadError, setLoadError] = useState("");
    const mountedRef = useRef(true);

    const load = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const next = await getSystemUpdateStatus();
            if (!mountedRef.current) return;
            setStatus(next);
            setLoadError("");
            setReconnecting(false);
        } catch (error) {
            if (!mountedRef.current) return;
            const errorMessage = error instanceof Error ? error.message : "读取系统更新状态失败";
            setLoadError(errorMessage);
            if (status && activePhases.has(status.operation.phase)) setReconnecting(true);
        } finally {
            if (mountedRef.current && initial) setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        mountedRef.current = true;
        void load(true);
        return () => {
            mountedRef.current = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!status || !activePhases.has(status.operation.phase)) return;
        const timer = window.setInterval(() => void load(false), 2500);
        return () => window.clearInterval(timer);
    }, [load, status]);

    const operationActive = Boolean(status && activePhases.has(status.operation.phase));
    const customDeployment = status?.deployment === "custom-compose-host-updater";
    const blockingCheckFailed = status?.checks.some((check) => check.blocking && check.status === "failed") ?? true;

    const requestCheck = async () => {
        setChecking(true);
        try {
            const next = await checkSystemUpdate();
            setStatus(next);
            message.success(next.updateAvailable ? `发现新版本 ${next.latestRelease?.version}` : next.deployment === "custom-compose-host-updater" ? "候选清单与当前发布一致" : "当前已是最新版本");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "检查更新失败");
            await load(false);
        } finally {
            setChecking(false);
        }
    };

    const requestStart = () => {
        if (!status?.latestRelease) return;
        const target = status.latestRelease.version;
        modal.confirm({
            rootClassName: "admin-modal-root",
            className: "admin-modal-panel",
            title: `更新到 ${target}？`,
            width: 560,
            content: (
                <div className="space-y-3 text-sm text-foreground/70">
                    <p>{customDeployment ? "系统会核对服务器已准备的发布清单，保留本地配置，并分别校验前端、后端与 Agent。前端更新还需要站点资源发布验证。" : "系统会先停止旧服务，再创建并校验数据库 ZIP 与数据目录备份、执行迁移并切换镜像。"}</p>
                    <p>{customDeployment ? "受影响服务会短暂不可用。后端变更会停服备份并执行迁移；仅前端或 Agent 变更时不恢复数据库。切换验证失败会回退，无法完成时停止服务并要求人工核对。" : "更新期间站点会短暂不可用。任何前置检查失败都不会切换服务；切换后验证失败会自动恢复旧版本和数据库。"}</p>
                </div>
            ),
            okText: "确认并开始更新",
            cancelText: "取消",
            onOk: async () => {
                setStarting(true);
                try {
                    const next = await startSystemUpdate(target);
                    setStatus(next);
                    message.success("更新任务已启动，页面会自动重连并显示进度");
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "无法开始更新");
                    throw error;
                } finally {
                    setStarting(false);
                }
            },
        });
    };

    const requestRollback = () => {
        if (!status?.rollbackVersion) return;
        let reason = "";
        modal.confirm({
            rootClassName: "admin-modal-root",
            className: "admin-modal-panel",
            title: `回退到 ${status.rollbackVersion}？`,
            width: 520,
            content: (
                <div className="space-y-3">
                    <p className="text-sm text-foreground/65">{customDeployment ? "回退会恢复上次代码与站点资源发布，保留当前数据库和后端素材。已成功发布的后端不在此处自动恢复旧数据。" : "回退会停止当前服务、恢复最近一次已校验数据库备份并重新启动旧镜像。请先确认备份时间与业务影响。"}</p>
                    <Input.TextArea aria-label="回退原因（必填）" rows={3} maxLength={300} showCount placeholder="填写回退原因（必填）" onChange={(event) => (reason = event.target.value)} />
                </div>
            ),
            okText: "开始回退",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                if (!reason.trim()) {
                    message.warning("请填写回退原因");
                    throw new Error("rollback reason required");
                }
                const next = await rollbackSystemUpdate(reason.trim());
                setStatus(next);
                message.success("回退任务已启动");
            },
        });
    };

    if (loading) {
        return (
            <AdminPageFrame title="系统更新" description="检查发布版本，并在备份、迁移和健康验证保护下完成在线更新。" scroll>
                <div className="admin-settings-stack admin-system-update"><Skeleton active paragraph={{ rows: 12 }} /></div>
            </AdminPageFrame>
        );
    }

    return (
        <AdminPageFrame
            title="系统更新"
            description={customDeployment ? "核对服务器发布清单，保留二改配置并验证各组件后切换版本。" : "检查 GitHub Release，并在完成备份、迁移和健康验证后切换版本。"}
            scroll
            actions={
                <>
                    {loadError ? <Button onClick={() => void load(false)}>重新读取状态</Button> : null}
                    <Button icon={<RefreshCw className="size-4" />} loading={checking} disabled={operationActive || !status?.supported || Boolean(loadError)} onClick={() => void requestCheck()}>
                        检查更新
                    </Button>
                </>
            }
        >
            <div className="admin-settings-stack admin-system-update">
                {loadError ? <UpdateAlert tone="error" title={status ? "更新状态暂不可刷新" : "无法读取更新状态"} detail={status ? `以下为上次读取的状态。${loadError}` : loadError} /> : null}
                {!status?.supported ? <UpdateAlert tone="warning" title="当前部署不支持后台在线更新" detail="请先在服务器安装 Host Updater，并重建 backend 容器挂载 Unix Socket。此状态下不会执行任何更新操作。" /> : null}
                {reconnecting ? <UpdateAlert tone="warning" title="服务正在切换，等待重新连接" detail="更新器运行在宿主机，后台页面暂时断线不会中止更新。连接恢复后会继续显示最终结果。" /> : null}
                {status?.operation.phase === "manual_intervention" ? <UpdateAlert
                    tone="error"
                    title={customDeployment ? "发布或恢复需要人工核对" : status.operation.rollbackError ? "自动回退未完成，需要人工介入" : "应用已更新，Host Updater 需要人工处理"}
                    detail={status.operation.rollbackError || status.operation.error || "请检查 Host Updater 和容器日志。"}
                /> : null}

                <div className="admin-system-update-grid">
                    <SettingsSectionCard
                        className="admin-system-update-release"
                        layout="stacked"
                        icon={<ServerCog className="size-4" />}
                        title="可用版本"
                        description={status?.updateAvailable ? `当前运行 ${status.currentVersion}，可更新到 ${status.latestRelease?.version}。` : customDeployment ? "检查服务器已准备的候选清单与当前发布记录。" : "检查 GitHub Release 与当前运行的镜像标签。"}
                        status={<PhaseBadge phase={status?.operation.phase ?? "idle"} customDeployment={customDeployment} />}
                        footer={
                            <>
                                <span className="text-xs leading-5 text-foreground/50">{customDeployment ? "分别校验组件版本；后端变更先备份迁移，前端变更须验证站点资源。" : "每次在线更新都会重新备份数据库，并校验镜像摘要、迁移结果和服务健康状态。"}</span>
                                <Button type="primary" loading={starting} disabled={!status?.connected || !status.updateAvailable || operationActive || checking || Boolean(loadError) || blockingCheckFailed} onClick={requestStart}>
                                    开始更新
                                </Button>
                            </>
                        }
                    >
                        <div className="admin-system-update-release-body">
                            <div className="admin-system-update-versions">
                                <div>
                                    <span>当前运行</span>
                                    <strong className="min-w-0 [overflow-wrap:anywhere]">{status?.currentVersion || "未识别"}</strong>
                                    {status?.currentVersion && !isReleaseVersion(status.currentVersion) ? <AdminStatusBadge label={customDeployment ? "自定义发布" : "非正式版本"} tone={customDeployment ? "neutral" : "warning"} /> : null}
                                </div>
                                <div>
                                    <span>{customDeployment ? "候选清单" : "最新发布"}</span>
                                    <strong className="min-w-0 [overflow-wrap:anywhere]">{status?.latestRelease?.version || "尚未检查"}</strong>
                                    {status?.latestRelease?.prerelease ? <AdminStatusBadge label="预览版" tone="warning" /> : null}
                                    {status?.updateAvailable ? <AdminStatusBadge label="可更新" tone="success" /> : null}
                                </div>
                            </div>
                            {status?.updateAvailable && status.latestRelease ? (
                                <p className="admin-system-update-hint">
                                    {customDeployment || isReleaseVersion(status.currentVersion)
                                        ? `可以从 ${status.currentVersion} 更新到 ${status.latestRelease.version}。`
                                        : `当前镜像标签不是正式版本号，所以会显示成 ${status.currentVersion}。点开始更新后会切换到 ${status.latestRelease.version}。`}
                                </p>
                            ) : null}
                            <dl className="admin-system-update-facts">
                                <dt>部署方式</dt><dd>{customDeployment ? "二改部署 · 保留本地配置" : status?.deployment || "未知"}</dd>
                                {customDeployment ? (["web", "backend", "yingce-agent"] as const).map((name) => (
                                    <div key={name} className="contents"><dt>{{ web: "前端", backend: "后端", "yingce-agent": "Agent" }[name]}</dt><dd>{formatUpdateComponent(status?.components?.[name])}</dd></div>
                                )) : <><dt>发布时间</dt><dd>{formatDate(status?.latestRelease?.publishedAt)}</dd></>}
                                <dt>代码仓库</dt><dd>{status?.repository || "未提供"}</dd>
                            </dl>
                            {status?.latestRelease ? (
                                <div className="admin-system-update-notes">
                                    <div className="flex items-center justify-between gap-3"><h3>{customDeployment ? "候选发布" : "更新日志"}</h3>{status.latestRelease.url ? <a href={status.latestRelease.url} target="_blank" rel="noreferrer">查看 Release <ExternalLink className="size-3" /></a> : null}</div>
                                    {customDeployment && status.latestRelease.components ? <pre>{(["web", "backend", "yingce-agent"] as const).map((name) => `${{ web: "前端", backend: "后端", "yingce-agent": "Agent" }[name]}: ${formatUpdateComponent(status.latestRelease!.components![name])}`).join("\n")}</pre> : null}
                                    <pre>{status.latestRelease.body || "本版本未填写更新日志。"}</pre>
                                </div>
                            ) : null}
                        </div>
                    </SettingsSectionCard>

                    <SettingsSectionCard layout="stacked" icon={<ShieldCheck className="size-4" />} title="更新前检查" description="所有阻断项通过后才允许切换服务。" status={{ label: status?.connected ? "更新器已连接" : "更新器未连接", color: status?.connected ? "success" : "error" }}>
                        <div className="admin-system-update-checks">
                            {(status?.checks || []).map((check) => <UpdateCheckRow key={check.key} check={check} />)}
                        </div>
                    </SettingsSectionCard>
                </div>

                <SettingsSectionCard layout="stacked" icon={<History className="size-4" />} title="更新进度" description="操作状态和日志由宿主机持久化，服务重启后仍可读取。" status={<PhaseBadge phase={status?.operation.phase ?? "idle"} customDeployment={customDeployment} />}>
                    <div className="admin-system-update-progress">
                        {status?.operation.error ? <UpdateAlert tone="error" title="本次操作失败" detail={status.operation.error} compact /> : null}
                        {(status?.operation.logs || []).length ? (
                            <ol>
                                {status?.operation.logs.map((entry, index) => (
                                    <li key={`${entry.at}-${index}`}><span className="admin-system-update-dot" data-active={index === status.operation.logs.length - 1} /><div><strong>{phaseLabel(entry.phase, customDeployment)}</strong><p>{entry.message}</p></div><time>{formatTime(entry.at)}</time></li>
                                ))}
                            </ol>
                        ) : <p className="admin-system-update-empty">检查更新后，这里会显示完整操作记录。</p>}
                    </div>
                </SettingsSectionCard>

                <SettingsSectionCard
                    layout="stacked"
                    icon={<Archive className="size-4" />}
                    title="备份与回退"
                    description={customDeployment ? "前端和 Agent 的代码回退保留业务数据；后端发布成功后的数据恢复须另行核对。" : "只使用最近一次通过 ZIP 结构与 SHA-256 校验的备份。"}
                    status={{ label: status?.lastBackup ? "备份已校验" : customDeployment && status?.rollbackVersion ? "代码可回退" : "暂无备份", color: status?.lastBackup || (customDeployment && status?.rollbackVersion) ? "success" : "warning" }}
                    footer={
                        <>
                            <span className="text-xs text-foreground/50">{customDeployment ? "此入口仅回退代码与站点发布，不恢复旧数据库。" : "人工回退同样会执行停服、数据库恢复、旧镜像启动和健康验证。"}</span>
                            <Button danger icon={<RotateCcw className="size-4" />} disabled={!status?.rollbackVersion || operationActive || checking || Boolean(loadError) || !status?.connected} onClick={requestRollback}>回退到上一版本</Button>
                        </>
                    }
                >
                    <div className="admin-system-update-backup">
                        {status?.lastBackup ? <dl><dt>备份编号</dt><dd>{status.lastBackup.id}</dd><dt>来源版本</dt><dd>{status.lastBackup.version}</dd><dt>创建时间</dt><dd>{formatDate(status.lastBackup.createdAt)}</dd><dt>文件大小</dt><dd>{formatBytes(status.lastBackup.size)}</dd><dt>SHA-256</dt><dd className="admin-monospace">{status.lastBackup.checksum}</dd></dl> : <p>{customDeployment ? "后端变更会创建数据库、素材与密钥备份；仅前端或 Agent 变更不恢复数据库。" : "首次开始更新时会自动创建数据库与数据目录 ZIP；备份失败将直接中止更新。"}</p>}
                    </div>
                </SettingsSectionCard>
            </div>
        </AdminPageFrame>
    );
}

function phaseLabel(phase: UpdatePhase, customDeployment?: boolean) {
    return phase === "no_update" && customDeployment ? "无新候选" : phaseLabels[phase];
}

function PhaseBadge({ phase, customDeployment }: { phase: UpdatePhase; customDeployment?: boolean }) {
    const tone = phase === "succeeded" || phase === "ready" ? "success" : phase === "failed" || phase === "manual_intervention" ? "error" : phase === "rolling_back" || phase === "rolled_back" ? "warning" : activePhases.has(phase) ? "info" : "neutral";
    return <AdminStatusBadge label={phaseLabel(phase, customDeployment)} tone={tone} />;
}

function UpdateCheckRow({ check }: { check: SystemUpdateStatus["checks"][number] }) {
    const Icon = check.status === "passed" ? BadgeCheck : check.status === "failed" ? AlertTriangle : Circle;
    return <div className="admin-system-update-check-row" data-status={check.status}><Icon className="size-4" /><div><strong>{check.label}</strong><p>{check.detail || "等待执行"}</p></div><span>{check.status === "passed" ? "通过" : check.status === "failed" ? "失败" : "待执行"}</span></div>;
}

function UpdateAlert({ tone, title, detail, compact = false }: { tone: "warning" | "error"; title: string; detail: string; compact?: boolean }) {
    return <div className={`admin-system-update-alert${compact ? " is-compact" : ""}`} data-tone={tone} role="alert"><AlertTriangle className="size-4" /><div><strong>{title}</strong><p>{detail}</p></div></div>;
}

function formatBytes(value: number) {
    if (!Number.isFinite(value) || value <= 0) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    return `${(value / 1024 ** index).toFixed(index > 1 ? 2 : 0)} ${units[index]}`;
}

function isReleaseVersion(value?: string) {
    return Boolean(value && /^v?\d+\.\d+\.\d+/.test(value));
}
