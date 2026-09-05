import { Suspense, lazy, useMemo, useState } from "react";
import { Button, Spin } from "antd";

import { BrandLoader, BrandLoadingIndicator } from "@/components/ui/brand-loader";
import { FullScreenLoader, WorkspaceRouteLoader } from "@/components/ui/aceternity/full-screen-loader";
import { WorkspaceLoadingState } from "@/components/ui/pc/workspace-state";
import { useThemeStore } from "@/stores/use-theme-store";

import "./brand-loading-lab.css";

export default function BrandLoadingLab() {
    const { theme, setTheme } = useThemeStore();
    const [still, setStill] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [cycle, setCycle] = useState(0);
    const [delay, setDelay] = useState(1600);
    const Resolved = useMemo(() => lazy(() => new Promise<{ default: () => React.ReactNode }>((resolve) => {
        window.setTimeout(() => resolve({ default: () => <p className="brand-loading-lab-ready">页面已就绪</p> }), delay);
    })), [cycle, delay]);

    return (
        <main className={`brand-loading-lab${still ? " no-motion" : ""}`}>
            <header>
                <div><p>FRAME BY FRAME</p><h1>每一帧，都在就位。</h1><span>品牌加载动效 · 本地预览</span></div>
                <nav aria-label="动效预览控制">
                    <Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "切换浅色" : "切换深色"}</Button>
                    <Button aria-pressed={still} onClick={() => setStill(!still)}>{still ? "恢复动画" : "静态模式"}</Button>
                    <Button href="/create">返回创作</Button>
                </nav>
            </header>
            <section className="brand-loading-lab-hero" aria-label="品牌开场预览">
                <BrandLoader label="正在打开创作空间" detail="准备当前页面" branded />
                <Button className="brand-loading-lab-fullscreen" onClick={() => setFullscreen(true)}>全屏预览</Button>
            </section>
            <div className="brand-loading-lab-grid">
                <section><h2>页面切换</h2><div className="brand-loading-lab-route"><Suspense key={`${cycle}-${delay}`} fallback={<WorkspaceRouteLoader />}><Resolved /></Suspense></div><div className="brand-loading-lab-actions"><Button onClick={() => { setDelay(1600); setCycle(cycle + 1); }}>重播等待</Button><Button onClick={() => { setDelay(30); setCycle(cycle + 1); }}>快速完成</Button></div></section>
                <section><h2>局部与按钮</h2><div className="brand-loading-lab-inline"><Spin size="small" /><Spin /><Spin size="large" /><BrandLoadingIndicator size="md" /></div><div className="brand-loading-lab-actions"><Button type="primary" loading>正在保存</Button><Button loading>正在读取</Button></div></section>
            </div>
            <section className="brand-loading-lab-data"><WorkspaceLoadingState label="正在整理素材" detail="保留内容骨架，加载完成后直接呈现" rows={3} /></section>
            {fullscreen ? <><FullScreenLoader /><Button className="brand-loading-lab-close" onClick={() => setFullscreen(false)}>退出全屏预览</Button></> : null}
        </main>
    );
}
