"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import Integrations from "@/templates/settings/Integrations";
import AnalyticsConnect from "@/templates/settings/AnalyticsConnect";
import SeoConnectors from "@/templates/settings/SeoConnectors";
import ConnectorsSection from "@/templates/settings/ConnectorsSection";
import EmailSettings from "@/templates/settings/EmailSettings";

const TABS: SubTab[] = [
    { id: "ai", label: "AI" },
    { id: "analytics", label: "Analytics & Search" },
    { id: "automation", label: "Automation" },
    { id: "email", label: "Email" },
];

/**
 * Integrations — grouped by category into sub-tabs:
 *  • AI: provider keys (OpenAI, Anthropic, …)
 *  • Analytics & Search: Search Console / GA4 + SEO data providers
 *  • Automation: Slack / Zapier
 *  • Email: SMTP + transactional templates
 */
const IntegrationsSettings = () => {
    const params = useSearchParams();
    const router = useRouter();
    const requested = params.get("tab");
    const active = TABS.some((t) => t.id === requested) ? (requested as string) : "ai";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={TABS} active={active} onSelect={(id) => router.replace(`/settings/integrations?tab=${id}`)} />
            {active === "ai" && <Integrations />}
            {active === "analytics" && (
                <div className="flex flex-col gap-8">
                    <AnalyticsConnect />
                    <SeoConnectors />
                </div>
            )}
            {active === "automation" && <ConnectorsSection />}
            {active === "email" && <EmailSettings />}
        </div>
    );
};

export default IntegrationsSettings;
