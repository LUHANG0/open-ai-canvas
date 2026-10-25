import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { App } from "antd";
import { useLocation, useNavigate } from "react-router";
import { loadLoginPage } from "@/lib/auth-route-modules";

export type BrandAuthMode = "login" | "register" | "forgot-password" | "invitation";
export const BrandAuthFlow = createContext<{ next: string; changeMode: (mode: BrandAuthMode) => void } | null>(null);
const BrandAuthEntry = createContext<{ open: (href: string) => void; pending: boolean } | null>(null);
export const useBrandAuthEntry = () => useContext(BrandAuthEntry);
export const useBrandAuthFlow = () => useContext(BrandAuthFlow);

export function BrandAuthProvider({ children }: { children: ReactNode }) {
    const location = useLocation();
    const navigate = useNavigate();
    const [pending, setPending] = useState(false);
    const request = useRef(0);
    const { message } = App.useApp();
    useEffect(() => { request.current++; setPending(false); return () => { request.current++; }; }, [location.key]);
    const open = async (href: string) => {
        const url = new URL(href, window.location.origin);
        if (url.origin !== window.location.origin || url.pathname !== "/login") return;
        const id = ++request.current;
        setPending(true);
        try {
            await loadLoginPage();
            if (id !== request.current) return;
            void navigate({ pathname: url.pathname, search: url.search, hash: url.hash });
        } catch { if (id === request.current) message.error("登录窗口暂时无法打开，请重试。"); }
        finally { if (id === request.current) setPending(false); }
    };
    return <BrandAuthEntry.Provider value={{ open: (href) => { void open(href); }, pending }}>
        {children}
    </BrandAuthEntry.Provider>;
}
