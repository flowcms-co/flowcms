import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import Activity from "@/templates/settings/Activity";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsActivityRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Every change to content, media, people and settings: who, what, when and from where." tabs={settingsTabs} />
            <Suspense fallback={null}>
                <Activity />
            </Suspense>
        </>
    );
}
