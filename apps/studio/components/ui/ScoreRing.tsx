"use client";

import { useEffect, useState } from "react";
import {
    CircularProgressbarWithChildren,
    buildStyles,
} from "react-circular-progressbar";
import "react-circular-progressbar/dist/styles.css";
import CountUp from "@/components/motion/CountUp";

/**
 * Animated circular score ring (react-circular-progressbar). The ring sweeps
 * from 0 to the target value, and the centered number counts up in lockstep
 * (via CountUp) instead of snapping straight to the final value.
 */
const ScoreRing = ({
    value,
    label,
    size = 132,
    color = "#6C5CE7",
    suffix,
    valueClassName,
}: {
    value: number;
    label?: string;
    size?: number;
    color?: string;
    /** appended to the centered value, e.g. "%". */
    suffix?: string;
    /** Override the centered value's typography (e.g. a larger, more prominent score). */
    valueClassName?: string;
}) => {
    const [shown, setShown] = useState(0);
    const small = size < 96;

    useEffect(() => {
        const t = setTimeout(() => setShown(value), 120);
        return () => clearTimeout(t);
    }, [value]);

    return (
        <div style={{ width: size, height: size }}>
            <CircularProgressbarWithChildren
                value={shown}
                strokeWidth={small ? 11 : 9}
                styles={buildStyles({
                    pathColor: color,
                    trailColor: `${color}1f`,
                    pathTransitionDuration: 1.1,
                    strokeLinecap: "round",
                })}
            >
                <CountUp
                    value={value}
                    suffix={suffix ?? ""}
                    duration={1.1}
                    className={
                        valueClassName ??
                        (small
                            ? "text-caption-1 font-poppins font-bold text-black dark:text-white"
                            : "text-h3 font-poppins font-semibold text-black dark:text-white")
                    }
                />
                {label && (
                    <span className="text-caption-2 text-grey">{label}</span>
                )}
            </CircularProgressbarWithChildren>
        </div>
    );
};

export default ScoreRing;
