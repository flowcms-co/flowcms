"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A tab / pill row that stays on ONE line at every width. When it overflows it
 * scrolls horizontally (no visible scrollbar) and fades the overflowing edge(s)
 * as a clear affordance; the active item — the child marked `data-active="true"`
 * — is scrolled into view on mount. When everything fits it reads like a normal
 * flex row (no fades).
 *
 * Centering only adjusts this element's own `scrollLeft` (never `scrollIntoView`),
 * so it can't scroll ancestors / make the page jump.
 */
const ScrollableTabs = ({ children, className }: { children: ReactNode; className?: string }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [fade, setFade] = useState({ left: false, right: false });

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const left = el.scrollLeft > 4;
        const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
        setFade((p) => (p.left === left && p.right === right ? p : { left, right }));
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // Center the active tab by setting only this container's scrollLeft.
        const active = el.querySelector<HTMLElement>('[data-active="true"]');
        if (active) {
            el.scrollLeft = Math.max(0, active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2);
        }
        measure();
        el.addEventListener("scroll", measure, { passive: true });
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", measure);
            ro.disconnect();
        };
    }, [measure]);

    // Fade only the edge(s) that actually have more content past them.
    const mask = `linear-gradient(to right, ${fade.left ? "transparent" : "#000"} 0, #000 1.5rem, #000 calc(100% - 1.5rem), ${fade.right ? "transparent" : "#000"} 100%)`;

    return (
        <div
            ref={ref}
            className={cn("relative flex items-center gap-2 overflow-x-auto scrollbar-none scroll-smooth", className)}
            style={{ maskImage: mask, WebkitMaskImage: mask }}
        >
            {children}
        </div>
    );
};

export default ScrollableTabs;
