"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import Meta from "@/templates/seo/Meta";
import JsonLd from "@/templates/seo/JsonLd";

const TABS: SubTab[] = [
    { id: "meta", label: "Meta & Schema" },
    { id: "json-ld", label: "JSON-LD" },
];

/** On-page markup: meta/titles/descriptions + structured data in one tab. */
const MarkupTabs = () => {
    const params = useSearchParams();
    const router = useRouter();
    const requested = params.get("tab");
    const active = TABS.some((t) => t.id === requested) ? (requested as string) : "meta";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={TABS} active={active} onSelect={(id) => router.replace(`/seo/markup?tab=${id}`)} />
            {active === "meta" && <Meta />}
            {active === "json-ld" && <JsonLd />}
        </div>
    );
};

export default MarkupTabs;
