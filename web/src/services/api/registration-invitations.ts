import { http } from "./request";
import type { getAuthSettings } from "./auth";

export type InvitationState = "valid" | "expired" | "revoked" | "used" | "invalid";
export type PublicRegistrationInvitation = {
    state: InvitationState;
    bonusMicrocredits?: number;
    settings?: Awaited<ReturnType<typeof getAuthSettings>>;
};
export type RegistrationInvitation = {
    id: string; code: string; note: string; bonusMicrocredits: number; state: InvitationState;
    createdAt: string; expiresAt: string; revokedAt?: string; usedAt?: string;
    usedByUserId?: string; usedByUsername?: string;
};
export const invitationStateLabels: Record<InvitationState, string> = {
    valid: "待使用", expired: "已过期", revoked: "已撤销", used: "已使用", invalid: "无效",
};
export const invitationStateMessages: Record<Exclude<InvitationState, "valid">, string> = {
    expired: "邀请已失效，请联系管理员获取新邀请。",
    revoked: "邀请已失效，请联系管理员获取新邀请。",
    used: "该邀请已使用，已有账号可直接登录。",
    invalid: "未找到有效邀请，请检查链接。",
};
export function invitationPath(code: string) { return `/i/${encodeURIComponent(code)}`; }
export function validateRegistrationInvitation(code: string, signal?: AbortSignal) {
    return http.post<PublicRegistrationInvitation>("/auth/invitation/validate", { code }, { signal });
}
export function listRegistrationInvitations(page = 1, pageSize = 20) {
    return http.get<{ invitations: RegistrationInvitation[]; total: number }>("/admin/registration-invitations", { params: { page, pageSize } });
}
export function createRegistrationInvitation(input: { note: string; bonusMicrocredits: number; expiresInDays: number }) {
    return http.post<{ invitation: RegistrationInvitation }>("/admin/registration-invitations", input);
}
export function revokeRegistrationInvitation(id: string) {
    return http.post<{ ok: boolean }>(`/admin/registration-invitations/${encodeURIComponent(id)}/revoke`);
}
