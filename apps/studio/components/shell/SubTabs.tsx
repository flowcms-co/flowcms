"use client";

import ScrollableTabs from "@/components/shell/ScrollableTabs";

export type SubTab = { id: string; label: string };

/** Secondary tab row used inside section pages (SEO Keywords/Markup/Structure, AI
 *  Proofreading, the combined Settings pages). Stays on one line at every width:
 *  scrolls with an edge-fade affordance when it overflows, never wraps. */
const SubTabs = ({ tabs, active, onSelect }: { tabs: SubTab[]; active: string; onSelect: (id: string) => void }) => (
    <ScrollableTabs>
        {tabs.map((t) => (
            <button
                key={t.id}
                type="button"
                onClick={() => onSelect(t.id)}
                data-active={active === t.id ? "true" : undefined}
                data-tour-tab={t.id}
                className={`shrink-0 px-4 py-2 rounded-md text-menu transition-colors ${
                    active === t.id ? "bg-primary text-white shadow-glow" : "text-grey hover:text-primary hover:bg-lavender-mist dark:hover:bg-dark-1"
                }`}
            >
                {t.label}
            </button>
        ))}
    </ScrollableTabs>
);

export default SubTabs;
