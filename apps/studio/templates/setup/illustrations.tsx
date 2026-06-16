"use client";

import { useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Hand-built spot illustrations for the guided setup — one friendly scene per
 * step (window / rocket / boxes / plug). Gradients, soft glows, glossy
 * highlights and contact shadows give them depth; brand hues stay constant
 * while the surface tones flip via var(--ill-*) so the whole set adapts to
 * light / dark (which follows the browser's prefers-color-scheme). Gentle GSAP
 * idle motion; visible by default and only animates when focused + motion-ok,
 * so a frozen frame is just a (still nice) static illustration.
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

/* ── Welcome: an app window full of content ─────────────────────────────── */
export const WindowScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".wn-window", { y: -6, duration: 3.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".wn-glow", { scale: 1.08, opacity: 0.85, transformOrigin: "center", duration: 3.4, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".wn-spark", { scale: 0.5, opacity: 0.45, duration: 1.5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.35, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="wnGlow" cx="50%" cy="45%" r="55%">
                        <stop offset="0%" stopColor="#A29BFE" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="#A29BFE" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="wnHead" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                    <linearGradient id="wnSurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                    <linearGradient id="wnImg" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#C9C0FF" />
                        <stop offset="100%" stopColor="#8674F0" />
                    </linearGradient>
                    <linearGradient id="wnPink" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#FFA2C0" />
                        <stop offset="100%" stopColor="#E0529C" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <circle className="wn-glow" cx="120" cy="96" r="84" fill="url(#wnGlow)" style={spark} />
                    <ellipse cx="120" cy="162" rx="60" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    <g className="wn-window">
                        <rect x="56" y="50" width="128" height="102" rx="16" fill="url(#wnSurf)" stroke="#fff" strokeOpacity="0.08" />
                        <path d="M56 72 V66 A16 16 0 0 1 72 50 H168 A16 16 0 0 1 184 66 V72 Z" fill="url(#wnHead)" />
                        <circle cx="70" cy="61" r="3" fill="#fff" opacity="0.95" />
                        <circle cx="82" cy="61" r="3" fill="#fff" opacity="0.7" />
                        <circle cx="94" cy="61" r="3" fill="#fff" opacity="0.5" />
                        {/* image tile with a tiny landscape */}
                        <rect x="72" y="86" width="44" height="44" rx="11" fill="url(#wnImg)" />
                        <circle cx="104" cy="98" r="5" fill="#FFE3A8" />
                        <path d="M78 124 l11 -13 8 8 7 -9 8 14 Z" fill="#fff" opacity="0.85" />
                        {/* content bars */}
                        <rect x="124" y="90" width="46" height="8" rx="4" fill="#A29BFE" />
                        <rect x="124" y="104" width="34" height="8" rx="4" fill="var(--ill-line)" />
                        <rect x="72" y="138" width="100" height="7" rx="3.5" fill="var(--ill-line)" />
                        {/* gloss highlight */}
                        <path d="M64 56 q12 -6 30 -2 l-26 60 q-8 -2 -8 -10 Z" fill="#fff" opacity="0.12" />
                    </g>
                    <path className="wn-spark" d="M184 42 l4.5 12 12 4.5 -12 4.5 -4.5 12 -4.5 -12 -12 -4.5 12 -4.5 Z" fill="url(#wnPink)" style={spark} />
                    <circle className="wn-spark" cx="46" cy="128" r="6.5" fill="#FFC15E" style={spark} />
                    <path className="wn-spark" d="M52 48 v13 M45.5 54.5 h13" stroke="#A29BFE" strokeWidth="3.5" strokeLinecap="round" style={spark} />
                    <circle className="wn-spark" cx="198" cy="150" r="4.5" fill="#A29BFE" style={spark} />
                </>
            }
        />
    );
};

/* ── Start fresh / Launch: a rocket lifting off ─────────────────────────── */
export const RocketScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".rk-rocket", { y: -7, duration: 2.3, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".rk-glow", { scale: 1.1, opacity: 0.9, transformOrigin: "center", duration: 1.4, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".rk-flame", { scaleY: 1.22, opacity: 0.9, svgOrigin: "120 132", duration: 0.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".rk-star", { scale: 0.5, opacity: 0.4, duration: 1.3, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.3, from: "random" } });
        gsap.fromTo(".rk-puff", { y: 0, opacity: 0.5, scale: 0.7 }, { y: 28, opacity: 0, scale: 1.3, duration: 2.2, repeat: -1, ease: "power1.out", stagger: 0.55, transformOrigin: "center" });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="rkGlow" cx="50%" cy="55%" r="55%">
                        <stop offset="0%" stopColor="#FFC15E" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#FFC15E" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="rkBody" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="55%" stopColor="#6C5CE7" />
                        <stop offset="100%" stopColor="#4A3DAE" />
                    </linearGradient>
                    <linearGradient id="rkFin" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#FFA2C0" />
                        <stop offset="100%" stopColor="#E0529C" />
                    </linearGradient>
                    <linearGradient id="rkFlame" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFE3A8" />
                        <stop offset="60%" stopColor="#FFB23E" />
                        <stop offset="100%" stopColor="#FF754C" />
                    </linearGradient>
                    <radialGradient id="rkWin" cx="40%" cy="35%" r="70%">
                        <stop offset="0%" stopColor="#EAF4FF" />
                        <stop offset="100%" stopColor="#8FB7FF" />
                    </radialGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="98" r="84" fill="var(--ill-backdrop)" />
                    <circle className="rk-glow" cx="120" cy="120" r="46" fill="url(#rkGlow)" style={spark} />
                    <ellipse cx="120" cy="170" rx="40" ry="7" fill="var(--ill-shadow)" style={blur(5)} />
                    <path className="rk-star" d="M58 50 l3 7.5 7.5 3 -7.5 3 -3 7.5 -3 -7.5 -7.5 -3 7.5 -3 Z" fill="#FFC15E" style={spark} />
                    <path className="rk-star" d="M188 68 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" fill="#E0529C" style={spark} />
                    <circle className="rk-star" cx="178" cy="128" r="3.5" fill="#A29BFE" style={spark} />
                    <circle className="rk-star" cx="60" cy="120" r="3" fill="#A29BFE" style={spark} />
                    <g className="rk-flame" style={spark}>
                        <path d="M109 132 Q120 178 131 132 Z" fill="url(#rkFlame)" />
                        <path d="M114 132 Q120 162 126 132 Z" fill="#FFE3A8" />
                    </g>
                    <g className="rk-rocket">
                        <path d="M120 38 C137 51 141 96 132 126 L108 126 C99 96 103 51 120 38 Z" fill="url(#rkBody)" />
                        {/* gloss */}
                        <path d="M120 42 C112 50 108 74 109 100 C112 92 116 88 120 88 Z" fill="#fff" opacity="0.22" />
                        <circle cx="120" cy="76" r="13" fill="#fff" />
                        <circle cx="120" cy="76" r="9.5" fill="url(#rkWin)" />
                        <circle cx="116" cy="72" r="3" fill="#fff" opacity="0.85" />
                        <path d="M108 110 L88 132 L108 126 Z" fill="url(#rkFin)" />
                        <path d="M132 110 L152 132 L132 126 Z" fill="url(#rkFin)" />
                        <rect x="110" y="123" width="20" height="8" rx="4" fill="#3A2F8F" />
                    </g>
                    <circle className="rk-puff" cx="102" cy="152" r="7" fill="#C9C0FF" opacity="0.7" style={spark} />
                    <circle className="rk-puff" cx="136" cy="158" r="6" fill="#A29BFE" opacity="0.55" style={spark} />
                    <circle className="rk-puff" cx="120" cy="164" r="8" fill="#C9C0FF" opacity="0.6" style={spark} />
                </>
            }
        />
    );
};

