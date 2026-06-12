import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import MarkupTabs from "@/templates/seo/MarkupTabs";

export default function SeoMarkupRoute() {
    return (
        <>
            <BackLink />
            <PageHeader
                title="Markup"
                intro="Titles, descriptions and structured data across your pages."
            />
            <MarkupTabs />
        </>
    );
}
