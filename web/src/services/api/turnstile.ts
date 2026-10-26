import { http } from "./request";

export type HumanVerificationAction = "register" | "password_reset" | "code_login" | "login";
export type PublicTurnstileConfig = {
    enabled: boolean;
    siteKey: string;
    registration: boolean;
    passwordReset: boolean;
    codeLogin: boolean;
    passwordLogin: boolean;
};
export type TurnstileSetting = PublicTurnstileConfig & {
    revision: number;
    hasSecretKey: boolean;
    hostnames: string[];
    loginFailureThreshold: number;
};

export function getPublicTurnstileConfig(signal?: AbortSignal) {
    return http.get<{ turnstile?: PublicTurnstileConfig }>("/auth/settings", { signal, timeout: 8000 });
}
export function getTurnstileSetting() {
    return http.get<{ setting: TurnstileSetting }>("/admin/settings/turnstile");
}
export function saveTurnstileSetting(input: Omit<TurnstileSetting, "hasSecretKey"> & { secretKey: string }) {
    return http.patch<{ setting: TurnstileSetting }>("/admin/settings/turnstile", input);
}

export function isHumanVerificationRequired(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "details" in error && (error.details as Record<string, unknown> | undefined)?.humanVerificationRequired === true);
}

export function protectsHumanAction(config: PublicTurnstileConfig | undefined, action: HumanVerificationAction): boolean {
    if (!config?.enabled) return false;
    return { register: config.registration, password_reset: config.passwordReset, code_login: config.codeLogin, login: config.passwordLogin }[action];
}
