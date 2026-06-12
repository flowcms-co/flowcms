import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import BacklinksReport from "@/templates/seo/BacklinksReport";

export default function SeoBacklinksRoute() {
    return (
        <>
            <BackLink />
            <PageHeader title="Backlinks" />
            <BacklinksReport />
        </>
    );
}
