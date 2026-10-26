import { useEffect, useState } from "react";
import { Button } from "antd";
import { Link, useParams } from "react-router";
import { getAuthSession, logout } from "@/services/api/auth";
import { invitationPath, invitationStateMessages, validateRegistrationInvitation, type PublicRegistrationInvitation } from "@/services/api/registration-invitations";
import { authEntry, clearAuthNavigation } from "@/lib/auth-navigation";
import { formatCredits } from "@/constant/credits";
import { AuthFormPending } from "./auth-form-pending";
import RegisterPage from "./register";
import { RegistrationInvitationContext } from "./invitation-context";

export default function InvitationPage() {
    const { code = "" } = useParams();
    const [retry, setRetry] = useState(0);
    const [loading, setLoading] = useState(true);
    const [member, setMember] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState("");
    const [invitation, setInvitation] = useState<PublicRegistrationInvitation | null>(null);
    const loginEntry = authEntry(invitationPath(code));
    const refreshSettings = async () => {
        const value = await validateRegistrationInvitation(code);
        setInvitation(value);
    };

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
            clearAuthNavigation();
            const { applyUserSession } = await import("@/lib/user-session");
            await applyUserSession(await getAuthSession());
            setMember(false);
        } catch { setError("暂时无法切换账号，请重试。"); }
        finally { setSwitching(false); }
    };

    if (loading) return <AuthFormPending fields={4} message="正在验证邀请" />;
    if (member) return <div className="mc-invitation-state">
        <p role="status">你已登录，无需注册。</p>
        {error && <p role="alert">{error}</p>}
        <Button type="primary" size="large" block href="/create">进入工作台</Button>
        <Button size="large" block loading={switching} onClick={() => void switchAccount()}>切换账号</Button>
    </div>;
    if (error) return <div className="mc-invitation-state"><p role="alert">{error}</p><Button onClick={() => setRetry((n) => n + 1)}>重试</Button><p><Link className="auth-scene-link" {...loginEntry}>已有账号？登录</Link></p></div>;
    if (!invitation || invitation.state !== "valid" || !invitation.settings || invitation.bonusMicrocredits === undefined) {
        const state = invitation?.state;
        return <div className="mc-invitation-state"><p role="status">{state && state !== "valid" ? invitationStateMessages[state] : "暂时无法验证邀请，请重试。"}</p><Link className="auth-scene-link" {...loginEntry}>已有账号？登录</Link></div>;
    }
    return <RegistrationInvitationContext.Provider value={{ code, settings: invitation.settings, bonusMicrocredits: invitation.bonusMicrocredits, reload: () => setRetry((n) => n + 1), refreshSettings }}>
        <div className="mc-invitation-registration">
            <div className="mc-invitation-confirmed"><span className="mc-invitation-status-dot" aria-hidden="true" /><span>邀请已确认</span><span>完成注册，开启创作</span></div>
            {invitation.bonusMicrocredits > 0 && <p className="mc-invitation-welcome" role="status"><span>创作见面礼<small>注册后赠送</small></span><strong>{formatCredits(invitation.bonusMicrocredits)} 积分</strong></p>}
            <RegisterPage key={code} />
            <p className="mc-invitation-login">已有账号？<Link className="auth-scene-link" {...loginEntry}>登录</Link></p>
        </div>
    </RegistrationInvitationContext.Provider>;
}
