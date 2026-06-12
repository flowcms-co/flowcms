import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import ContentSettings from "@/templates/settings/ContentSettings";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsContentRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Content types & fields, localization, and importing content." tabs={settingsTabs} />
            <Suspense fallback={null}>
                <ContentSettings />
            </Suspense>
        </>
    );
}
