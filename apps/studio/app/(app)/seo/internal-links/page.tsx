import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import InternalLinks from "@/templates/seo/InternalLinks";

export default function SeoInternalLinksRoute() {
    return (
        <>
            <BackLink />
            <PageHeader
                title="Internal links"
                intro="Cross-linking opportunities between your pages: add a relevant link in one click."
            />
            <InternalLinks />
        </>
    );
}
