"use client";

/* eslint-disable @next/next/no-img-element */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { cn } from "@/lib/cn";
import { requirementMet, type TourStep } from "@/lib/tour";
import { useTour } from "@/components/tour/TourProvider";
import { TOUR_SCENES } from "@/components/tour/TourScenes";

// Strong ease-out (emil's UI curve) — the house easing for intentional motion.
const EASE = [0.16, 1, 0.3, 1] as const;
/** Breathing room between the target and the spotlight edge. */
const PAD = 8;
/** Gap between the spotlight and the tour card. */
const GAP = 14;
/** Anchored tour card width (24rem) and the viewport clamp margin. */
const CARD_W = 384;
const MARGIN = 16;

type Rect = { x: number; y: number; w: number; h: number };

type CardPlacement = {
    top: number;
    left: number;
    /** Caret pointing back at the target; null when the card had to overlap. */
    arrow: { side: "top" | "bottom" | "left" | "right"; x: number; y: number } | null;
};

/** Confetti burst vectors: deterministic (no Math.random — renders stay pure). */
const BURST = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    const dist = 64 + (i % 3) * 22;
    return {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        color: ["#6c5ce7", "#a29bfe", "#00b894", "#f5a623", "#3b82f6", "#ff754c"][i % 6],
    };
});

