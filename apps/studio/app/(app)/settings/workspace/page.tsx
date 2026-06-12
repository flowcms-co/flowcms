import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import WorkspaceSettings from "@/templates/settings/WorkspaceSettings";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsWorkspaceRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Team members, roles & permissions, and workspace controls." tabs={settingsTabs} />
            <Suspense fallback={null}>
                <WorkspaceSettings />
            </Suspense>
        </>
    );
}
