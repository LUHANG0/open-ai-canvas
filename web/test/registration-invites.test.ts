import { describe, expect, test } from "bun:test";

async function read(relativePath: string) {
    return Bun.file(new URL(relativePath, import.meta.url)).text();
}

describe("registration invitation experience", () => {
    test("keeps invitation registration reachable while public registration is closed", async () => {
        const [scene, panel, register] = await Promise.all([read("../src/pages/auth/auth-scene.tsx"), read("../src/pages/auth/auth-panel.tsx"), read("../src/pages/auth/register.tsx")]);

        expect(scene).toContain("!inviteFlow && !invitedFlow");
        expect(scene).toContain("useState(inviteFlow || invitedFlow)");
        expect(panel).toContain("你已受邀加入影策");
        expect(register).toContain("exchangeRegistrationInvite(inviteToken || undefined)");
        expect(register).toContain('nextParams.delete("invite")');
        expect(register).toContain('nextParams.set("invited", "1")');
        expect(register).toContain('navigate({ pathname: "/register", search: nextParams.toString() }, { replace: true })');
        expect(register).toContain("!settings?.firstUser && !isInviteFlow");
        expect(register).toContain("邮箱可选");
    });

    test("shows understandable terminal and network states", async () => {
        const register = await read("../src/pages/auth/register.tsx");
        for (const copy of ["邀请链接无效", "邀请已过期", "邀请已使用", "邀请已撤销", "暂时无法验证邀请", "返回登录"]) {
            expect(register).toContain(copy);
        }
    });

    test("makes invitation creation primary and never re-exposes stored links", async () => {
        const [users, drawer, api] = await Promise.all([read("../src/pages/admin/users/users-panel.tsx"), read("../src/pages/admin/users/registration-invite-drawer.tsx"), read("../src/services/api/auth.ts")]);

        expect(users).toContain('<Button type="primary" icon={<Link2');
        expect(users).toContain("邀请注册");
        expect(users).toContain("\\u6dfb\\u52a0\\u7528\\u6237");
        expect(drawer).toContain("链接仅显示一次");
        expect(drawer).toContain("navigator.clipboard.writeText");
        expect(drawer).toContain("复制失败");
        expect(drawer).toContain('invite.status === "pending"');
        expect(drawer).toContain("关闭后将无法再查看该链接");
        expect(api).toContain('api.post("/admin/registration-invites", input)');
        expect(api).toContain('api.post("/auth/registration-invites/exchange"');
        expect(drawer).not.toContain("tokenHash");
    });
});