/* ── Migrate: content moving out of an old box into FlowCMS ─────────────────── */
export const BoxesScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.fromTo(".bx-card", { x: -44, opacity: 0 }, { x: 0, opacity: 1, duration: 1.6, repeat: -1, ease: "power1.inOut", stagger: { each: 0.5 }, repeatDelay: 0.25 });
        gsap.to(".bx-flap-l", { rotation: -7, svgOrigin: "60 92", duration: 2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".bx-flap-r", { rotation: 7, svgOrigin: "92 92", duration: 2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".bx-glow", { scale: 1.08, opacity: 0.85, transformOrigin: "center", duration: 3.6, repeat: -1, yoyo: true, ease: "sine.inOut" });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="bxGlow" cx="55%" cy="48%" r="55%">
                        <stop offset="0%" stopColor="#6C5CE7" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#6C5CE7" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="bxBox" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#B7AEFF" />
                        <stop offset="100%" stopColor="#8674F0" />
                    </linearGradient>
                    <linearGradient id="bxFlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                    <linearGradient id="bxMark" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="102" r="84" fill="var(--ill-backdrop)" />
                    <circle className="bx-glow" cx="120" cy="104" r="82" fill="url(#bxGlow)" style={spark} />
                    <ellipse cx="120" cy="166" rx="64" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    {/* old box, left */}
                    <path className="bx-flap-l" d="M44 92 L60 90 L60 99 L46 103 Z" fill="#9A8CF5" />
                    <path className="bx-flap-r" d="M108 92 L92 90 L92 99 L106 103 Z" fill="#9A8CF5" />
                    <rect x="46" y="96" width="60" height="52" rx="9" fill="url(#bxBox)" />
                    <path d="M46 110 v-5 a9 9 0 0 1 9 -9 h42 a9 9 0 0 1 9 9 v5 Z" fill="#fff" opacity="0.18" />
                    <rect x="70" y="96" width="12" height="52" fill="#fff" opacity="0.12" />
                    {/* destination FlowCMS container, right */}
                    <rect x="148" y="74" width="58" height="76" rx="15" fill="url(#bxFlow)" stroke="#6C5CE7" strokeWidth="2.5" />
                    <rect x="160" y="86" width="18" height="18" rx="6" fill="url(#bxMark)" />
                    <rect x="184" y="91" width="10" height="4" rx="2" fill="var(--ill-line)" />
                    <rect x="160" y="116" width="34" height="5" rx="2.5" fill="var(--ill-line)" />
                    <rect x="160" y="128" width="26" height="5" rx="2.5" fill="var(--ill-line)" />
                    {/* arrow */}
                    <path d="M112 112 h24 m0 0 l-7 -5.5 m7 5.5 l-7 5.5" stroke="#E0529C" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
                    {/* traveling content cards */}
                    <g className="bx-card">
                        <rect x="114" y="90" width="32" height="23" rx="6" fill="var(--ill-surface)" stroke="#A29BFE" strokeWidth="2" />
                        <rect x="119" y="96" width="22" height="3.5" rx="1.75" fill="#A29BFE" />
                        <rect x="119" y="103" width="15" height="3.5" rx="1.75" fill="var(--ill-line)" />
                    </g>
                    <g className="bx-card">
                        <rect x="114" y="120" width="32" height="23" rx="6" fill="var(--ill-surface)" stroke="#A29BFE" strokeWidth="2" />
                        <rect x="119" y="126" width="22" height="3.5" rx="1.75" fill="#A29BFE" />
                        <rect x="119" y="133" width="15" height="3.5" rx="1.75" fill="var(--ill-line)" />
                    </g>
                </>
            }
        />
    );
};

