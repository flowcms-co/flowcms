import { redirect } from "next/navigation";

/** "Link Suggestions" moved into the SEO suite as the automated internal-link
 *  finder. Keep this route as a permanent redirect for old links/bookmarks. */
export default function AiLinksRoute() {
    redirect("/seo/structure?tab=internal-links");
}
