import { redirect } from "next/navigation";
import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import Keywords from "@/templates/seo/Keywords";

export default async function SeoKeywordsRoute({
    searchParams,
}: {
    searchParams: Promise<{ tab?: string }>;
}) {
    // Cannibalization moved to its own report page.
    const { tab } = await searchParams;
    if (tab === "cannibalization") redirect("/seo/cannibalization");

    return (
        <>
            <BackLink />
            <PageHeader
                title="Keywords"
                intro="Your rankings and ranking distribution from Search Console, with optional volume and difficulty."
            />
            <Keywords />
        </>
    );
}
