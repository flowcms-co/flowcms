import { redirect } from "next/navigation";

/** Folded into the Developers page. Permanent redirect for old links/bookmarks. */
export default function SettingsPluginsRoute() {
    redirect("/settings/developers?tab=plugins");
}
