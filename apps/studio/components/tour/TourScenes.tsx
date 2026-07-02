"use client";

import { useRef, type CSSProperties, type ComponentType } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
    BoxesScene,
    IdentityScene,
    PlugScene,
    RocketScene,
    WindowScene,
} from "@/templates/setup/illustrations";

gsap.registerPlugin(useGSAP);

/**
 * Spot illustrations for the guided tour, one scene per chapter, in the same
 * hand-built style as the setup wizard set (templates/setup/illustrations.tsx):
 * brand hues stay constant, surface tones flip via var(--ill-*) for light /
 * dark, gentle GSAP idle motion that no-ops under prefers-reduced-motion.
 * Five scenes are reused from the setup set; the rest live here.
 */

const spark: CSSProperties = { transformBox: "fill-box", transformOrigin: "center" };
const blur = (px: number): CSSProperties => ({ filter: `blur(${px}px)` });

type Props = { size?: number; className?: string };

const useIdle = (ref: React.RefObject<SVGSVGElement | null>, build: () => void) =>
    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return; // static, already visible
            build();
        },
        { scope: ref },
    );

const Svg = ({ inner, refEl, size, className, defs }: { inner: React.ReactNode; refEl: React.RefObject<SVGSVGElement | null>; size: number; className?: string; defs: React.ReactNode }) => (
    <svg ref={refEl} viewBox="0 0 240 200" width={size} height={(size * 200) / 240} className={className} fill="none" aria-hidden style={{ overflow: "visible" }}>
        <defs>{defs}</defs>
        {inner}
    </svg>
);

/* ── Editor: a page being written, pen nib and a slash-command chip ──────── */
export const EditorScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".ed-sheet", { y: -5, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".ed-pen", { y: -7, rotate: -6, duration: 2.4, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "center" });
        gsap.fromTo(".ed-caret", { opacity: 1 }, { opacity: 0.1, duration: 0.6, repeat: -1, yoyo: true, ease: "steps(1)" });
        gsap.to(".ed-spark", { scale: 0.5, opacity: 0.4, duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.3, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <linearGradient id="edSurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                    <linearGradient id="edPen" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <ellipse cx="120" cy="162" rx="58" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="ed-sheet">
                        <rect x="66" y="44" width="108" height="118" rx="14" fill="url(#edSurf)" stroke="#fff" strokeOpacity="0.08" />
                        {/* written lines */}
                        <rect x="80" y="62" width="62" height="8" rx="4" fill="#A29BFE" />
                        <rect x="80" y="80" width="80" height="7" rx="3.5" fill="var(--ill-line)" />
                        <rect x="80" y="94" width="70" height="7" rx="3.5" fill="var(--ill-line)" />
                        <rect x="80" y="108" width="76" height="7" rx="3.5" fill="var(--ill-line)" />
                        {/* the line being typed + caret */}
                        <rect x="80" y="126" width="38" height="7" rx="3.5" fill="#C9C0FF" />
                        <rect className="ed-caret" x="122" y="123" width="3" height="13" rx="1.5" fill="#6C5CE7" />
                        {/* slash-command chip */}
                        <rect x="80" y="140" width="34" height="14" rx="7" fill="#6C5CE7" opacity="0.14" />
                        <text x="97" y="150.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#6C5CE7">/</text>
                        <path d="M74 48 q10 -5 26 -2 l-22 52 q-7 -2 -7 -9 Z" fill="#fff" opacity="0.1" />
                    </g>
                    <g className="ed-pen">
                        <rect x="150" y="86" width="16" height="52" rx="8" transform="rotate(35 158 112)" fill="url(#edPen)" />
                        <path d="M139 140 l10 8 -15 6 Z" fill="#FFC15E" />
                    </g>
                    <path className="ed-spark" d="M188 52 l4 10.5 10.5 4 -10.5 4 -4 10.5 -4 -10.5 -10.5 -4 10.5 -4 Z" fill="#FFA2C0" style={spark} />
                    <circle className="ed-spark" cx="50" cy="70" r="5.5" fill="#FFC15E" style={spark} />
                    <path className="ed-spark" d="M54 140 v12 M48 146 h12" stroke="#A29BFE" strokeWidth="3.5" strokeLinecap="round" style={spark} />
                </>
            }
        />
    );
};