/* ── First-run: an identity window guarded by a shield badge ────────────── */
export const IdentityScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".id-card", { y: -6, duration: 3.2, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".id-avatar", { y: -3, duration: 2.6, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.2 });
        gsap.to(".id-shield", { y: -4, scale: 1.03, transformOrigin: "center", duration: 2.4, repeat: -1, yoyo: true, ease: "sine.inOut", delay: 0.4 });
        gsap.to(".id-glow", { scale: 1.08, opacity: 0.85, transformOrigin: "center", duration: 3.4, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".id-spark", { scale: 0.5, opacity: 0.45, duration: 1.5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: { each: 0.3, from: "random" } });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="idGlow" cx="50%" cy="45%" r="55%">
                        <stop offset="0%" stopColor="#A29BFE" stopOpacity="0.5" />
                        <stop offset="100%" stopColor="#A29BFE" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="idSurf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--ill-surface)" />
                        <stop offset="100%" stopColor="var(--ill-surface-2)" />
                    </linearGradient>
                    <linearGradient id="idHead" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                    <linearGradient id="idAv" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#C9C0FF" />
                        <stop offset="100%" stopColor="#8674F0" />
                    </linearGradient>
                    <linearGradient id="idShield" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="96" r="84" fill="var(--ill-backdrop)" />
                    <circle className="id-glow" cx="120" cy="96" r="84" fill="url(#idGlow)" style={spark} />
                    <ellipse cx="116" cy="162" rx="58" ry="9" fill="var(--ill-shadow)" style={blur(5)} />
                    {/* browser-style window */}
                    <g className="id-card">
                        <rect x="50" y="56" width="120" height="94" rx="16" fill="url(#idSurf)" stroke="#fff" strokeOpacity="0.10" />
                        <path d="M50 78 V72 A16 16 0 0 1 66 56 H154 A16 16 0 0 1 170 72 V78 Z" fill="url(#idHead)" />
                        <circle cx="64" cy="67" r="3" fill="#fff" opacity="0.95" />
                        <circle cx="76" cy="67" r="3" fill="#fff" opacity="0.7" />
                        <circle cx="88" cy="67" r="3" fill="#fff" opacity="0.5" />
                        {/* content lines */}
                        <rect x="104" y="92" width="52" height="8" rx="4" fill="#A29BFE" />
                        <rect x="104" y="106" width="40" height="7" rx="3.5" fill="var(--ill-line)" />
                        <rect x="64" y="128" width="92" height="7" rx="3.5" fill="var(--ill-line)" />
                        {/* gloss */}
                        <path d="M58 62 q12 -5 28 -2 l-24 82 q-8 -2 -8 -12 Z" fill="#fff" opacity="0.06" />
                    </g>
                    {/* avatar overlapping the lower-left */}
                    <g className="id-avatar" style={spark}>
                        <circle cx="74" cy="120" r="20" fill="url(#idAv)" stroke="#fff" strokeOpacity="0.25" />
                        <circle cx="74" cy="114" r="6.5" fill="#fff" opacity="0.95" />
                        <path d="M62 131 a12 9 0 0 1 24 0 Z" fill="#fff" opacity="0.95" />
                    </g>
                    {/* shield badge overlapping the lower-right */}
                    <g className="id-shield" style={spark}>
                        <circle cx="158" cy="130" r="22" fill="var(--ill-surface)" stroke="#fff" strokeOpacity="0.12" />
                        <path d="M158 119 l11 4 v7 c0 7 -5 11.5 -11 13.5 c-6 -2 -11 -6.5 -11 -13.5 v-7 Z" fill="url(#idShield)" />
                        <path d="M153 130 l3.5 3.5 6.5 -7.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </g>
                    {/* sparkles */}
                    <path className="id-spark" d="M186 64 l3.5 9.5 9.5 3.5 -9.5 3.5 -3.5 9.5 -3.5 -9.5 -9.5 -3.5 9.5 -3.5 Z" fill="#A29BFE" style={spark} />
                    <path className="id-spark" d="M204 102 l2.6 7 7 2.6 -7 2.6 -2.6 7 -2.6 -7 -7 -2.6 7 -2.6 Z" fill="#FFC15E" style={spark} />
                    <circle className="id-spark" cx="196" cy="138" r="3" fill="#C9C0FF" style={spark} />
                    <circle className="id-spark" cx="44" cy="84" r="3" fill="#A29BFE" style={spark} />
                    <path className="id-spark" d="M40 108 v9 M35.5 112.5 h9" stroke="#A29BFE" strokeWidth="3" strokeLinecap="round" style={spark} />
                </>
            }
        />
    );
};

