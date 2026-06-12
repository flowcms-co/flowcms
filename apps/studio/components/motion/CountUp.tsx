"use client";

import { type CSSProperties, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * Animated number that counts up (and snaps to the right precision) when it
 * actually scrolls into view — for card stats / KPIs (à la GreenSock's
 * "TextContent w/ snap"). Design notes:
 *
 *  • Uses an IntersectionObserver (NOT ScrollTrigger) so it fires reliably
 *    everywhere, independent of card-reveal timing / ScrollTrigger.refresh.
 *  • The count only BEGINS once the element is genuinely on screen. A late
 *    data swap (sample → live) that arrives while the element is still below
 *    the fold does NOT start the count early — the number keeps holding at 0
 *    and waits for the user to scroll to it. (Earlier this fired off-screen, so
 *    by the time you scrolled the number was already "preloaded" at its final
 *    value — exactly the bug this fixes.)
 *  • Gated on `document.hidden` (the tab is truly backgrounded), NOT
 *    `document.hasFocus()`. hasFocus() is false whenever the window isn't the
 *    OS-focused one (DevTools focused, second monitor, another app in front),
 *    which would wrongly disable the count for someone who's actively looking.
 *  • Renders the final value by default (correct for SSR / no-JS / reduced
 *    motion) so it can never get stranded.
 *  • If `value` changes after the count has started (live data arrives), the
 *    running tween is RETARGETED to the new value from wherever it is now —
 *    smooth, no reset to 0 and no snap.
 */
type Props = {
    value: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    duration?: number;
    className?: string;
    style?: CSSProperties;
};

const fmt = (v: number, decimals: number, prefix: string, suffix: string) =>
    `${prefix}${v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`;

const CountUp = ({ value, decimals = 0, prefix = "", suffix = "", duration = 1.3, className, style }: Props) => {
    const ref = useRef<HTMLSpanElement>(null);
    const shown = useRef(0); // last numeric value actually displayed
    const started = useRef(false); // has the count begun (element has been on screen)?
    const tween = useRef<gsap.core.Tween | null>(null);

    useGSAP(
        () => {
            const el = ref.current;
            if (!el) return;
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            if (reduce || document.hidden) {
                el.textContent = fmt(value, decimals, prefix, suffix);
                shown.current = value;
                started.current = true;
                return;
            }

            const snap = decimals ? 1 / 10 ** decimals : 1;
            const obj = { v: shown.current };

            // Count (or re-target) from the currently displayed value to `value`.
            const animate = () => {
                obj.v = shown.current;
                tween.current?.kill();
                tween.current = gsap.to(obj, {
                    v: value,
                    duration,
                    ease: "power2.out",
                    snap: { v: snap },
                    onUpdate: () => {
                        if (!el.isConnected) return;
                        el.textContent = fmt(obj.v, decimals, prefix, suffix);
                        shown.current = obj.v;
                    },
                });
            };

            // Already on screen once → a value change just re-targets smoothly.
            if (started.current) {
                animate();
                return () => tween.current?.kill();
            }

            // Not yet seen: hold at 0 and wait until the element is actually
            // scrolled into view before counting (survives data swaps below fold).
            el.textContent = fmt(0, decimals, prefix, suffix);
            shown.current = 0;

            const io = new IntersectionObserver(
                (entries, obs) => {
                    if (!entries[0]?.isIntersecting) return;
                    obs.disconnect();
                    started.current = true;
                    animate();
                },
                { threshold: 0.1 },
            );
            io.observe(el);

            return () => {
                io.disconnect();
                tween.current?.kill();
            };
        },
        { scope: ref, dependencies: [value] },
    );

    return (
        <span ref={ref} className={className} style={style}>
            {fmt(value, decimals, prefix, suffix)}
        </span>
    );
};

export default CountUp;
