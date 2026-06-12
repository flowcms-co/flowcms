import PageHeader from "@/components/shell/PageHeader";
import Security from "@/templates/settings/Security";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsSecurityRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Two-factor authentication and the workspace audit log." tabs={settingsTabs} />
            <Security />
        </>
    );
}
