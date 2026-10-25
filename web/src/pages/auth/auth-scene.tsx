import { useLocation, useNavigate, useParams } from "react-router";
import BrandAuthDialog from "@/components/brand/brand-auth-dialog";
import { type BrandAuthMode } from "@/components/brand/brand-auth-entry";
import { safeAuthNext } from "@/lib/auth-navigation";

export function AuthScene() {
    const location = useLocation();
    const navigate = useNavigate();
    const { code } = useParams();
    const mode: BrandAuthMode = location.pathname.startsWith("/i/") ? "invitation" : location.pathname === "/register" ? "register" : location.pathname === "/forgot-password" ? "forgot-password" : "login";
    const next = safeAuthNext(new URLSearchParams(location.search).get("next"));
    return <BrandAuthDialog
        key={mode === "invitation" ? `invitation:${code}` : "account"}
        next={next}
        routeMode={mode}
        onModeChange={(target) => { if (target !== mode) void navigate({ pathname: `/${target}`, search: location.search, hash: location.hash }, { replace: true, state: location.state }); }}
        onClosed={() => {
            void navigate("/", { replace: true });
            const active = document.activeElement;
            if (!active || active === document.body || active.closest(".mc-auth-layer")) document.querySelector<HTMLElement>(".mc-nav-actions a")?.focus({ preventScroll: true });
        }}
    />;
}
