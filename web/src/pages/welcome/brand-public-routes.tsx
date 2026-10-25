import { Outlet, type RouteObject } from "react-router";
import { BrandAuthProvider } from "@/components/brand/brand-auth-entry";
import { AuthScene } from "@/pages/auth/auth-scene";
import WelcomePage from ".";
import "./brand-public-routes.css";

function BrandPublicLayout() {
    return <BrandAuthProvider>
        {/* Keep private LAN addresses out of requests to public media hosts. */}
        <meta name="referrer" content="same-origin" />
        <div className="mc-route-scroll"><WelcomePage /></div>
        <Outlet />
    </BrandAuthProvider>;
}

export const brandPublicRoutes: RouteObject = {
    element: <BrandPublicLayout />,
    children: [
        { path: "/", element: null },
        { path: "/login", element: <AuthScene /> },
        { path: "/register", element: <AuthScene /> },
        { path: "/forgot-password", element: <AuthScene /> },
        { path: "/i/:code", element: <AuthScene /> },
    ],
};
