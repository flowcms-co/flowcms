import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import TopPagesReport from "@/templates/seo/TopPagesReport";

/**
 * Top Pages report. Live from Search Console (clicks, impressions, CTR, position).
 * Reached from the dashboard Top Pages card.
 */
export default function SeoPagesRoute() {
    return (
        <>
            <BackLink />
            <PageHeader title="Top Pages" />
            <TopPagesReport />
        </>
    );
}
