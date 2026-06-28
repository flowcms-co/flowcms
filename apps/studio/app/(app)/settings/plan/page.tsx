import PageHeader from "@/components/shell/PageHeader";
import Billing from "@/templates/settings/Billing";
import BillingPortal from "@/templates/settings/BillingPortal";
import OrgDetails from "@/templates/settings/OrgDetails";
import License from "@/templates/settings/License";
import { NAV } from "@/lib/navigation";

const settingsTabs = NAV.find((n) => n.href === "/settings")?.tabs;

/** Plan & license — manage the subscription (BillingPortal, when Stripe-billed), organization
 *  details (OrgDetails), compare editions (Billing) and activate a key (License). */
export default function SettingsPlanRoute() {
    return (
        <>
            <PageHeader title="Settings" intro="Your edition, subscription, organization details, license key, and how to upgrade." tabs={settingsTabs} />
            <div className="flex flex-col gap-6">
                <BillingPortal />
                <OrgDetails />
                <Billing />
                <License />
            </div>
        </>
    );
}
