import PageHeader from "@/components/shell/PageHeader";
import Profile from "@/templates/settings/Profile";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

export default function SettingsRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Your profile, preferences and account." tabs={settingsTabs} />
            <Profile />
        </>
    );
}
