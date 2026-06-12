"use client";

import { useRef } from "react";
import KpiStrip from "@/templates/Overview/KpiStrip";
import SearchPerformanceCard from "@/templates/Overview/SearchPerformanceCard";
import SeoCard from "@/templates/Overview/SeoCard";
import ContentCalendarCard from "@/templates/Overview/ContentCalendarCard";
import QuickSuggestionsCard from "@/templates/Overview/QuickSuggestionsCard";
import ActivityCard from "@/templates/Overview/ActivityCard";
import { useRevealBatch } from "@/lib/useReveal";

/**
 * Full dashboard for Super Admin & Admin.
 *
 *   1. KPI strip — Ready to publish / In review / Scheduled / SEO issues
 *   2. Search performance (65%) + SEO score (35%)
 *   3. Content calendar  (65%) + Quick suggestions (35%)
 *   4. Recent activity (full width)
 *
 * Each row stacks to one column at iPad width and below. In the first row the SEO
 * score card is height-matched to the search-performance card (its concern list
 * flexes) so the search-performance chart never stretches taller. Rows reveal
 * (fade + rise) as they scroll into view.
 */
const SharedOverview = () => {
    const scope = useRef<HTMLDivElement>(null);
    useRevealBatch(scope);

    return (
        <div ref={scope} className="flex flex-col gap-6">
            <div className="reveal-up">
                <KpiStrip />
            </div>

            <div className="reveal-up grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[65fr_35fr]">
                <SearchPerformanceCard />
                <SeoCard />
            </div>

            <div className="reveal-up grid grid-cols-1 items-stretch gap-6 xl:grid-cols-[65fr_35fr]">
                <ContentCalendarCard />
                <QuickSuggestionsCard />
            </div>

            <div className="reveal-up">
                <ActivityCard />
            </div>
        </div>
    );
};

export default SharedOverview;
