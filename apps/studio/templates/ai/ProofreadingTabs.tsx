"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import Grammar from "@/templates/ai/Grammar";
import Plagiarism from "@/templates/ai/Plagiarism";

const TABS: SubTab[] = [
    { id: "grammar", label: "Grammar" },
    { id: "plagiarism", label: "Plagiarism" },
];

/** Grammar + Plagiarism (originality) grouped under one Proofreading tab. */
const ProofreadingTabs = () => {
    const params = useSearchParams();
    const router = useRouter();
    const requested = params.get("tab");
    const active = TABS.some((t) => t.id === requested) ? (requested as string) : "grammar";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={TABS} active={active} onSelect={(id) => router.replace(`/ai/proofreading?tab=${id}`)} />
            {active === "grammar" && <Grammar />}
            {active === "plagiarism" && <Plagiarism />}
        </div>
    );
};

export default ProofreadingTabs;
