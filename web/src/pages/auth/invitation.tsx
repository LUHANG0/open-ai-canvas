import { useEffect, useState } from "react";
import { Button } from "antd";
import { Link, useParams, useSearchParams } from "react-router";
import { getAuthSession, logout } from "@/services/api/auth";
import { invitationPath, invitationStateMessages, validateRegistrationInvitation, type PublicRegistrationInvitation } from "@/services/api/registration-invitations";
import { loginPath, safeAuthNext } from "@/lib/auth-navigation";
import { formatCredits } from "@/constant/credits";
import { AuthFormPending } from "./auth-form-pending";
import RegisterPage from "./register";
import { RegistrationInvitationContext } from "./invitation-context";

export default function InvitationPage() {
    const { code = "" } = useParams();
    const [params] = useSearchParams();
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const [member, setMember] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState("");
    const [invitation, setInvitation] = useState<PublicRegistrationInvitation | null>(null);
    const destination = invitationPath(code) + (params.has("next") ? `?next=${encodeURIComponent(safeAuthNext(params.get("next")))}` : "");
    const login = loginPath(destination);

    useEffect(() => {
        let active = true;
        const controller = new AbortController();
        setLoading(true); setError(""); setInvitation(null);
        void Promise.all([validateRegistrationInvitation(code, controller.signal), getAuthSession().then((session) => {
            if (active) setMember(Boolean(session.user));
            return session;
        })]).then(([value, session]) => {
            if (!active) return;
            setInvitation(value); setMember(Boolean(session.user));
        }).catch(() => { if (active) setError("暂时无法验证邀请，请检查网络后重试。"); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; controller.abort(); };
    }, [code, retry]);

    const switchAccount = async () => {
        if (switching) return;
        setSwitching(true); setError("");
        try {
            await logout();
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            setMember(false);
        } catch { setError("暂时无法切换账号，请重试。"); }
        finally { setSwitching(false); }
    };

    if (loading) return <AuthFormPending fields={4} message="正在验证邀请" />;
    if (member) return <div className="space-y-5">
        <p role="status">你已登录，无需注册。</p>
        {error && <p role="alert">{error}</p>}
        <Button type="primary" size="large" block href="/create">进入工作台</Button>
        <Button size="large" block loading={switching} onClick={() => void switchAccount()}>切换账号</Button>
    </div>;
    if (error) return <div className="space-y-4"><p role="alert">{error}</p><Button onClick={() => setRetry((n) => n + 1)}>重试</Button><p><Link className="auth-scene-link" to={login}>已有账号？登录</Link></p></div>;
    if (!invitation || invitation.state !== "valid" || !invitation.settings || invitation.bonusMicrocredits === undefined) {
        const state = invitation?.state;
        return <div className="space-y-4"><p role="status">{state && state !== "valid" ? invitationStateMessages[state] : "暂时无法验证邀请，请重试。"}</p><Link className="auth-scene-link" to={login}>已有账号？登录</Link></div>;
    }
    return <RegistrationInvitationContext.Provider value={{ code, settings: invitation.settings, bonusMicrocredits: invitation.bonusMicrocredits, reload: () => setRetry((n) => n + 1) }}>
        {invitation.bonusMicrocredits > 0 && <p className="auth-scene-link mb-5" role="status">注册成功后获赠 <strong>{formatCredits(invitation.bonusMicrocredits)} 积分</strong></p>}
        <RegisterPage key={code} />
        <p className="auth-scene-muted mt-5 text-center text-sm">已有账号？<Link className="auth-scene-link ml-1" to={login}>登录</Link></p>
    </RegistrationInvitationContext.Provider>;
}
