import { redirect } from "next/navigation";

/** Folded into the Developers page. Permanent redirect for old links/bookmarks. */
export default function SettingsOpenApiRoute() {
    redirect("/settings/developers?tab=api-docs");
}