/* ── Connect: a plug clicking into a socket with a spark ─────────────────── */
export const PlugScene = ({ size = 180, className }: Props) => {
    const ref = useRef<SVGSVGElement>(null);
    useIdle(ref, () => {
        gsap.to(".pg-plug", { x: 7, duration: 1.5, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".pg-spark", { scale: 1.3, opacity: 1, transformOrigin: "center", duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".pg-glow", { scale: 1.12, opacity: 0.95, transformOrigin: "center", duration: 0.7, repeat: -1, yoyo: true, ease: "sine.inOut" });
        gsap.to(".pg-tick", { opacity: 0.2, duration: 0.5, repeat: -1, yoyo: true, ease: "sine.inOut", stagger: 0.12 });
    });
    return (
        <Svg
            refEl={ref}
            size={size}
            className={className}
            defs={
                <>
                    <radialGradient id="pgGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFC15E" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#FFC15E" stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id="pgSock" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#B7AEFF" />
                        <stop offset="100%" stopColor="#8674F0" />
                    </linearGradient>
                    <linearGradient id="pgPlug" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8674F0" />
                        <stop offset="100%" stopColor="#5A4BD4" />
                    </linearGradient>
                    <linearGradient id="pgCable" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#A29BFE" />
                        <stop offset="100%" stopColor="#6C5CE7" />
                    </linearGradient>
                    <radialGradient id="pgSpark" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#FFE3A8" />
                        <stop offset="100%" stopColor="#FF9F1C" />
                    </radialGradient>
                </>
            }
            inner={
                <>
                    <circle cx="120" cy="98" r="84" fill="var(--ill-backdrop)" />
                    <ellipse cx="120" cy="158" rx="58" ry="8" fill="var(--ill-shadow)" style={blur(5)} />
                    {/* socket, right */}
                    <rect x="150" y="68" width="50" height="64" rx="15" fill="url(#pgSock)" />
                    <path d="M150 84 v-1 a15 15 0 0 1 15 -15 h20 a15 15 0 0 1 15 15 v1 Z" fill="#fff" opacity="0.18" />
                    <rect x="158" y="83" width="15" height="9" rx="3.5" fill="var(--ill-surface-2)" />
                    <rect x="158" y="100" width="15" height="9" rx="3.5" fill="var(--ill-surface-2)" />
                    {/* cable + plug */}
                    <path d="M34 132 q24 4 42 -24 q8 -12 22 -12" stroke="url(#pgCable)" strokeWidth="7.5" strokeLinecap="round" fill="none" />
                    <g className="pg-plug">
                        <rect x="92" y="80" width="36" height="36" rx="11" fill="url(#pgPlug)" />
                        <path d="M97 84 h26 a4 4 0 0 1 -2 7 h-22 a4 4 0 0 1 -2 -7 Z" fill="#fff" opacity="0.2" />
                        <rect x="128" y="86" width="13" height="8" rx="3.5" fill="#C9C0FF" />
                        <rect x="128" y="102" width="13" height="8" rx="3.5" fill="#C9C0FF" />
                    </g>
                    {/* spark glow + star */}
                    <circle className="pg-glow" cx="150" cy="98" r="26" fill="url(#pgGlow)" style={spark} />
                    <path className="pg-spark" d="M150 80 l4.5 13 13 0 -10.5 8 4 13 -11 -8 -11 8 4 -13 -10.5 -8 13 0 Z" fill="url(#pgSpark)" style={spark} />
                    <circle className="pg-tick" cx="172" cy="52" r="3" fill="#FFC15E" />
                    <circle className="pg-tick" cx="188" cy="60" r="2.5" fill="#E0529C" />
                    <circle className="pg-tick" cx="180" cy="40" r="2" fill="#A29BFE" />
                </>
            }
        />
    );
};
