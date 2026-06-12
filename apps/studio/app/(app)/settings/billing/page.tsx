import { redirect } from "next/navigation";

/** Merged into Plan & license. Permanent redirect for old links/bookmarks. */
export default function SettingsBillingRoute() {
    redirect("/settings/plan");
}
