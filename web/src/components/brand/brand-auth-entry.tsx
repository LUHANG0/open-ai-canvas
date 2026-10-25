import { createContext, useContext, type ReactNode } from "react";
import { useNavigate } from "react-router";

export type BrandAuthMode = "login" | "register" | "forgot-password" | "invitation";
export const BrandAuthFlow = createContext<{ next: string; changeMode: (mode: BrandAuthMode) => void } | null>(null);
const BrandAuthEntry = createContext<{ open: (href: string, state?: unknown) => void; pending: boolean } | null>(null);
export const useBrandAuthEntry = () => useContext(BrandAuthEntry);
export const useBrandAuthFlow = () => useContext(BrandAuthFlow);

export function BrandAuthProvider({ children }: { children: ReactNode }) {
    const navigate = useNavigate();
    const open = (href: string, state?: unknown) => {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname !== "/login") return;
        // The dialog owns loading and retry feedback. Never gate opening it on a chunk request.
        void navigate({ pathname: url.pathname, search: url.search, hash: url.hash }, { state });
    };
    return <BrandAuthEntry.Provider value={{ open, pending: false }}>{children}</BrandAuthEntry.Provider>;
}
