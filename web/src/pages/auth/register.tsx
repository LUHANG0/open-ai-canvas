import { type FormEvent, useEffect, useState, type ReactNode } from "react";
import { App, Button, Divider, Input } from "antd";
import { ArrowRight, Info, LockKeyhole, Mail, ShieldCheck, TriangleAlert, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { applyUserSession } from "@/lib/user-session";
import { getAuthSession, linuxDOLoginURL, register, sendRegistrationEmailCode } from "@/services/api/auth";
import { LinuxDOIcon, useAuthSettings } from "./auth-scene";

export default function RegisterPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { message } = App.useApp();
    const { settings, loading: settingsLoading, error: settingsError, refresh } = useAuthSettings();
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [emailCode, setEmailCode] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const next = safeNext(params.get("next"));

    useEffect(() => {
        if (countdown <= 0) return;
        const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
        return () => window.clearInterval(timer);
    }, [countdown]);

    const sendCode = async () => {
        if (!email.trim()) {
            message.warning("请先输入邮箱");
            return;
        }
        setSendingCode(true);
        try {
            await sendRegistrationEmailCode(email.trim());
            setCountdown(60);
            message.success("验证码已发送，请检查邮箱");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "发送验证码失败");
        } finally {
            setSendingCode(false);
        }
    };

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (password !== confirmPassword) {
            message.error("两次输入的密码不一致");
            return;
        }
        setSubmitting(true);
        try {
            await register({ username, email, emailCode, displayName, password });
            await applyUserSession(await getAuthSession());
            if (!settings?.firstUser) window.sessionStorage.setItem("infinite-canvas:model-setup-guide", "1");
            message.success(settings?.firstUser ? "管理员账号已创建" : "注册成功");
            navigate(next, { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setSubmitting(false);
        }
    };

    const registrationClosed = settings?.registrationEnabled === false;
    const mailUnavailable = Boolean(settings && !settings.firstUser && settings.emailCodeRequired && !settings.emailEnabled);
    const disabled = settingsLoading || registrationClosed || mailUnavailable || !settings;
    const requireCode = Boolean(settings && !settings.firstUser && settings.emailCodeRequired);
    const goToLogin = () => {
        const query = params.toString();
        navigate(`/login${query ? `?${query}` : ""}`);
    };

    if (settingsLoading && !settings) {
        return (
            <div className="pc-auth-state-panel" aria-busy="true" aria-live="polite">
                <span className="pc-auth-state-spinner" aria-hidden="true" />
                <h3>正在准备注册空间</h3>
                <p>正在读取账号创建与邮箱验证设置。</p>
            </div>
        );
    }

    if (settingsError && !settings) {
        return (
            <div className="pc-auth-state-panel" role="alert">
                <TriangleAlert aria-hidden="true" />
                <h3>暂时无法读取注册设置</h3>
                <p>本地服务可能尚未就绪，请重试；现有账号仍可返回登录。</p>
                <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={() => void refresh()}>重新读取</Button>
                    <Button type="primary" onClick={goToLogin}>
                        返回登录
                    </Button>
                </div>
            </div>
        );
    }

    if (registrationClosed || mailUnavailable) {
        return (
            <div className="pc-auth-state-panel" role="status">
                <TriangleAlert aria-hidden="true" />
                <h3>{registrationClosed ? "当前未开放注册" : "邮箱注册暂不可用"}</h3>
                <p>{registrationClosed ? "管理员已关闭普通账号注册，请使用已有账号登录。" : "管理员尚未配置注册邮件，请先使用已有账号登录，或联系管理员完善邮件服务。"}</p>
                <Button className="pc-auth-submit" type="primary" icon={<ArrowRight className="size-4" />} iconPlacement="end" onClick={goToLogin}>
                    返回登录
                </Button>
            </div>
        );
    }

    return (
        <form onSubmit={submit} className="pc-auth-form pc-auth-register-form space-y-4">
            {settings?.firstUser ? (
                <Notice icon={<Info className="size-3.5" />} tone="blue">
                    首个账号自动成为管理员，邮箱验证码暂不要求。
                </Notice>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
                <AuthField label="用户名">
                    <Input
                        size="large"
                        prefix={<UserRound className="pc-auth-field-icon size-4 text-white/35" />}
                        value={username}
                        onChange={(event) => setUsername(event.target.value)}
                        placeholder="3-32 位字符"
                        autoComplete="username"
                        required
                        disabled={disabled}
                    />
                </AuthField>
                <AuthField label="显示名称">
                    <Input size="large" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="不填则使用用户名" disabled={disabled} />
                </AuthField>
            </div>

            <AuthField label="邮箱">
                <Input
                    size="large"
                    prefix={<Mail className="pc-auth-field-icon size-4 text-white/35" />}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="用于登录与安全验证"
                    autoComplete="email"
                    required={!settings?.firstUser}
                    disabled={disabled}
                />
            </AuthField>

            {requireCode ? (
                <AuthField label="邮箱验证码">
                    <div className="grid grid-cols-[minmax(0,1fr)_116px] gap-2">
                        <Input
                            size="large"
                            prefix={<ShieldCheck className="pc-auth-field-icon size-4 text-white/35" />}
                            value={emailCode}
                            onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="6 位验证码"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            required
                            disabled={disabled}
                        />
                        <Button size="large" loading={sendingCode} disabled={disabled || countdown > 0} onClick={() => void sendCode()}>
                            {countdown > 0 ? `${countdown}s` : "获取验证码"}
                        </Button>
                    </div>
                </AuthField>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
                <AuthField label="密码">
                    <Input.Password
                        size="large"
                        prefix={<LockKeyhole className="pc-auth-field-icon size-4 text-white/35" />}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="至少 8 位"
                        autoComplete="new-password"
                        required
                        disabled={disabled}
                    />
                </AuthField>
                <AuthField label="确认密码">
                    <Input.Password
                        size="large"
                        prefix={<LockKeyhole className="pc-auth-field-icon size-4 text-white/35" />}
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        placeholder="再次输入密码"
                        autoComplete="new-password"
                        required
                        disabled={disabled}
                    />
                </AuthField>
            </div>

            <div className={`pc-auth-password-status${confirmPassword && password !== confirmPassword ? " is-mismatch" : confirmPassword && password === confirmPassword ? " is-match" : ""}`} aria-live="polite">
                <ShieldCheck className="size-3.5" aria-hidden="true" />
                <span>{confirmPassword ? (password === confirmPassword ? "两次密码已一致" : "两次输入的密码不一致") : "密码建议使用 8 位以上字母、数字或符号"}</span>
            </div>

            <Button className="pc-auth-submit" type="primary" htmlType="submit" size="large" block loading={submitting} disabled={disabled} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                创建账号
            </Button>
            {settings?.linuxdoEnabled ? (
                <>
                    <Divider plain className="pc-auth-divider !border-white/10 !text-white/30">
                        或
                    </Divider>
                    <Button className="pc-auth-oauth" size="large" block icon={<LinuxDOIcon />} href={linuxDOLoginURL(next)}>
                        使用 Linux.do 注册 / 登录
                    </Button>
                </>
            ) : null}
        </form>
    );
}

function AuthField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="pc-auth-field block space-y-2">
            <span className="pc-auth-field-label text-xs font-medium text-white/62">{label}</span>
            {children}
        </label>
    );
}

function Notice({ icon, tone, children }: { icon: ReactNode; tone: "blue" | "amber"; children: ReactNode }) {
    return (
        <div
            className={`pc-auth-notice is-${tone} flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs leading-5 ${tone === "blue" ? "border-blue-300/15 bg-blue-300/[0.06] text-blue-100/78" : "border-amber-300/15 bg-amber-300/[0.06] text-amber-100/78"}`}
            role={tone === "amber" ? "status" : undefined}
        >
            <span className="mt-0.5 shrink-0">{icon}</span>
            {children}
        </div>
    );
}

function safeNext(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/create";
    return value;
}
