import { useLocation, useNavigate, useParams } from "react-router";
import BrandAuthDialog from "@/components/brand/brand-auth-dialog";
import { type BrandAuthMode } from "@/components/brand/brand-auth-entry";
import { clearAuthNavigation } from "@/lib/auth-navigation";
import { useAuthDestination } from "./use-auth-destination";

export function AuthScene() {
    const location = useLocation();
    const navigate = useNavigate();
    const { code } = useParams();
    const mode: BrandAuthMode = location.pathname.startsWith("/i/") ? "invitation" : location.pathname === "/register" ? "register" : location.pathname === "/forgot-password" ? "forgot-password" : "login";
    const next = useAuthDestination();
    return <BrandAuthDialog
        key={mode === "invitation" ? `invitation:${code}` : "account"}
        next={next}
        routeMode={mode}
        onModeChange={(target) => { if (target !== mode) void navigate({ pathname: `/${target}`, search: location.search, hash: location.hash }, { replace: true, state: location.state }); }}
        onClosed={() => {
            clearAuthNavigation();
            void navigate("/", { replace: true });
            const active = document.activeElement;
            if (!active || active === document.body || active.closest(".mc-auth-layer")) document.querySelector<HTMLElement>(".mc-nav-actions a")?.focus({ preventScroll: true });
        }}
    />;
}
