"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import SchemaPage from "@/templates/SchemaPage";
import Localization from "@/templates/settings/Localization";
import Import from "@/templates/settings/Import";

const TABS: SubTab[] = [
    { id: "content-model", label: "Content Model" },
    { id: "localization", label: "Localization" },
    { id: "import", label: "Import" },
];

/** Content settings — the schema builder, locales, and content import in one page. */
const ContentSettings = () => {
    const params = useSearchParams();
    const router = useRouter();
    const requested = params.get("tab");
    const active = TABS.some((t) => t.id === requested) ? (requested as string) : "content-model";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={TABS} active={active} onSelect={(id) => router.replace(`/settings/content?tab=${id}`)} />
            {active === "content-model" && <SchemaPage />}
            {active === "localization" && <Localization />}
            {active === "import" && <Import />}
        </div>
    );
};

export default ContentSettings;
