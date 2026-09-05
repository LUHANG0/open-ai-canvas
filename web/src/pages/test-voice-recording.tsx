import { useState, type CSSProperties } from "react";
import { Button, Card, message } from "antd";
import { Mic, Send } from "lucide-react";

import { VoiceRecordingButton } from "@/components/conversation/voice-recording-button";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

import "./voice-recording-pc.css";

/**
 * 语音录制功能测试页面
 * 验证输入行内联波形录制和 STT 转写闭环
 */
export default function TestVoiceRecording() {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [prompt, setPrompt] = useState("");
    const [sending, setSending] = useState(false);

    const handleTranscribed = (text: string) => {
        // 转写结果填入输入框，供用户确认或直接发送
        setPrompt((current) => (current.trim() ? `${current} ${text}` : text));
        message.success("语音已转写为文字");
    };

    const handleSubmit = async () => {
        if (!prompt.trim()) return;
        setSending(true);
        try {
            // 原型只验证输入，不提交对话或记录转写正文。
            message.success("本地输入验证完成，未发送对话");
            setPrompt("");
        } finally {
            setSending(false);
        }
    };

    return (
        <div
            className="pc-voice-page min-h-screen p-8"
            style={
                {
                    "--voice-page-bg": theme.spatial.surface,
                    "--voice-card-bg": theme.spatial.elevated,
                    "--voice-control-bg": theme.node.fill,
                    "--voice-panel-bg": theme.toolbar.panel,
                    "--voice-border": theme.toolbar.border,
                    "--voice-text": theme.node.text,
                    "--voice-muted": theme.node.muted,
                    "--voice-accent": theme.accent.primary,
                    "--voice-accent-fg": theme.accent.onPrimary,
                } as CSSProperties
            }
        >
            <div className="pc-voice-page-content mx-auto max-w-2xl">
                <header className="pc-voice-page-header">
                    <div>
                        <p>内部原型</p>
                        <h1>实时语音转写</h1>
                        <span>验证录音、波形与浏览器语音识别回填。识别能力由浏览器提供，可能需要联网；本页不发送对话。</span>
                    </div>
                    <span className="pc-voice-prototype-badge">MVP · 本地验证</span>
                </header>
                <Card
                    className="pc-voice-card"
                    title={
                        <div className="flex items-center gap-2">
                            <Mic className="pc-voice-title-icon size-5" />
                            <span>实时对话功能测试（MVP）</span>
                        </div>
                    }
                >
                    <div className="pc-voice-card-content space-y-4">
                        {/* 文本输入 */}
                        <div className="pc-voice-composer">
                            <div className="pc-voice-composer-heading">
                                <label htmlFor="pc-voice-input" className="pc-voice-label mb-2 block text-sm font-medium">
                                    文本输入（语音转写结果会自动填入）
                                </label>
                                <span className="pc-voice-count">{prompt.length} 字</span>
                            </div>
                            <textarea
                                id="pc-voice-input"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="输入测试文字，或点击麦克风体验语音输入..."
                                className="pc-voice-textarea w-full rounded-lg border px-3 py-2 text-sm outline-none transition focus:border-current"
                            />
                        </div>

                        {/* 音频预览 */}

                        {/* 控制栏：实时对话按钮（点击后在输入行展开波形录制条） */}
                        <div className="pc-voice-controls flex items-center justify-between gap-2">
                            <div className="flex flex-1 items-center gap-2">
                                <VoiceRecordingButton onTranscribed={handleTranscribed} />
                            </div>
                            <Button type="primary" icon={<Send className="size-4" />} disabled={!prompt.trim()} loading={sending} onClick={handleSubmit} className="pc-voice-send">
                                验证输入
                            </Button>
                        </div>

                        <div className="pc-voice-status-strip" aria-label="语音转写流程">
                            <span>
                                <i aria-hidden="true">1</i>开始录音
                            </span>
                            <span>
                                <i aria-hidden="true">2</i>自动转写
                            </span>
                            <span>
                                <i aria-hidden="true">3</i>确认输入
                            </span>
                        </div>

                        {/* 说明 */}
                        <section className="pc-voice-guide rounded-lg border p-3 text-xs" aria-labelledby="pc-voice-guide-title">
                            <div id="pc-voice-guide-title" className="pc-voice-guide-title font-semibold">
                                使用说明：
                            </div>
                            <ul className="mt-1 list-inside list-disc space-y-1">
                                <li>点击麦克风按钮，输入行内展开波形录制条并自动开始录音</li>
                                <li>波形动画实时显示音量变化</li>
                                <li>点击停止按钮完成录制，回填浏览器识别的文字</li>
                                <li>识别结果可编辑，点击验证输入完成本地检查</li>
                                <li>转写失败时在录制条内提示，可点击麦克风重试</li>
                            </ul>
                        </section>
                    </div>
                </Card>
            </div>
        </div>
    );
}
