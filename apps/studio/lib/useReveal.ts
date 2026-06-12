"use client";

import { type RefObject } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, SplitText, ScrollTrigger);

/**
 * Section-header reveal.
 *  • The TITLE word-wipes only when you enter a *new* section (first load, or
 *    clicking a different left-nav item). Switching tabs within a section keeps the
 *    same title, so it stays put — re-animating an unchanged title on every tab
 *    click read as a full page reload.
 *  • The SUBTITLE fades up on every header mount, so it animates on each tab switch
 *    (where the subtitle text changes) and on first load.
 *
 * We track the last section title and only re-animate when it differs. The marker
 * is set in the title tween's `onComplete` (not synchronously) so React's dev
 * StrictMode double-invoke — which reverts the first run before it finishes —
 * doesn't suppress the very first reveal. Visible by default on reduced-motion /
 * backgrounded tab; `gsap.from` so a context revert restores the visible state.
 */
let lastSectionTitle: string | null = null;

export function useHeaderReveal(scope: RefObject<HTMLElement | null>) {
    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return;

            const title = scope.current?.querySelector(".reveal-title") as HTMLElement | null;
            const titleText = title?.textContent?.trim() ?? "";
            const newSection = !!titleText && titleText !== lastSectionTitle;

            const tl = gsap.timeline();

            if (title && newSection) {
                const split = SplitText.create(title, { type: "lines, words", mask: "lines" });
                tl.from(
                    split.words,
                    { yPercent: 100, duration: 0.85, stagger: 0.08, ease: "expo.out", onComplete: () => { lastSectionTitle = titleText; } },
                    0,
                );
            }

            const subs = gsap.utils.selector(scope)(".reveal-sub");
            if (subs.length) tl.from(subs, { autoAlpha: 0, y: 10, duration: 0.5, ease: "power2.out", stagger: 0.06, clearProps: "transform,opacity" }, newSection ? 0.18 : 0);
        },
        { scope, dependencies: [], revertOnUpdate: true },
    );
}

/**
 * Per-element scroll-reveal (fade + rise on viewport entry, once). Baked into the
 * shared Card so it applies project-wide. Skips elements inside a modal
 * (`[role="dialog"]`), inside something already handling reveal (`.reveal-up`,
 * e.g. dashboard rows), or opted out (`[data-no-reveal]`) — so nothing double-
 * animates or gets stranded in a portal. Visible by default on reduced-motion /
 * unfocused load.
 */
export function useScrollReveal(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
    useGSAP(
        () => {
            const el = ref.current;
            if (!el) return;
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return;
            if (el.closest('[role="dialog"], .reveal-up, [data-no-reveal]')) return;
            gsap.from(el, {
                autoAlpha: 0,
                y: 22,
                duration: 0.6,
                ease: "power3.out",
                scrollTrigger: { trigger: el, start: "top 94%", once: true },
            });
        },
        { scope: ref, dependencies: deps },
    );
}

/**
 * Scroll-reveal: elements matching `selector` within the scope fade + rise as
 * they enter the viewport (gsap.com-style, batched for performance, plays once).
 * Same safety guards — visible by default on reduced-motion / unfocused load.
 */
export function useRevealBatch(scope: RefObject<HTMLElement | null>, selector = ".reveal-up", deps: unknown[] = []) {
    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (reduce || document.hidden) return;
            const items = gsap.utils.toArray<HTMLElement>(selector, scope.current);
            if (!items.length) return;

            gsap.set(items, { autoAlpha: 0, y: 28 });
            ScrollTrigger.batch(items, {
                start: "top 86%",
                once: true,
                onEnter: (batch) => gsap.to(batch, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out", stagger: 0.1, overwrite: true }),
            });
            ScrollTrigger.refresh();
        },
        { scope, dependencies: deps },
    );
}
