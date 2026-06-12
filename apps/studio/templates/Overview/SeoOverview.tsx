"use client";

import { useRef } from "react";
import SearchPerformanceCard from "@/templates/Overview/SearchPerformanceCard";
import SeoCard from "@/templates/Overview/SeoCard";
import WeeklyProgressCard from "@/templates/Overview/WeeklyProgressCard";
import SeoFocusAreasCard from "@/templates/Overview/SeoFocusAreasCard";
import { useRevealBatch } from "@/lib/useReveal";

/**
 * Search Strategist dashboard:
 *   1. Search performance (65%) + SEO Health (35%) — shared sizing with the main overview
 *   2. This week's progress — weekly wins strip
 *   3. SEO focus areas — the key SEO pillars (Technical Health + AI Visibility live)
 */
const SeoOverview = () => {
    const scope = useRef<HTMLDivElement>(null);
    useRevealBatch(scope);

    return (
        <div ref={scope} className="flex flex-col gap-6">
            <div className="reveal-up grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[65fr_35fr]">
                <SearchPerformanceCard />
                <SeoCard />
            </div>
            <div className="reveal-up">
                <WeeklyProgressCard />
            </div>
            <div className="reveal-up">
                <SeoFocusAreasCard />
            </div>
        </div>
    );
};

export default SeoOverview;
