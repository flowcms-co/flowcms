import { redirect } from "next/navigation";

// Structure split: Topical Clusters became a top-level tab; Internal links became a
// hidden report page.
export default async function RedirectRoute({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    const { tab } = await searchParams;
    redirect(tab === "internal-links" ? "/seo/internal-links" : "/seo/clusters");
}
