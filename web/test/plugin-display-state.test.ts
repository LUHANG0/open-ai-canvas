import { expect, test } from "bun:test";
import { normalizeEagleAddress, pluginDisplayState } from "../src/pages/plugins/plugin-display-state";
import type { PluginState } from "../src/services/api/plugins";

const available: PluginState = { pluginId: "fixture", platformAvailable: true, userEnabled: true, userConfigured: true, effectiveEnabled: true, canToggle: true, canConfigure: true };

test("未读取和刷新失败不从缓存声明正常", () => {
    expect(pluginDisplayState()).toMatchObject({ enabled: false, label: "状态待确认", tone: "neutral" });
    expect(pluginDisplayState(available, true)).toMatchObject({ enabled: false, userEnabled: true, label: "状态待确认" });
});

test("环境阻断保留已开启的用户意愿和具体原因", () => {
    expect(pluginDisplayState({ ...available, platformAvailable: false, effectiveEnabled: false, blockedReason: "服务未安装" })).toEqual({ label: "服务未安装", tone: "warning", enabled: false, userEnabled: true });
});

test("环境不可用且原因缺失仍不声明正常", () => {
    expect(pluginDisplayState({ ...available, platformAvailable: false })).toMatchObject({ enabled: false, label: "运行环境不可用" });
});

test("已开启待配置与用户关闭明确区分", () => {
    expect(pluginDisplayState({ ...available, effectiveEnabled: false, userConfigured: false })).toMatchObject({ label: "已开启，待配置", tone: "warning", userEnabled: true });
    expect(pluginDisplayState({ ...available, effectiveEnabled: false, userEnabled: false })).toMatchObject({ label: "已停用", tone: "neutral", userEnabled: false });
});

test("只有实际生效返回成功", () => {
    expect(pluginDisplayState(available)).toEqual({ label: "已生效", tone: "success", enabled: true, userEnabled: true });
});

test("Eagle 地址只接受后端支持的本机 HTTP 默认端口", () => {
    expect(normalizeEagleAddress(" http://localhost:41595/ ")).toBe("http://localhost:41595");
    expect(normalizeEagleAddress("http://127.0.0.1:41595")).toBe("http://127.0.0.1:41595");
    expect(normalizeEagleAddress("http://[::1]:41595")).toBe("http://[::1]:41595");
    for (const value of ["https://localhost:41595", "http://localhost:8095", "http://example.com:41595", "http://user:secret@localhost:41595", "http://localhost:41595/path", "http://localhost:41595?x=1", "not-a-url"]) expect(() => normalizeEagleAddress(value)).toThrow();
});
