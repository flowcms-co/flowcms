"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Strong ease-out (emil's UI curve) — feels intentional, lands snappy. */
const EASE = [0.16, 1, 0.3, 1] as const;

/**
 * Entrance reveal for dashboard sections. Fades + lifts content into view once,
 * with a small per-item delay for stagger. Honors prefers-reduced-motion
 * (renders static, no transform). Keep `index` sequential within a group.
 */
const Reveal = ({
    children,
    index = 0,
    className,
    y = 12,
}: {
    children: ReactNode;
    index?: number;
    className?: string;
    y?: number;
}) => {
    const reduce = useReducedMotion();
    return (
        <motion.div
            className={className}
            initial={reduce ? false : { opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : index * 0.05, ease: EASE }}
        >
            {children}
        </motion.div>
    );
};

export default Reveal;
