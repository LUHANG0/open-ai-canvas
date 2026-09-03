import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router";

import "@/lib/plugins/builtin";

import { AppProviders } from "@/components/layout/app-providers";
import { BrandingProvider } from "@/components/branding/branding-provider";
import { PublicSiteProvider } from "@/components/public-site/public-site-provider";
import { router } from "@/router";

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <BrandingProvider>
            <PublicSiteProvider>
                <AppProviders router={router}>
                    <RouterProvider router={router} />
                </AppProviders>
            </PublicSiteProvider>
        </BrandingProvider>
    </React.StrictMode>,
);
