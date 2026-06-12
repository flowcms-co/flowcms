import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import Developers from "@/templates/settings/Developers";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsDevelopersRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="API keys, webhooks, the API reference, and content plugins." tabs={settingsTabs} />
            <Suspense fallback={null}>
                <Developers />
            </Suspense>
        </>
    );
}
