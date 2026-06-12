import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import IntegrationsSettings from "@/templates/settings/IntegrationsSettings";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsIntegrationsRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Connect AI providers, analytics, automation, and transactional email." tabs={settingsTabs} />
            <Suspense fallback={null}>
                <IntegrationsSettings />
            </Suspense>
        </>
    );
}
