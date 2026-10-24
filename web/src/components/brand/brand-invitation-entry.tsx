import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button, Input } from "antd";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router";
import { ApiError } from "@/services/api/request";
import { invitationPath, validateRegistrationInvitation, type PublicRegistrationInvitation } from "@/services/api/registration-invitations";

type Props = {
    validateCode: (code: string, signal?: AbortSignal) => Promise<PublicRegistrationInvitation>;
    onAccepted: (code: string) => void;
    signal?: AbortSignal;
};
const messages: Record<string, string> = {
    invalid: "未找到有效邀请，请检查邀请码。",
    expired: "邀请已过期，请联系管理员获取新邀请。",
    revoked: "邀请已撤销，请联系管理员获取新邀请。",
    used: "该邀请已使用；已有账号可直接登录。",
};

export function BrandInvitationEntry({ validateCode, onAccepted, signal }: Props) {
    const [code, setCode] = useState("");
    const [pending, setPending] = useState(false);
    const [feedback, setFeedback] = useState<{ message: string; retry: boolean }>();
    const request = useRef(0);
    const submitting = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const id = useId();
    useEffect(() => {
        const cancel = () => { request.current++; controller.current?.abort(); };
        if (signal?.aborted) cancel();
        signal?.addEventListener("abort", cancel, { once: true });
        return () => { signal?.removeEventListener("abort", cancel); cancel(); };
    }, [signal]);
    const submit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (submitting.current || signal?.aborted) return;
        submitting.current = true;
        const current = ++request.current;
        controller.current = new AbortController();
        setPending(true); setFeedback(undefined);
        try {
            const result = await validateCode(code, controller.current.signal);
            if (current !== request.current || signal?.aborted) return;
            if (result.state === "valid") { onAccepted(code); return; }
            const message = Object.prototype.hasOwnProperty.call(messages, result.state) ? messages[result.state] : undefined;
            setFeedback({ message: message ?? "暂时无法确认邀请状态，请重试。", retry: !message });
        } catch (error) {
            if (current !== request.current) return;
            setFeedback({ message: error instanceof ApiError && error.status === 429 ? "验证次数较多，请稍后重试。" : "暂时无法验证邀请，请检查网络后重试。", retry: true });
        } finally {
            if (current === request.current) { submitting.current = false; setPending(false); }
        }
    };
    return <form onSubmit={submit} className="mc-invitation-entry space-y-5" aria-busy={pending}>
        <div className="space-y-2">
            <label htmlFor={id} className="auth-scene-label text-sm font-medium">邀请码</label>
            <Input id={id} size="large" value={code} onChange={(event) => { setCode(event.target.value); setFeedback(undefined); }} placeholder="请输入 6 位邀请码" autoComplete="off" autoCapitalize="none" spellCheck={false} minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" required disabled={pending} status={feedback && !feedback.retry ? "error" : undefined} aria-invalid={feedback && !feedback.retry ? true : undefined} aria-describedby={feedback ? `${id}-feedback` : undefined} />
        </div>
        {feedback && <p id={`${id}-feedback`} className="mc-invitation-feedback" role="alert">{feedback.message}</p>}
        <Button type="primary" htmlType="submit" size="large" block loading={pending} icon={<ArrowRight className="size-4" />} iconPlacement="end">{pending ? "正在验证邀请" : feedback?.retry ? "重新验证" : "验证邀请"}</Button>
    </form>;
}

export default function BrandInvitationPage({ signal, canNavigate }: { signal?: AbortSignal; canNavigate?: () => boolean }) {
    const navigate = useNavigate();
    return <BrandInvitationEntry signal={signal} validateCode={validateRegistrationInvitation} onAccepted={(code) => {
        if (signal?.aborted || canNavigate?.() === false) return;
        void navigate(invitationPath(code));
    }} />;
}