/* ── SEO: a chart window climbing, with a magnifier ──────────────────────── */
export const SeoScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".seo-window", { y: -5, duration: 3.1, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".seo-glass", { y: -8, rotate: 5, duration: 2.5, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "center" });
        gsap.fromTo(".seo-bar", { scaleY: 0.82, transformOrigin: "bottom" }, { scaleY: 1, duration: 1.8, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.25 });
        gsap.to(".seo-spark", { scale: 0.5, opacity: 0.4, duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.35, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <linearGradient id="seoSurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                    <linearGradient id="seoHead" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <ellipse cx="120" cy="162" rx="58" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="seo-window">
                        <rect x="56" y="52" width="118" height="100" rx="14" fill="url(#seoSurf)" stroke="#fff" strokeOpacity="0.08" />
                        <path d="M56 70 V66 A14 14 0 0 1 70 52 H160 A14 14 0 0 1 174 66 V70 Z" fill="url(#seoHead)" />
                        <circle cx="68" cy="61" r="2.5" fill="#fff" opacity="0.95" />
                        <circle cx="78" cy="61" r="2.5" fill="#fff" opacity="0.7" />
                        {/* rising bars */}
                        <rect className="seo-bar" x="72" y="112" width="14" height="28" rx="5" fill="#C9C0FF" />
                        <rect className="seo-bar" x="94" y="100" width="14" height="40" rx="5" fill="#A29BFE" />
                        <rect className="seo-bar" x="116" y="88" width="14" height="52" rx="5" fill="#8674F0" />
                        <rect className="seo-bar" x="138" y="78" width="14" height="62" rx="5" fill="#6C5CE7" />
                        {/* up arrow */}
                        <path d="M74 92 l24 -12 20 6 28 -22" stroke="#FFC15E" strokeWidth="4" strokeLinecap="round" fill="none" />
                        <path d="M138 60 h10 v10" stroke="#FFC15E" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </g>
                    <g className="seo-glass">
                        <circle cx="176" cy="128" r="17" fill="var(--ill-surface)" stroke="#6C5CE7" strokeWidth="5" />
                        <rect x="186" y="140" width="8" height="22" rx="4" transform="rotate(-45 190 151)" fill="#6C5CE7" />
                        <path d="M170 122 a8 8 0 0 1 8 -3" stroke="#A29BFE" strokeWidth="3" strokeLinecap="round" fill="none" />
                    </g>
                    <path className="seo-spark" d="M50 56 l4 10.5 10.5 4 -10.5 4 -4 10.5 -4 -10.5 -10.5 -4 10.5 -4 Z" fill="#FFA2C0" style={spark} />
                    <circle className="seo-spark" cx="200" cy="70" r="5" fill="#A29BFE" style={spark} />
                </>
            }
        />
    );
};

/* ── AI: a glowing spark orb with an orbit ring ──────────────────────────── */
export const AiScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".ai-core", { y: -6, duration: 2.6, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".ai-glow", { scale: 1.12, opacity: 0.9, transformOrigin: "center", duration: 2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".ai-orbit", { rotate: 360, svgOrigin: "120 96", duration: 14, repeat: -1, ease: "none" });
        gsap.to(".ai-spark", { scale: 0.45, opacity: 0.4, duration: 1.3, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.3, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="aiGlow" cx="50%" cy="50%" r="55%">
                        <stop offset="0%" stopColor="#A29BFE" stopOpacity="0.65" />
                        <stop offset="100%" stopColor="#A29BFE" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="aiCore" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#A29BFE" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <circle className="ai-glow" cx="120" cy="96" r="70" fill="url(#aiGlow)" style={spark} />
                    <ellipse cx="120" cy="162" rx="52" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="ai-orbit">
                        <ellipse cx="120" cy="96" rx="66" ry="26" stroke="#A29BFE" strokeWidth="2.5" strokeDasharray="1 8" strokeLinecap="round" fill="none" transform="rotate(-18 120 96)" />
                        <circle cx="181" cy="76" r="6" fill="#FFC15E" />
                    </g>
                    <g className="ai-core">
                        <path d="M120 52 l13 31 31 13 -31 13 -13 31 -13 -31 -31 -13 31 -13 Z" fill="url(#aiCore)" />
                        <path d="M120 66 l9 21.5 21.5 8.5 -21.5 8.5 -9 21.5 -9 -21.5 -21.5 -8.5 21.5 -8.5 Z" fill="#fff" opacity="0.16" />
                        <path d="M158 56 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5 Z" fill="#FFA2C0" />
                    </g>
                    <circle className="ai-spark" cx="54" cy="70" r="5.5" fill="#FFC15E" style={spark} />
                    <path className="ai-spark" d="M186 140 v12 M180 146 h12" stroke="#A29BFE" strokeWidth="3.5" strokeLinecap="round" style={spark} />
                    <circle className="ai-spark" cx="58" cy="140" r="4.5" fill="#A29BFE" style={spark} />
                </>
            }
        />
    );
};

