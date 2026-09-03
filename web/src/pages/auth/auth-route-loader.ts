import type { ComponentType } from "react";

export type AuthMode = "login" | "register";
export type AuthPageComponent = ComponentType;
export type AuthPages = Record<AuthMode, AuthPageComponent>;

const pageCache: Partial<AuthPages> = {};
const pageRequests: Partial<Record<AuthMode, Promise<AuthPageComponent>>> = {};

const pageLoaders = {
    login: () => import("./login"),
    register: () => import("./register"),
} satisfies Record<AuthMode, () => Promise<{ default: AuthPageComponent }>>;

export function loadAuthPage(mode: AuthMode) {
    const cachedPage = pageCache[mode];
    if (cachedPage) return Promise.resolve(cachedPage);

    const pendingPage = pageRequests[mode];
    if (pendingPage) return pendingPage;

    const request = pageLoaders[mode]()
        .then((module) => {
            pageCache[mode] = module.default;
            return module.default;
        })
        .finally(() => {
            delete pageRequests[mode];
        });
    pageRequests[mode] = request;
    return request;
}

export async function preloadAuthPages(): Promise<AuthPages> {
    const [login, register] = await Promise.all([loadAuthPage("login"), loadAuthPage("register")]);
    return { login, register };
}

export function getCachedAuthPages(): Partial<AuthPages> {
    return { ...pageCache };
}
