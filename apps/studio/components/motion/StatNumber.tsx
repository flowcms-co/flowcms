"use client";

import CountUp from "@/components/motion/CountUp";

/**
 * Count-up for an already-formatted stat string ("110", "1.2k", "45.2", "0.0%",
 * "1,234"). Parses the leading number + suffix and animates it; renders verbatim
 * if it isn't numeric. Use anywhere a KPI / card number is shown so big numbers
 * count up instead of popping in.
 */
const StatNumber = ({ value, className }: { value: string; className?: string }) => {
    const m = value.match(/^([0-9][\d,]*\.?\d*)(.*)$/);
    if (!m) return <span className={className}>{value}</span>;
    const num = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(num)) return <span className={className}>{value}</span>;
    const decimals = (m[1].split(".")[1] || "").length;
    return <CountUp value={num} decimals={decimals} suffix={m[2]} className={className} />;
};

export default StatNumber;
