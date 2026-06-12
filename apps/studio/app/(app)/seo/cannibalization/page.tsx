import BackLink from "@/components/shell/BackLink";
import PageHeader from "@/components/shell/PageHeader";
import Cannibalization from "@/templates/seo/Cannibalization";

export default function SeoCannibalizationRoute() {
    return (
        <>
            <BackLink />
            <PageHeader
                title="Keyword cannibalization"
                intro="Where multiple pages compete for the same query, splitting your ranking signals."
            />
            <Cannibalization />
        </>
    );
}
