import { redirect } from "next/navigation";

/** Folded into the Developers page. Permanent redirect for old links/bookmarks. */
export default function SettingsWebhooksRoute() {
    redirect("/settings/developers?tab=webhooks");
}
