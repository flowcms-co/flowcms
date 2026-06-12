"use client";

import { useState } from "react";
import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import Select from "@/components/ui/Select";
import Aeo from "@/templates/seo/Aeo";

const RANGES = [
    { value: "7", label: "Last 7 days" },
    { value: "30", label: "Last 30 days" },
    { value: "90", label: "Last 90 days" },
];

export default function SeoAeoRoute() {
    const [range, setRange] = useState("30");
    return (
        <>
            <BackLink />
            <PageHeader
                title="AEO / GEO"
                intro="Answer-engine & AI visibility: where you show up in LLMs."
                actions={
                    <Select
                        variant="filter"
                        value={range}
                        onChange={setRange}
                        ariaLabel="Date range"
                        align="end"
                        options={RANGES}
                    />
                }
            />
            <Aeo range={range} />
        </>
    );
}