/* ── Chat: two speech bubbles, one typing ────────────────────────────────── */
export const ChatScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".ch-a", { y: -6, duration: 2.8, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".ch-b", { y: -8, duration: 2.3, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.4 });
        gsap.to(".ch-dot", { y: -4, duration: 0.5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.14 });
        gsap.to(".ch-spark", { scale: 0.5, opacity: 0.4, duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.35, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <linearGradient id="chMain" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                    <linearGradient id="chSurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <ellipse cx="120" cy="162" rx="56" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="ch-a">
                        <path d="M56 60 a14 14 0 0 1 14 -14 h74 a14 14 0 0 1 14 14 v34 a14 14 0 0 1 -14 14 h-52 l-16 16 v-16 h-6 a14 14 0 0 1 -14 -14 Z" fill="url(#chMain)" />
                        <rect x="72" y="62" width="58" height="7" rx="3.5" fill="#fff" opacity="0.85" />
                        <rect x="72" y="76" width="42" height="7" rx="3.5" fill="#fff" opacity="0.5" />
                        <path d="M62 52 q10 -5 24 -3 l-18 44 q-6 -2 -6 -8 Z" fill="#fff" opacity="0.12" />
                    </g>
                    <g className="ch-b">
                        <path d="M100 110 a13 13 0 0 1 13 -13 h58 a13 13 0 0 1 13 13 v26 a13 13 0 0 1 -13 13 h-4 v14 l-14 -14 h-40 a13 13 0 0 1 -13 -13 Z" fill="url(#chSurf)" stroke="#fff" strokeOpacity="0.08" />
                        <circle className="ch-dot" cx="126" cy="123" r="4.5" fill="#A29BFE" />
                        <circle className="ch-dot" cx="142" cy="123" r="4.5" fill="#8674F0" />
                        <circle className="ch-dot" cx="158" cy="123" r="4.5" fill="#6C5CE7" />
                    </g>
                    <path className="ch-spark" d="M186 56 l4 10.5 10.5 4 -10.5 4 -4 10.5 -4 -10.5 -10.5 -4 10.5 -4 Z" fill="#FFA2C0" style={spark} />
                    <circle className="ch-spark" cx="46" cy="120" r="5.5" fill="#FFC15E" style={spark} />
                    <path className="ch-spark" d="M196 140 v12 M190 146 h12" stroke="#A29BFE" strokeWidth="3.5" strokeLinecap="round" style={spark} />
                </>
            }
        />
    );
};

/* ── Developers: a terminal window and a floating key ────────────────────── */
export const KeyScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".ky-term", { y: -5, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".ky-key", { y: -9, rotate: 8, duration: 2.4, repeat: -1, yoyo: true, ease: "sine.inOut", transformOrigin: "center" });
        gsap.fromTo(".ky-caret", { opacity: 1 }, { opacity: 0.1, duration: 0.6, repeat: -1, yoyo: true, ease: "steps(1)" });
        gsap.to(".ky-spark", { scale: 0.5, opacity: 0.4, duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.3, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <linearGradient id="kySurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#332B7A" />
                        <stop offset="100%" stopColor="#1A1A2E" />
                    </linearGradient>
                    <linearGradient id="kyKey" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#FFD98A" />
                        <stop offset="100%" stopColor="#F5A623" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <ellipse cx="120" cy="162" rx="58" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="ky-term">
                        <rect x="54" y="54" width="120" height="96" rx="14" fill="url(#kySurf)" stroke="#fff" strokeOpacity="0.1" />
                        <circle cx="68" cy="68" r="3" fill="#FFA2C0" />
                        <circle cx="80" cy="68" r="3" fill="#FFC15E" />
                        <circle cx="92" cy="68" r="3" fill="#34D2A6" />
                        <path d="M68 90 l10 8 -10 8" stroke="#A29BFE" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <rect x="86" y="94" width="42" height="7" rx="3.5" fill="#fff" opacity="0.35" />
                        <rect x="68" y="112" width="56" height="7" rx="3.5" fill="#fff" opacity="0.2" />
                        <rect className="ky-caret" x="68" y="128" width="10" height="10" rx="2" fill="#A29BFE" />
                        <path d="M60 58 q10 -5 24 -2 l-18 48 q-6 -2 -6 -9 Z" fill="#fff" opacity="0.08" />
                    </g>
                    <g className="ky-key">
                        <circle cx="176" cy="88" r="15" fill="none" stroke="url(#kyKey)" strokeWidth="9" />
                        <rect x="171" y="100" width="9" height="34" rx="4.5" fill="url(#kyKey)" />
                        <rect x="180" y="118" width="12" height="8" rx="3" fill="url(#kyKey)" />
                        <rect x="180" y="128" width="9" height="7" rx="3" fill="url(#kyKey)" />
                    </g>
                    <path className="ky-spark" d="M48 66 l4 10.5 10.5 4 -10.5 4 -4 10.5 -4 -10.5 -10.5 -4 10.5 -4 Z" fill="#FFA2C0" style={spark} />
                    <circle className="ky-spark" cx="200" cy="150" r="5" fill="#A29BFE" style={spark} />
                    <path className="ky-spark" d="M48 136 v12 M42 142 h12" stroke="#FFC15E" strokeWidth="3.5" strokeLinecap="round" style={spark} />
                </>
            }
        />
    );
};

/** Chapter id → spot illustration. */
export const TOUR_SCENES: Record<string, ComponentType<Props>> = {
    overview: RocketScene,
    content: WindowScene,
    editor: EditorScene,
    seo: SeoScene,
    optimizer: SeoScene,
    ai: AiScene,
    assets: BoxesScene,
    chat: ChatScene,
    team: IdentityScene,
    security: IdentityScene,
    "content-model": WindowScene,
    integrations: PlugScene,
    developers: KeyScene,
};
