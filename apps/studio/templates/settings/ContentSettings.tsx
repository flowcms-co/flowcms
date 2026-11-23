"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import SchemaPage from "@/templates/SchemaPage";
import Localization from "@/templates/settings/Localization";
import Import from "@/templates/settings/Import";
import UploadLimits from "@/templates/settings/UploadLimits";
import ContentRulesCard from "@/templates/settings/ContentRulesCard";
import { useAuth } from "@/components/providers/AuthProvider";

const TABS: SubTab[] = [
    { id: "content-model", label: "Content Model" },
    { id: "localization", label: "Localization" },
    { id: "import", label: "Import" },
    { id: "uploads", label: "Uploads" },
    { id: "content-rules", label: "Content rules" },
];

/** Content settings — the schema builder, locales, and content import in one page. */
const ContentSettings = () => {
    const params = useSearchParams();
    const router = useRouter();
    const { can } = useAuth();
    // Content rules are managed by roles that manage the content model.
    const tabs = can("workspace.manage") ? TABS : TABS.filter((t) => t.id !== "content-rules");
    const requested = params.get("tab");
    const active = tabs.some((t) => t.id === requested) ? (requested as string) : "content-model";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={tabs} active={active} onSelect={(id) => router.replace(`/settings/content?tab=${id}`)} />
            {active === "content-model" && <SchemaPage />}
            {active === "localization" && <Localization />}
            {active === "import" && <Import />}
            {active === "uploads" && <UploadLimits />}
            {active === "content-rules" && <ContentRulesCard />}
        </div>
    );
};

export default ContentSettings;
