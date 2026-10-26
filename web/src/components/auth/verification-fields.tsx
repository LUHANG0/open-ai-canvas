import { useEffect, useId, useRef, useState } from "react";
import { App, Button, Input } from "antd";
import { startVerification, type VerificationDraft, type VerificationMethod, type VerificationPurpose } from "@/services/api/verification";

import { isHumanVerificationRequired } from "@/services/api/turnstile";
import { HumanVerification, type HumanVerificationHandle } from "./human-verification";

// 验证码输入框与「获取验证码」按钮同排显示：按钮贴右侧、竖线分隔。
// 倒计时文案长度变化会撑动按钮宽度，因此按钮用 tabular-nums + nowrap 固定视觉节奏，
// 输入框通过 flex: 1 吸收剩余宽度，避免每次倒计时跳一下布局。
function CodeField({ label, value, onChange, onSend, sending, remaining, targetReady, disabled, placeholder, autoComplete, inputMode, sendLabel }: {
    label: string; value: string; onChange: (next: string) => void;
    onSend: () => void; sending: boolean; remaining: number; targetReady: boolean;
    disabled: boolean; placeholder: string; autoComplete: string; inputMode: "text" | "email" | "tel" | "numeric"; sendLabel: string;
}) {
    const inputId = useId();
    const counting = remaining > 0;
    const blocked = disabled || sending || counting || !targetReady;
    return (
        <div className="space-y-2">
            <label htmlFor={inputId} className="auth-scene-label block text-sm font-medium">{label}</label>
            <span className={`auth-code-field${sending ? " is-busy" : ""}`}>
                <Input
                    id={inputId}
                    size="large"
                    variant="borderless"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    placeholder={placeholder}
                    disabled={disabled || sending}
                />
                <Button
                    className="auth-code-send"
                    size="large"
                    type="text"
                    data-counting={counting ? "true" : "false"}
                    loading={sending}
                    disabled={blocked}
                    onClick={onSend}
                >
                    {counting ? `${remaining} 秒后重发` : sendLabel}
                </Button>
            </span>
        </div>
    );
}

export function VerificationFields({ purpose, method, value, onChange, disabled = false, password, invitationCode }: {
    purpose: VerificationPurpose; method: VerificationMethod; value: VerificationDraft;
    onChange: (value: VerificationDraft) => void; disabled?: boolean; password?: string; invitationCode?: string;
}) {
    const { message } = App.useApp();
    const [sending, setSending] = useState(false);
    const [remaining, setRemaining] = useState(0);
    const inFlight = useRef(false);
    const humanVerification = useRef<HumanVerificationHandle>(null);
    const sms = method !== "email", email = method !== "sms";
    useEffect(() => {
        if (!remaining) return;
        const timer = window.setTimeout(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
        return () => window.clearTimeout(timer);
    }, [remaining]);
    const changeTarget = (key: "email" | "phone", target: string) => { humanVerification.current?.reset(); onChange({ ...value, [key]: target, ticket: "", emailCode: "", smsCode: "" }); };
    const send = async () => {
        if (inFlight.current || remaining > 0) return;
        if ((sms && !value.phone.trim()) || (email && !value.email.trim()) || (purpose === "bind" && !password)) {
            message.warning("请先填写联系方式及必要的当前密码"); return;
        }
        inFlight.current = true; setSending(true);
        let deliveryStarted = false;
        try {
            const turnstileToken = await humanVerification.current?.verify();
            // Delivery failures may be ambiguous; only start cooldown after human verification.
            setRemaining(60);
            deliveryStarted = true;
            const result = await startVerification({ purpose, method, turnstileToken, email: email ? value.email.trim() : undefined, phone: sms ? value.phone.trim() : undefined, password, ...(invitationCode ? { invitationCode } : {}) });
            onChange({ ...value, email: email ? value.email.trim().toLowerCase() : "", phone: sms ? value.phone.trim() : "", emailCode: "", smsCode: "", ticket: result.ticket });
            setRemaining(result.retryAfter);
            message.success(purpose === "login" ? "如该联系方式已验证且账号可用，验证码将发送至该联系方式" : "验证码已发送，10 分钟内有效");
        } catch (error) {
            if (isHumanVerificationRequired(error)) setRemaining(0);
            else if (deliveryStarted) onChange({ ...value, ticket: "", emailCode: "", smsCode: "" });
            message.error(error instanceof Error ? error.message : "发送失败，请稍后重试");
        }
        finally { setSending(false); inFlight.current = false; }
    };
    const sendLabel = method === "sms_email" ? "获取验证码" : "获取验证码";
    return <div className="space-y-4">
        {sms && <label className="block space-y-2"><span className="auth-scene-label text-sm font-medium">手机号</span><Input size="large" value={value.phone} onChange={(e) => changeTarget("phone", e.target.value)} autoComplete="tel" inputMode="tel" placeholder="中国大陆手机号，支持 +86" required disabled={disabled || sending} /></label>}
        {email && <label className="block space-y-2"><span className="auth-scene-label text-sm font-medium">邮箱</span><Input size="large" type="email" value={value.email} onChange={(e) => changeTarget("email", e.target.value)} autoComplete="email" placeholder="请输入邮箱" required disabled={disabled || sending} /></label>}
        <HumanVerification ref={humanVerification} action={purpose === "register" ? "register" : "code_login"} active={purpose !== "bind"} />
        {/* 双通道（sms_email）一次请求同时下发两种验证码，此时按钮文案不区分通道。 */}
        {(sms || email) && (
            <CodeField
                label={method === "sms_email" ? "验证码" : sms ? "短信验证码" : "邮件验证码"}
                value={method === "sms_email" ? value.smsCode : sms ? value.smsCode : value.emailCode}
                onChange={(next) => {
                    const code = next.replace(/\D/g, "").slice(0, 6);
                    if (method === "sms_email" || sms) onChange({ ...value, smsCode: code, ...(method === "sms_email" ? { emailCode: code } : {}) });
                    else onChange({ ...value, emailCode: code });
                }}
                onSend={() => void send()}
                sending={sending}
                remaining={remaining}
                // 按钮在联系方式为空时保持禁用，避免用户点了才发现没填邮箱/手机号。
                targetReady={(sms ? Boolean(value.phone.trim()) : true) && (email ? Boolean(value.email.trim()) : true) && (purpose !== "bind" || Boolean(password))}
                disabled={disabled}
                placeholder="6 位数字验证码"
                autoComplete="one-time-code"
                inputMode="numeric"
                sendLabel={sendLabel}
            />
        )}
        {method === "sms_email" && <p className="auth-scene-muted m-0 text-xs leading-5">两项验证必须在本次注册中同时通过；修改联系方式后需要重新获取。</p>}
    </div>;
}
