let login: ReturnType<typeof importLogin> | undefined;
let register: ReturnType<typeof importRegister> | undefined;
let recovery: ReturnType<typeof importRecovery> | undefined;
let invitation: ReturnType<typeof importInvitation> | undefined;
const importLogin = () => import("@/pages/auth/login");
const importRegister = () => import("@/pages/auth/register");
const importRecovery = () => import("@/pages/auth/forgot-password");
const importInvitation = () => import("@/pages/auth/invitation");

export const loadLoginPage = () => login ??= importLogin().catch((error) => { login = undefined; throw error; });
export const loadRegisterPage = () => register ??= importRegister().catch((error) => { register = undefined; throw error; });
export const loadForgotPasswordPage = () => recovery ??= importRecovery().catch((error) => { recovery = undefined; throw error; });
export const loadInvitationPage = () => invitation ??= importInvitation().catch((error) => { invitation = undefined; throw error; });

export function preloadAuthRoute(href: string) {
    const path = href.split(/[?#]/, 1)[0];
    const load = path === "/login" ? loadLoginPage : path === "/register" ? loadRegisterPage : path === "/forgot-password" ? loadForgotPasswordPage : path.startsWith("/i/") ? loadInvitationPage : undefined;
    // A failed speculative load still reaches the normal route error boundary on navigation.
    if (load) void load().catch(() => undefined);
}
