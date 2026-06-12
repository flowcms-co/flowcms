"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import Icon from "@/components/ui/Icon";
import { BoxesScene, RocketScene } from "@/templates/setup/illustrations";
import { cn } from "@/lib/cn";
import type { BootTask } from "@/lib/bootMessages";

gsap.registerPlugin(useGSAP);

const STEP = 0.88; // seconds per task step
const HOLD = 1.1;  // hold at completed state before onDone fires

/**
 * Full-screen "setting things up" overlay for the two heavy setup moments
 * (seeding a starter, finishing). Tasks animate through pending → in-progress
 * → done sequentially with a filling progress bar.
 */
const PowerUp = ({
    title,
    tasks,
    onDone,
    scene = "content",
    subtitle = "Hang tight, we're getting everything ready for you.",
}: {
    title: string;
    tasks: BootTask[];
    onDone?: () => void;
    scene?: "content" | "launch";
    subtitle?: string;
}) => {
    const ref = useRef<HTMLDivElement>(null);

    useGSAP(
        () => {
            const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

            // Reduced motion or hidden tab: show finished state immediately.
            if (reduce || document.hidden) {
                gsap.set(ref.current, { autoAlpha: 1 });
                tasks.forEach((_, i) => {
                    gsap.set(`.pu-prog-${i}`, { autoAlpha: 0 });
                    gsap.set(`.pu-done-${i}`, { autoAlpha: 1 });
                });
                const pctEl = ref.current?.querySelector(".pu-pct") as HTMLElement | null;
                if (pctEl) pctEl.textContent = "100%";
                gsap.set(".pu-bar", { scaleX: 1, transformOrigin: "left center" });
                setTimeout(() => onDone?.(), 1200);
                return;
            }

            const total = tasks.length * STEP;
            const counter = { pct: 0 };
            const tl = gsap.timeline({ onComplete: () => onDone?.() });

            // Overlay entrance
            tl.from(ref.current, { autoAlpha: 0, duration: 0.35, ease: "power2.out" }, 0);

            // Illustration pop in
            tl.from(".pu-ill", { scale: 0.82, autoAlpha: 0, duration: 0.7, ease: "back.out(1.5)" }, 0.05);

            // Title + card stagger in
            tl.from(".pu-title", { autoAlpha: 0, y: 14, duration: 0.55, ease: "power2.out", clearProps: "transform,opacity" }, 0.2);
            tl.from(".pu-card", { autoAlpha: 0, y: 12, duration: 0.5, ease: "power2.out", clearProps: "transform,opacity" }, 0.3);
            tl.from(".pu-progress-section", { autoAlpha: 0, y: 8, duration: 0.45, ease: "power2.out", clearProps: "transform,opacity" }, 0.4);
            tl.from(".pu-footer", { autoAlpha: 0, duration: 0.4, ease: "power2.out" }, 0.5);

            // Task progress: each task activates at 0.55 + i * STEP, completes at the next step
            const seqStart = 0.55;
            tasks.forEach((_, i) => {
                const t = seqStart + i * STEP;
                tl.set(`.pu-prog-${i}`, { autoAlpha: 1 }, t);
                tl.set(`.pu-prog-${i}`, { autoAlpha: 0 }, seqStart + (i + 1) * STEP);
                tl.set(`.pu-done-${i}`, { autoAlpha: 1 }, seqStart + (i + 1) * STEP);
            });

            // Progress bar fills across the full sequence
            tl.fromTo(".pu-bar", { scaleX: 0 }, { scaleX: 1, transformOrigin: "left center", duration: total, ease: "power1.inOut" }, seqStart);

            // Percentage counter
            const pctEl = ref.current?.querySelector(".pu-pct") as HTMLElement | null;
            if (pctEl) {
                tl.to(counter, {
                    pct: 100,
                    duration: total,
                    ease: "power1.inOut",
                    onUpdate: () => { pctEl.textContent = Math.round(counter.pct) + "%"; },
                }, seqStart);
            }

            tl.to({}, { duration: HOLD });
        },
        { scope: ref, dependencies: [tasks.map((t) => t.title).join("|")] },
    );

    return (
        <div
            ref={ref}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-[radial-gradient(130%_130%_at_50%_-5%,#EDE8FF_0%,#FAFAFF_60%)] px-5 py-10 text-black dark:bg-[radial-gradient(130%_130%_at_50%_-5%,#221c45_0%,#13121e_60%)] dark:text-white"
        >
            {/* Subtle background dots */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                <span className="absolute -top-20 -left-20 h-64 w-64 rounded-full bg-[#A29BFE]/20 blur-[100px]" />
                <span className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[#6C5CE7]/12 blur-[110px]" />
            </div>

            {/* Illustration */}
            {scene === "launch" ? (
                <RocketScene size={196} className="pu-ill relative mb-5 shrink-0" />
            ) : (
                <BoxesScene size={196} className="pu-ill relative mb-5 shrink-0" />
            )}

            {/* Title */}
            <div className="pu-title relative mb-6 text-center">
                <h2 className="font-poppins text-[1.625rem] font-extrabold leading-tight tracking-[-0.01em]">{title}</h2>
                <p className="mt-1.5 text-caption-1 text-grey dark:text-white/65">{subtitle}</p>
            </div>

            {/* Task list card */}
            <div className="pu-card relative w-full max-w-[520px] overflow-hidden rounded-2xl border border-grey-light bg-white dark:border-white/10 dark:bg-white/[0.05]">
                {tasks.map((task, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex items-center gap-3.5 px-5 py-3.5",
                            i < tasks.length - 1 && "border-b border-grey-light dark:border-white/10",
                        )}
                    >
                        {/* Icon */}
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-[18px] w-[18px] fill-primary" name={task.icon} />
                        </span>

                        {/* Text */}
                        <div className="min-w-0 flex-1">
                            <p className="text-title text-black dark:text-white">{task.title}</p>
                            <p className="text-caption-2 text-grey dark:text-white/55">{task.desc}</p>
                        </div>

                        {/* Status indicators — occupy the same space, swap via opacity */}
                        <div className="relative h-5 w-[98px] shrink-0">
                            {/* In progress */}
                            <div className={`pu-prog-${i} absolute inset-0 flex items-center gap-1.5 opacity-0`}>
                                <svg className="h-4 w-4 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                                    <circle cx="12" cy="12" r="9" stroke="#A29BFE" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="18 38" />
                                </svg>
                                <span className="whitespace-nowrap text-caption-2 font-medium text-primary dark:text-lilac">In progress</span>
                            </div>
                            {/* Done */}
                            <div className={`pu-done-${i} absolute inset-0 flex items-center gap-1.5 opacity-0`}>
                                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success">
                                    <Icon className="h-2.5 w-2.5 fill-white" name="check" />
                                </span>
                                <span className="whitespace-nowrap text-caption-2 font-semibold text-success">Done</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Progress section */}
            <div className="pu-progress-section relative mt-5 w-full max-w-[520px]">
                <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 fill-primary" name="sparkles" />
                    <p className="flex-1 text-caption-2 text-grey dark:text-white/60">
                        <span className="font-semibold text-black dark:text-white">Almost there!</span> This usually takes less than a minute.
                    </p>
                    <span className="pu-pct text-caption-2 font-semibold text-primary dark:text-lilac">0%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/12 dark:bg-primary/20">
                    <div className="pu-bar h-full w-full rounded-full bg-[linear-gradient(90deg,#6C5CE7_0%,#A29BFE_100%)]" />
                </div>
            </div>

            {/* Trust footer */}
            <p className="pu-footer relative mt-5 flex items-center gap-1.5 text-caption-2 text-grey dark:text-white/40">
                <Icon className="h-3.5 w-3.5 shrink-0 fill-current" name="lock" />
                Your data is safe with us. We never share, sell, or modify your content.
            </p>
        </div>
    );
};

export default PowerUp;
