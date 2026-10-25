import { type FormEvent, useEffect, useState, type ReactNode } from "react";
import { App, Button, Divider, Input } from "antd";
import { SegmentedControl } from "@/components/ui/base/segmented-control";
import { LockKeyhole, UserRound } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { getAuthSession, getAuthSettings, linuxDOLoginURL, login } from "@/services/api/auth";
import { LinuxDOIcon } from "./auth-provider-icon";
import { VerificationFields } from "@/components/auth/verification-fields";
import { authEntry, clearAuthNavigation, safeAuthNext } from "@/lib/auth-navigation";
import { useBrandAuthFlow } from "@/components/brand/brand-auth-entry";
import { emptyVerification, loginVerification, methodLabels, verificationMethods, type VerificationMethod } from "@/services/api/verification";

export default function LoginPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const flow = useBrandAuthFlow();
    const { message } = App.useApp();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [linuxdoEnabled, setLinuxdoEnabled] = useState(false);
    const [settingsError, setSettingsError] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const [methods, setMethods] = useState<VerificationMethod[]>([]);
    const [method, setMethod] = useState<"password" | VerificationMethod>("password");
    const [verification, setVerification] = useState({ ...emptyVerification });
    const next = safeAuthNext(flow?.next ?? params.get("next"));
    const forgotPasswordEntry = authEntry(next, "/forgot-password");

    useEffect(() => {
        void getAuthSettings()
            .then((settings) => { setSettingsError(false); setLinuxdoEnabled(settings.linuxdoEnabled); setMethods(verificationMethods(settings, "login")); })
            .catch(() => {
                setSettingsError(true);
            });
        const oauthError = params.get("oauth_error");
        if (oauthError) message.error(oauthError);
    }, [message, params]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitError("");
        setSubmitting(true);
        try {
            if (method === "password") await login({ username, password });
            else {
                if (!verification.ticket) throw new Error("请先获取本次登录验证码");
                await loginVerification(verification);
            }
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            message.success("登录成功");
            clearAuthNavigation();
            navigate(next, { replace: true });
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : "登录失败，请重试。");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="mc-login-form">
            {settingsError && <p className="mc-login-feedback" role="status">其他登录方式暂不可用，仍可使用账号密码登录。</p>}
            {methods.length > 0 && <SegmentedControl block ariaLabel="登录方式" value={method} disabled={submitting} options={[{ value: "password", label: "密码登录" }, ...methods.map((value) => ({ value, label: methodLabels[value] }))]} onChange={(value) => { setMethod(value as typeof method); setVerification({ ...emptyVerification }); setSubmitError(""); }} />}
            {method !== "password" ? <VerificationFields key={method} purpose="login" method={method} value={verification} onChange={(value) => { setVerification(value); setSubmitError(""); }} disabled={submitting} /> : <>
            <AuthField label="用户名 / 邮箱" htmlFor="login-account">
                <Input id="login-account" size="large" prefix={<UserRound className="auth-scene-icon size-4" />} value={username} onChange={(event) => { setUsername(event.target.value); setSubmitError(""); }} placeholder="用户名或邮箱" autoComplete="username" required />
            </AuthField>
            <AuthField
                label="密码"
                htmlFor="login-password"
                action={
                    <Link
                        {...forgotPasswordEntry}
                        onClick={(event) => { if (flow && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.button === 0) { event.preventDefault(); flow.changeMode("forgot-password"); } }}
                        viewTransition
                        className="auth-scene-link -my-2 inline-flex min-h-8 items-center rounded-sm text-xs font-medium transition-colors duration-150 motion-reduce:transition-none"
                    >
                        忘记密码？
                    </Link>
                }
            >
                <Input.Password
                    id="login-password"
                    size="large"
                    prefix={<LockKeyhole className="auth-scene-icon size-4" />}
                    value={password}
                    onChange={(event) => { setPassword(event.target.value); setSubmitError(""); }}
                    placeholder="请输入密码"
                    autoComplete="current-password"
                    required
                />
            </AuthField>
            </>}
            {submitError && <p className="mc-login-feedback" data-error role="alert">{submitError}</p>}
            <Button type="primary" htmlType="submit" size="large" block loading={submitting} disabled={method === "password" ? !username.trim() || !password : !verification.ticket || !(method === "email" ? verification.emailCode : verification.smsCode)}>
                登录
            </Button>
            {linuxdoEnabled ? (
                <>
                    <Divider plain className="auth-scene-divider">
                        其他登录方式
                    </Divider>
                    <Button size="large" block icon={<LinuxDOIcon />} href={linuxDOLoginURL(next)}>
                        使用 Linux.do 登录
                    </Button>
                </>
            ) : null}
        </form>
    );
}
function AuthField({ label, htmlFor, action, children }: { label: string; htmlFor: string; action?: ReactNode; children: ReactNode }) {
    return (
        <div className="mc-login-field">
            <div className="mc-login-field-heading">
                <label htmlFor={htmlFor} className="auth-scene-label text-sm font-medium">
                    {label}
                </label>
                {action}
            </div>
            {children}
        </div>
    );
}
