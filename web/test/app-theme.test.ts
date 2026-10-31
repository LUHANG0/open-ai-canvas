import { describe, expect, test } from "bun:test";

import { getAntThemeConfig, getWorkspaceAntThemeConfig } from "../src/lib/app-theme";
import { DEFAULT_CLASSIC_SKIN, duplicateSkinDefinition } from "../src/lib/skin-themes";
import { getIsolatedAdminAntTheme } from "../src/pages/admin/theme/admin-ant-theme";

describe("shared action colors and focus feedback", () => {
    for (const dark of [false, true]) {
        test(`classic solid tokens remain monochrome beneath the button fill adapter in ${dark ? "dark" : "light"} mode`, () => {
            const product = getAntThemeConfig(dark, DEFAULT_CLASSIC_SKIN);
            const admin = getIsolatedAdminAntTheme(dark);
            expect(product.components?.Button?.colorPrimary).toBe(dark ? "#f5f5f5" : "#171717");
            expect(admin.components?.Button?.colorPrimary).toBe(dark ? "#f5f5f5" : "#111111");
            expect(admin.components?.Button?.primaryColor).toBe(dark ? "#0f0f0f" : "#ffffff");
        });

        test(`custom primary action states reach the workspace while admin stays independent in ${dark ? "dark" : "light"} mode`, () => {
            const skin = duplicateSkinDefinition(DEFAULT_CLASSIC_SKIN, ["classic"]);
            Object.assign(skin.tokens[dark ? "dark" : "light"], {
                primary: "#123456",
                primaryHover: "#234567",
                primaryActive: "#345678",
                primaryForeground: "#abcdef",
            });
            const product = getAntThemeConfig(dark, skin);
            const admin = getIsolatedAdminAntTheme(dark);
            expect(product.components?.Button).toMatchObject({
                colorPrimary: "#123456",
                colorPrimaryHover: "#234567",
                colorPrimaryActive: "#345678",
                primaryColor: "#abcdef",
            });
            expect(admin.components?.Button?.colorPrimary).toBe(dark ? "#f5f5f5" : "#111111");
            for (const theme of [product, admin]) {
                expect(theme.token?.controlOutlineWidth).toBe(0);
                expect(theme.components?.Input?.activeShadow).toBe("none");
                expect(theme.components?.InputNumber?.activeShadow).toBe("none");
                expect(theme.components?.DatePicker?.activeShadow).toBe("none");
                expect(theme.components?.Select?.activeOutlineColor).toBe("transparent");
            }
        });
    }

    test("workspace density overrides inherit action colors and shadow-free focus", () => {
        const theme = getWorkspaceAntThemeConfig();
        expect(theme.components?.Button?.colorPrimary).toBeUndefined();
        expect(theme.components?.Button?.primaryColor).toBeUndefined();
        expect(theme.components?.Input?.activeShadow).toBe("none");
    });

    test("shared motion has one duration while each surface retains its density", () => {
        for (const theme of [getAntThemeConfig(false, DEFAULT_CLASSIC_SKIN), getWorkspaceAntThemeConfig()]) {
            expect(theme.token?.motionDurationFast).toBe("0.15s");
            expect(theme.token?.motionDurationMid).toBe("0.15s");
            expect(theme.token?.motionDurationSlow).toBe("0.15s");
        }
        expect(getAntThemeConfig(false, DEFAULT_CLASSIC_SKIN).token?.controlHeight).toBe(36);
        expect(getWorkspaceAntThemeConfig().token?.controlHeight).toBe(38);
        expect(getWorkspaceAntThemeConfig().token?.borderRadius).toBe(12);
        expect(getIsolatedAdminAntTheme(false).token?.controlHeight).toBe(32);
    });
});
