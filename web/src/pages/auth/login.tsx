import { type FormEvent, useEffect, useState, type ReactNode } from "react";
import { App, Button, Divider, Input } from "antd";
import { ArrowRight, LockKeyhole, TriangleAlert, UserRound } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { applyUserSession } from "@/lib/user-session";
import { getAuthSession, linuxDOLoginURL, login } from "@/services/api/auth";
import { useUserStore } from "@/stores/use-user-store";
import { LinuxDOIcon, useAuthSettings } from "./auth-scene";

export default function LoginPage() {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const { message } = App.useApp();
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");
    const { settings } = useAuthSettings();
    const next = safeNext(params.get("next"));
    const user = useUserStore((state) => state.user);
    const hydrated = useUserStore((state) => state.hydrated);

    // 如果已登录，直接跳转
    useEffect(() => {
        if (hydrated && user) {
            navigate(next, { replace: true });
        }
    }, [hydrated, user, next, navigate]);

    useEffect(() => {
        const oauthError = params.get("oauth_error");
        if (oauthError) message.error(oauthError);
    }, [message, params]);

    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const submittedUsername = String(formData.get("username") ?? username).trim();
        const submittedPassword = String(formData.get("password") ?? password);
        setSubmitError("");
        setSubmitting(true);
        try {
            await login({ username: submittedUsername, password: submittedPassword });
            await applyUserSession(await getAuthSession());
            message.success("登录成功");
            navigate(next, { replace: true });
        } catch (error) {
            const reason = error instanceof Error ? error.message : "登录失败，请稍后重试";
            setSubmitError(reason);
            message.error(reason);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form onSubmit={submit} className="pc-auth-form space-y-5">
            <div className="pc-auth-credential-group">
                <AuthField label="用户名 / 邮箱">
                    <Input
                        size="large"
                        prefix={<UserRound className="pc-auth-field-icon size-4" />}
                        value={username}
                        name="username"
                        onChange={(event) => {
                            setUsername(event.target.value);
                            if (submitError) setSubmitError("");
                        }}
                        placeholder="用户名或邮箱"
                        autoComplete="username"
                        autoFocus
                        spellCheck={false}
                        aria-invalid={Boolean(submitError)}
                        aria-describedby={submitError ? "login-error" : undefined}
                        required
                    />
                </AuthField>
                <AuthField label="密码">
                    <Input.Password
                        size="large"
                        prefix={<LockKeyhole className="pc-auth-field-icon size-4" />}
                        value={password}
                        name="password"
                        onChange={(event) => {
                            setPassword(event.target.value);
                            if (submitError) setSubmitError("");
                        }}
                        placeholder="请输入密码"
                        autoComplete="current-password"
                        aria-invalid={Boolean(submitError)}
                        aria-describedby={submitError ? "login-error" : undefined}
                        required
                    />
                </AuthField>
            </div>
            {submitError ? (
                <div id="login-error" className="pc-auth-login-error" role="alert">
                    <TriangleAlert className="size-4" aria-hidden="true" />
                    <span>{submitError}</span>
                </div>
            ) : null}
            <Button className="pc-auth-submit" type="primary" htmlType="submit" size="large" block loading={submitting} disabled={submitting} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                登录
            </Button>
            {settings?.linuxdoEnabled ? (
                <>
                    <Divider plain className="pc-auth-divider">
                        或
                    </Divider>
                    <Button className="pc-auth-oauth" size="large" block icon={<LinuxDOIcon />} href={linuxDOLoginURL(next)}>
                        使用 Linux.do 登录
                    </Button>
                </>
            ) : null}
        </form>
    );
}

function AuthField({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="pc-auth-field block space-y-2">
            <span className="pc-auth-field-label">{label}</span>
            {children}
        </label>
    );
}

function safeNext(value: string | null) {
    if (!value || !value.startsWith("/") || value.startsWith("//")) return "/create";
    return value;
}
