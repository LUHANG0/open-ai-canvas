import { useCallback, useEffect, useRef, useState } from "react";

export function useFilmPlayback({ durations, visible, reduced, preview }: { durations: readonly number[]; visible: boolean; reduced: boolean; preview: boolean }) {
    const [selected, setSelected] = useState(0);
    const [intent, setIntent] = useState<boolean | null>(null);
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const [held, setHeld] = useState(false);
    const [waiting, setWaiting] = useState(false);
    const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState !== "hidden");
    const progress = useRef<HTMLElement | null>(null);
    const elapsed = useRef(0);
    const resumeTimer = useRef<number | null>(null);
    const wantsPlay = intent ?? !reduced;
    const playing = wantsPlay && visible && pageVisible && !preview && !hovered && !focused && !held && !waiting;
    const clearResume = useCallback(() => {
        if (resumeTimer.current !== null) window.clearTimeout(resumeTimer.current);
        resumeTimer.current = null;
    }, []);
    const resumeSoon = useCallback(() => {
        clearResume(); setWaiting(true);
        resumeTimer.current = window.setTimeout(() => { resumeTimer.current = null; setWaiting(false); }, 1200);
    }, [clearResume]);
    const release = useCallback(() => { setHeld(false); resumeSoon(); }, [resumeSoon]);
    const reset = () => { elapsed.current = 0; if (progress.current) progress.current.style.transform = "scaleX(0)"; };
    const choose = (index: number) => { reset(); setSelected(index); };
    useEffect(() => {
        const change = () => setPageVisible(document.visibilityState !== "hidden");
        document.addEventListener("visibilitychange", change);
        return () => document.removeEventListener("visibilitychange", change);
    }, []);
    useEffect(() => clearResume, [clearResume]);
    useEffect(() => {
        let frame: number;
        let previous: number | null = null;
        const duration = durations[selected];
        if (progress.current) progress.current.style.transform = `scaleX(${elapsed.current / duration})`;
        if (!playing) return;
        const tick = (time: number) => {
            if (previous !== null) elapsed.current += time - previous;
            previous = time;
            if (elapsed.current >= duration) {
                elapsed.current = 0;
                if (progress.current) progress.current.style.transform = "scaleX(0)";
                setSelected((index) => (index + 1) % durations.length);
                return;
            }
            if (progress.current) progress.current.style.transform = `scaleX(${elapsed.current / duration})`;
            frame = window.requestAnimationFrame(tick);
        };
        frame = window.requestAnimationFrame(tick);
        return () => window.cancelAnimationFrame(frame);
    }, [playing, selected, durations]);
    return {
        selected, progress, playing, wantsPlay, choose,
        toggle: () => { setIntent(!wantsPlay); clearResume(); setWaiting(false); setFocused(false); },
        enter: () => { clearResume(); setWaiting(false); setHovered(true); },
        leave: () => { setHovered(false); resumeSoon(); },
        focus: () => { clearResume(); setWaiting(false); setFocused(true); },
        blur: () => { setFocused(false); resumeSoon(); },
        pointer: () => setFocused(false),
        hold: () => { clearResume(); setWaiting(false); setHeld(true); },
        release,
    };
}