function measure(el: Element): Rect {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** The on-screen part of the target. Oversized targets (a full-height sidebar,
 *  a full-width band) get spotlit only where they're visible, so the ring never
 *  runs past the viewport. */
function clampToViewport(r: Rect, vw: number, vh: number): Rect {
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    return { x, y, w: Math.max(0, Math.min(vw, r.x + r.w) - x), h: Math.max(0, Math.min(vh, r.y + r.h) - y) };
}

/** Nearest scrollable ancestor (falls back to the page scroller). */
function scrollParentOf(el: Element): Element | null {
    for (let n = el.parentElement; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (/auto|scroll|overlay/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
    }
    return document.scrollingElement;
}

/** Keep clear of the mobile sticky header when nudging scroll position. */
const SAFE_TOP = 88;

/** Chapter images that failed to load (not shipped yet) — fall back to the
 *  SVG spot scene. Module-level so a miss is remembered across steps. */
const MISSING_IMAGES = new Set<string>();

/** Place the card below the target, else above, else beside — the first spot
 *  where it fits fully on screen WITHOUT covering the spotlight. Only when no
 *  clear strip exists (oversized targets) does it overlap at all, and then
 *  tucked into the corner farthest from the target's center, never on top of
 *  its middle. Computes the caret so the card visibly points at its target. */
function cardPosition(rect: Rect, cardH: number, vw: number, vh: number): CardPlacement {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const hole = { top: rect.y - PAD, left: rect.x - PAD, right: rect.x + rect.w + PAD, bottom: rect.y + rect.h + PAD };
    const clampX = (left: number) => Math.max(MARGIN, Math.min(vw - CARD_W - MARGIN, left));
    const clampY = (top: number) => Math.max(MARGIN, Math.min(vh - cardH - MARGIN, top));
    const arrowX = (left: number) => Math.max(28, Math.min(CARD_W - 28, cx - left));
    const arrowY = (top: number) => Math.max(28, Math.min(cardH - 28, cy - top));

    if (hole.bottom + GAP + cardH + MARGIN <= vh) {
        const left = clampX(cx - CARD_W / 2);
        return { top: hole.bottom + GAP, left, arrow: { side: "top", x: arrowX(left), y: 0 } };
    }
    if (hole.top - GAP - cardH >= MARGIN) {
        const left = clampX(cx - CARD_W / 2);
        return { top: hole.top - GAP - cardH, left, arrow: { side: "bottom", x: arrowX(left), y: 0 } };
    }
    if (hole.right + GAP + CARD_W + MARGIN <= vw) {
        const top = clampY(cy - cardH / 2);
        return { top, left: hole.right + GAP, arrow: { side: "left", x: 0, y: arrowY(top) } };
    }
    if (hole.left - GAP - CARD_W >= MARGIN) {
        const top = clampY(cy - cardH / 2);
        return { top, left: hole.left - GAP - CARD_W, arrow: { side: "right", x: 0, y: arrowY(top) } };
    }
    // Oversized target: overlap is unavoidable, so keep it to a corner sliver.
    const top = vh - hole.bottom >= hole.top ? clampY(hole.bottom + GAP) : clampY(hole.top - GAP - cardH);
    const left = cx <= vw / 2 ? vw - CARD_W - MARGIN : MARGIN;
    return { top, left, arrow: null };
}

/**
 * The guided-tour renderer. Two card shapes share one content language:
 * - Opener (no spotlight target): a large split panel — copy, tip box and
 *   icon feature rows on the left, a full-bleed chapter illustration on the
 *   right (chapters without art yet fall back to their SVG spot scene on a
 *   tinted panel).
 * - Anchored: a compact card that glides beside the spotlit target.
 * Steps can carry a live integration-status row (email for invites, AI key
 * for AI tools, Search Console for SEO data) with a Connect CTA. Content
 * staggers in on the house ease; everything honors prefers-reduced-motion.
 */
const TourOverlay = () => {
    const { active, connected, connLoading, next, back, close } = useTour();
    const reduced = useReducedMotion();

    const step: TourStep | undefined = active?.chapter.steps[active.index];
    const stepKey = active ? `${active.chapter.id}:${step?.id}` : null;

    const [rect, setRect] = useState<Rect | null>(null);
    const [vp, setVp] = useState(() =>
        typeof window === "undefined" ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight },
    );
    const [cardH, setCardH] = useState(300);
    const [celebrating, setCelebrating] = useState(false);
    const [, bumpImages] = useState(0);
    const cardRef = useRef<HTMLDivElement>(null);

    // Locate + track the step target with a per-frame measure loop. Event
    // listeners miss layout shifts that fire no scroll/resize (data loading in,
    // entrance animations settling, panels expanding), which left the spotlight
    // ring stranded where the target USED to be. One rect read per frame is
    // cheap, runs only while a chapter plays, and setState bails when nothing
    // moved. Anchors that mount late are picked up whenever they appear; a
    // target that never appears leaves rect null (centered card).
    useLayoutEffect(() => {
        setRect(null);
        const selector = step?.target;
        let cancelled = false;
        let raf = 0;
        let scrolled = false;

        const sync = () => {
            if (cancelled) return;
            setVp((prev) =>
                prev.w === window.innerWidth && prev.h === window.innerHeight
                    ? prev
                    : { w: window.innerWidth, h: window.innerHeight },
            );
            // Keep the card height current too: the one-shot measure effect can
            // catch the OUTGOING card while AnimatePresence swaps steps, and a
            // stale height makes the placement math hang the card over the
            // spotlight.
            const card = cardRef.current;
            if (card) {
                const h = card.offsetHeight;
                setCardH((prev) => (prev === h ? prev : h));
            }
            if (!selector) return;
            const el = document.querySelector(selector);
            if (!el) return;
            const next = measure(el);
            // Hidden or zero-size match: treat as not found (keep last rect).
            if (next.w <= 0 || next.h <= 0) return;
            if (!scrolled) {
                scrolled = true;
                el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
            }
            setRect((prev) =>
                prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h
                    ? prev
                    : next,
            );
        };

        // Fast path: re-measure every painted frame.
        const loop = () => {
            if (cancelled) return;
            sync();
            raf = requestAnimationFrame(loop);
        };
        loop();
        // Safety net: browsers suspend rAF in hidden/occluded tabs and can
        // throttle it (battery saver, embedded frames). The interval keeps the
        // measurement fresh regardless, and the listeners react instantly.
        const timer = window.setInterval(sync, 200);
        window.addEventListener("resize", sync);
        window.addEventListener("scroll", sync, true);

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            window.clearInterval(timer);
            window.removeEventListener("resize", sync);
            window.removeEventListener("scroll", sync, true);
        };
    }, [stepKey, step?.target, reduced]);

    // The card's real height feeds the placement math.
    useLayoutEffect(() => {
        if (cardRef.current) setCardH(cardRef.current.offsetHeight);
    }, [stepKey, rect, connLoading]);

    // When no clear strip fits the card (large target after the centering
    // scroll), try to buy one below or above by nudging the scroll position —
    // once per step, after measurements settle. Only if that's impossible does
    // the card stay in its minimal-overlap corner.
    const adjustedFor = useRef<string | null>(null);
    useEffect(() => {
        if (!rect || !stepKey || !step?.target || adjustedFor.current === stepKey) return;
        const selector = step.target;
        const timer = window.setTimeout(() => {
            adjustedFor.current = stepKey;
            const el = document.querySelector(selector);
            const card = cardRef.current;
            if (!el || !card) return;
            const r = el.getBoundingClientRect();
            const ch = card.offsetHeight;
            const w = window.innerWidth;
            const h = window.innerHeight;
            // 8px cushion: a placement that only just fits is one subpixel of
            // rounding away from falling back to the overlap corner, so treat
            // near-fits as misses and nudge them into clean fits.
            const fitsSomewhere =
                r.bottom + PAD + GAP + ch + MARGIN + 8 <= h ||
                r.top - PAD - GAP - ch >= MARGIN + 8 ||
                r.right + PAD + GAP + CARD_W + MARGIN + 8 <= w ||
                r.left - PAD - GAP - CARD_W >= MARGIN + 8;
            if (fitsSomewhere) return;
            const scroller = scrollParentOf(el);
            if (!scroller) return;
            const needBelow = r.bottom + PAD + GAP + ch + MARGIN + 8 - h;
            const needAbove = MARGIN + 8 + ch + GAP + PAD - r.top;
            if (needBelow > 0 && r.top - needBelow >= SAFE_TOP) {
                scroller.scrollBy({ top: needBelow, behavior: reduced ? "auto" : "smooth" });
            } else if (needAbove > 0 && r.bottom + needAbove <= h - MARGIN) {
                scroller.scrollBy({ top: -needAbove, behavior: reduced ? "auto" : "smooth" });
            }
        }, 450);
        return () => window.clearTimeout(timer);
    }, [stepKey, rect, cardH, step?.target, reduced]);

    const isLast = !!active && active.index === active.chapter.steps.length - 1;

    const finish = useCallback(() => {
        if (reduced) {
            close("done");
            return;
        }
        setCelebrating(true);
        window.setTimeout(() => {
            setCelebrating(false);
            close("done");
        }, 650);
    }, [close, reduced]);

    // Keyboard: arrows step, Enter advances, Escape skips.
    useEffect(() => {
        if (!active) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") close("skip");
            else if (e.key === "ArrowRight" || e.key === "Enter") {
                e.preventDefault();
                if (isLast) finish();
                else next();
            } else if (e.key === "ArrowLeft") back();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [active, isLast, next, back, close, finish]);

    if (!active || !step) return null;

    const { chapter, index } = active;
    const met = step.requires ? requirementMet(step.requires, connected) : true;
    const vw = vp.w;
    const vh = vp.h;
    // The spotlight and the card both aim at the VISIBLE part of the target,
    // so oversized anchors never push either off-screen.
    const shown = rect ? clampToViewport(rect, vw, vh) : null;
    const pos = shown && shown.w > 0 && shown.h > 0 ? cardPosition(shown, cardH, vw, vh) : null;
    const opener = !pos;
    const Scene = TOUR_SCENES[chapter.id];
    const image = chapter.image && !MISSING_IMAGES.has(chapter.image) ? chapter.image : null;

    // Content blocks stagger in on the house ease, replaying on every step
    // because the card remounts (AnimatePresence keys on the step).
    const container = {
        hidden: {},
        show: { transition: { staggerChildren: reduced ? 0 : 0.055, delayChildren: reduced ? 0 : 0.05 } },
    };
    const item = {
        hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: reduced ? 0.05 : 0.4, ease: EASE } },
    };

    /* ── Shared content blocks ───────────────────────────────────────────── */

    const chipRow = (
        <motion.div variants={item} className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-lavender-mist px-2.5 py-1.5 text-caption-1 font-bold text-primary dark:bg-primary/15 dark:text-lilac">
                <Icon name={chapter.icon} className="h-4 w-4 fill-current" />
                {chapter.title}
            </span>
            <span className="text-caption-1 text-grey">
                {index + 1} of {chapter.steps.length}
            </span>
            {!opener && (
                <button
                    type="button"
                    onClick={() => close("skip")}
                    aria-label="Skip tour"
                    className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-grey transition-colors hover:bg-grey-light/60 hover:text-black dark:hover:bg-dark-3 dark:hover:text-white"
                >
                    <Icon name="close" className="h-3.5 w-3.5 fill-current" />
                </button>
            )}
        </motion.div>
    );

    const title = (
        <motion.h3
            variants={item}
            className={cn(
                "font-poppins font-bold text-black dark:text-white",
                opener ? "mt-5 text-h3" : "mt-3.5 text-h5 font-bold",
            )}
        >
            {step.title}
            {step.emoji && <>{" "}{step.emoji}</>}
        </motion.h3>
    );

    const body = (
        <motion.p variants={item} className={cn("text-body text-grey leading-relaxed", opener ? "mt-3" : "mt-2")}>
            {step.body}
        </motion.p>
    );

    const tip = step.tip && (
        <motion.div
            variants={item}
            className={cn(
                "flex items-start gap-2.5 rounded-2xl bg-lavender-mist/80 px-4 dark:bg-primary/10",
                opener ? "mt-5 py-3.5" : "mt-4 py-3.5",
            )}
        >
            {opener ? (
                <Icon name="sparkles" className="mt-0.5 h-4 w-4 shrink-0 fill-warning" />
            ) : (
                <span aria-hidden className="text-sm leading-5">💡</span>
            )}
            <p className="text-caption-1 font-semibold leading-snug text-primary dark:text-lilac">{step.tip}</p>
        </motion.div>
    );

    const features = step.features?.length ? (
        <div className={cn("flex flex-col", opener ? "mt-5 gap-4" : "mt-3.5 gap-3")}>
            {step.features.map((f) => (
                <motion.div key={f.title} variants={item} className="flex items-start gap-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lavender-mist dark:bg-dark-3">
                        <Icon name={f.icon} className="h-5 w-5 fill-primary dark:fill-lilac" />
                    </span>
                    <span className="min-w-0 pt-0.5">
                        <span className="block text-caption-1 font-bold text-black dark:text-white">{f.title}</span>
                        <span className="block text-caption-1 leading-snug text-grey">{f.body}</span>
                    </span>
                </motion.div>
            ))}
        </div>
    ) : null;

    const requirement = step.requires && !connLoading && (
        <motion.div variants={item} className={cn("flex items-start gap-3.5", opener ? "mt-5" : "mt-3.5")}>
            <span
                className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                    met ? "bg-success/10" : "bg-warning/10",
                )}
            >
                <Icon name={met ? "check" : "info"} className={cn("h-5 w-5", met ? "fill-success" : "fill-warning")} />
            </span>
            <span className="min-w-0 pt-0.5">
                <span className={cn("block text-caption-1 font-bold", met ? "text-success" : "text-black dark:text-white")}>
                    {met ? `${step.requires.label} connected` : `Needs ${step.requires.label}`}
                </span>
                {!met && (
                    <>
                        <span className="block text-caption-1 leading-snug text-grey">{step.requires.note}</span>
                        <Link href={step.requires.href} onClick={() => close("skip")} className="btn-secondary btn-sm mt-2.5">
                            <Icon name="plus" className="h-3.5 w-3.5 fill-current" />
                            {step.requires.cta}
                        </Link>
                    </>
                )}
            </span>
        </motion.div>
    );

    const footer = (
        <motion.div variants={item} className={cn("flex items-center", opener ? "mt-7 pt-1" : "mt-5")}>
            <div className="flex min-w-0 shrink items-center gap-1.5">
                {chapter.steps.map((s, i) => (
                    <span
                        key={s.id}
                        className={cn(
                            "h-2 shrink-0 rounded-full transition-all duration-300",
                            i === index ? "w-5 bg-primary" : "w-2 bg-grey-light dark:bg-dark-3",
                            i < index && "bg-primary/40",
                        )}
                    />
                ))}
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {index > 0 &&
                    (opener ? (
                        <button type="button" onClick={back} className="btn-ghost btn-md">
                            Back
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={back}
                            aria-label="Back"
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-grey transition-colors hover:bg-lavender-mist hover:text-primary dark:hover:bg-dark-3"
                        >
                            <Icon name="arrow-left" className="h-4 w-4 fill-current" />
                        </button>
                    ))}
                <button
                    type="button"
                    onClick={() => close("skip")}
                    className="px-1 text-body-sm font-semibold text-grey transition-colors hover:text-black dark:hover:text-white"
                >
                    Skip tour
                </button>
                <button
                    type="button"
                    onClick={isLast ? finish : next}
                    className={cn("btn-primary", opener ? "px-5" : "btn-md px-4")}
                >
                    {isLast ? "Finish" : "Next"}
                    <Icon name={isLast ? "check" : "arrow-right"} className="h-4 w-4 fill-white" />
                </button>
            </div>
        </motion.div>
    );

    const burst = celebrating && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center overflow-visible">
            {BURST.map((p, i) => (
                <motion.span
                    key={i}
                    className="absolute h-2 w-2 rounded-full"
                    style={{ background: p.color }}
                    initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                    animate={{ x: p.x, y: p.y, opacity: 0, scale: 0.4 }}
                    transition={{ duration: 0.6, ease: EASE }}
                />
            ))}
        </div>
    );

    /* ── Card shapes ─────────────────────────────────────────────────────── */

    const card = opener ? (
        <motion.div
            key={stepKey}
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${chapter.title} tour, step ${index + 1} of ${chapter.steps.length}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.985 }}
            transition={{ duration: reduced ? 0.05 : 0.3, ease: EASE }}
            className="pointer-events-auto relative grid max-h-[calc(100vh-2rem)] w-[56rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.75rem] bg-white shadow-[0_2rem_4.5rem_rgba(26,26,46,0.35)] ring-1 ring-grey-light md:grid-cols-[10fr_9fr] dark:bg-dark-1 dark:ring-grey-light/10"
        >
            {/* Left: content */}
            <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col overflow-y-auto p-7 sm:p-9">
                {chipRow}
                {title}
                {body}
                {tip}
                {features}
                {requirement}
                <div className="grow" />
                {footer}
            </motion.div>

            {/* Right: full-bleed chapter illustration (spot-scene fallback) */}
            <div className="relative hidden min-h-[33rem] md:block">
                {image ? (
                    <motion.img
                        src={image}
                        alt=""
                        onError={() => {
                            MISSING_IMAGES.add(image);
                            bumpImages((n) => n + 1);
                        }}
                        className="absolute inset-0 h-full w-full object-cover"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: reduced ? 0.05 : 0.7, ease: EASE }}
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-lavender-mist dark:bg-dark-3/60">
                        {Scene && <Scene size={320} />}
                    </div>
                )}
            </div>

            {/* Close: floats over the illustration edge */}
            <button
                type="button"
                onClick={() => close("skip")}
                aria-label="Skip tour"
                className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-grey shadow-lift backdrop-blur-sm transition-colors hover:text-black dark:bg-dark-1/85 dark:hover:text-white"
            >
                <Icon name="close" className="h-4 w-4 fill-current" />
            </button>

            {burst}
        </motion.div>
    ) : (
        <motion.div
            key={stepKey}
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`${chapter.title} tour, step ${index + 1} of ${chapter.steps.length}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: reduced ? 0.05 : 0.26, ease: EASE }}
            className="pointer-events-auto absolute w-[24rem] max-w-[calc(100vw-2rem)] rounded-3xl bg-white p-6 shadow-[0_1.5rem_3.5rem_rgba(26,26,46,0.28)] ring-1 ring-grey-light dark:bg-dark-1 dark:ring-grey-light/10"
            style={pos ? { top: pos.top, left: pos.left } : undefined}
        >
            <motion.div variants={container} initial="hidden" animate="show">
                {chipRow}
                {title}
                {body}
                {tip}
                {features}
                {requirement}
                {footer}
            </motion.div>
            {/* Caret pointing at the spotlit target. Rendered last so it covers
                the card's hairline ring where they meet. */}
            {pos?.arrow && (
                <span
                    aria-hidden
                    className="absolute h-4 w-4 rotate-45 rounded-[3px] bg-white dark:bg-dark-1"
                    style={
                        pos.arrow.side === "top"
                            ? { top: -7, left: pos.arrow.x - 8 }
                            : pos.arrow.side === "bottom"
                              ? { bottom: -7, left: pos.arrow.x - 8 }
                              : pos.arrow.side === "left"
                                ? { left: -7, top: pos.arrow.y - 8 }
                                : { right: -7, top: pos.arrow.y - 8 }
                    }
                />
            )}
            {burst}
        </motion.div>
    );

    return (
        <div className="fixed inset-0 z-[80] overflow-hidden">
            {/* Click shield: the tour owns the screen while a chapter plays. */}
            <div className="absolute inset-0" aria-hidden />

            {shown && pos ? (
                /* Spotlight: four ink panels dim everything around the hole.
                   (A giant box-shadow spread would be simpler, but Chromium
                   silently drops very large shadow spreads on composited
                   layers, so the dim never painted. Panels always paint.)
                   All five pieces share one transition so the hole glides as
                   a unit between targets. Keys keep React from recycling
                   these nodes into the centered dim layer below.
                   Geometry is whole-pixel (no seams on fractional-DPR
                   displays) and the hole is clamped to the viewport: where the
                   target meets an edge, the ring is pushed just past it so no
                   stray line paints (the root clips overflow). */
                (() => {
                    const hole = {
                        top: Math.round(Math.max(shown.y - PAD, -4)),
                        left: Math.round(Math.max(shown.x - PAD, -4)),
                        right: Math.round(Math.min(shown.x + shown.w + PAD, vw + 4)),
                        bottom: Math.round(Math.min(shown.y + shown.h + PAD, vh + 4)),
                    };
                    const holeW = Math.max(0, hole.right - hole.left);
                    const holeH = Math.max(0, hole.bottom - hole.top);
                    const glide = reduced ? { duration: 0 } : { duration: 0.45, ease: EASE };
                    return (
                        <>
                            <motion.div
                                key="dim-top"
                                className="absolute inset-x-0 top-0 bg-ink/50 backdrop-blur-sm"
                                initial={false}
                                animate={{ height: Math.max(0, hole.top) }}
                                transition={glide}
                            />
                            <motion.div
                                key="dim-bottom"
                                className="absolute inset-x-0 bottom-0 bg-ink/50 backdrop-blur-sm"
                                initial={false}
                                animate={{ height: Math.max(0, vh - hole.bottom) }}
                                transition={glide}
                            />
                            <motion.div
                                key="dim-left"
                                className="absolute left-0 bg-ink/50 backdrop-blur-sm"
                                initial={false}
                                animate={{ top: hole.top, height: holeH, width: Math.max(0, hole.left) }}
                                transition={glide}
                            />
                            <motion.div
                                key="dim-right"
                                className="absolute right-0 bg-ink/50 backdrop-blur-sm"
                                initial={false}
                                animate={{ top: hole.top, height: holeH, width: Math.max(0, vw - hole.right) }}
                                transition={glide}
                            />
                            <motion.div
                                key="spotlight"
                                className="pointer-events-none absolute rounded-2xl ring-2 ring-primary/50"
                                initial={false}
                                animate={{ top: hole.top, left: hole.left, width: holeW, height: holeH }}
                                transition={glide}
                            >
                                {/* Soft halo pulse on the live target. A fixed-spread
                                    shadow ripple, NOT a scale — scaling a viewport-wide
                                    ring threw its border tens of pixels outside the
                                    highlight. Shadow spread is the same few px on any
                                    target size. */}
                                {!reduced && (
                                    <motion.span
                                        className="absolute inset-0 rounded-2xl"
                                        animate={{
                                            boxShadow: [
                                                "0 0 0 2px rgba(108, 92, 231, 0.5)",
                                                "0 0 0 10px rgba(108, 92, 231, 0)",
                                            ],
                                        }}
                                        transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity }}
                                    />
                                )}
                            </motion.div>
                        </>
                    );
                })()
            ) : (
                <motion.div
                    key="dim"
                    className="absolute inset-0 bg-ink/50 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: reduced ? 0 : 0.2 }}
                />
            )}

            {pos ? (
                <AnimatePresence mode="wait" initial={false}>
                    {card}
                </AnimatePresence>
            ) : (
                <div className="absolute inset-0 grid place-items-center p-4">
                    <AnimatePresence mode="wait" initial={false}>
                        {card}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default TourOverlay;
