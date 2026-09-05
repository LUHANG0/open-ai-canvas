import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Button, ConfigProvider, Spin } from "antd";

import { BrandLoader, BrandLoadingIndicator } from "../src/components/ui/brand-loader";
import { BrandingProvider } from "../src/components/branding/branding-provider";
import { FullScreenLoader, WorkspaceRouteLoader } from "../src/components/ui/aceternity/full-screen-loader";
import { WorkspaceLoadingState } from "../src/components/ui/pc/workspace-state";

describe("brand loading feedback", () => {
    test("keeps custom text accessible and the decorative motion silent", () => {
        const html = renderToStaticMarkup(
            <BrandingProvider>
                <FullScreenLoader label="正在读取共享画布" detail="恢复视图位置" />
            </BrandingProvider>,
        );
        expect(html).toContain('role="status"');
        expect(html).toContain('aria-label="正在读取共享画布，恢复视图位置"');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain('class="object-contain brand-loading-logo"');
        expect(html).toContain("恢复视图位置</span>");
        expect(html).not.toContain('role="progressbar"');
    });

    test("does not announce or paint a route indicator before its reveal delay", () => {
        const html = renderToStaticMarkup(<WorkspaceRouteLoader label="正在打开任务" />);
        expect(html).toContain("data-workspace-route-loader");
        expect(html).not.toContain("正在打开任务");
        expect(html).not.toContain("brand-loading-indicator");
    });

    test("uses the same indicator in Ant Design spinners and loading buttons", () => {
        const html = renderToStaticMarkup(
            <ConfigProvider spin={{ indicator: <BrandLoadingIndicator /> }} button={{ loadingIcon: <BrandLoadingIndicator /> }}>
                <Spin />
                <Button loading>正在保存</Button>
            </ConfigProvider>,
        );
        expect(html.match(/class="brand-loading-frame"/g)).toHaveLength(2);
        expect(html).toContain("正在保存");
        expect(html).toContain("ant-btn-loading");
    });

    test("preserves data skeletons and does not introduce a second live region", () => {
        const html = renderToStaticMarkup(<WorkspaceLoadingState label="正在读取素材" detail="同步当前目录" rows={2} />);
        expect(html.match(/role="status"/g)).toHaveLength(1);
        expect(html.match(/workspace-loading-state-card/g)).toHaveLength(2);
        expect(html).toContain("正在读取素材");
        expect(html).toContain("同步当前目录");
        expect(renderToStaticMarkup(<BrandLoader label="正在读取" />)).not.toContain("<img");
    });
});
