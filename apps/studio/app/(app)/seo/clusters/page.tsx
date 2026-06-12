import PageHeader from "@/components/shell/PageHeader";
import Clusters from "@/templates/seo/Clusters";
import { NAV } from "@/lib/navigation";

const seoTabs = NAV.find((n) => n.href === "/seo")?.tabs;

export default function SeoClustersRoute() {
    return (
        <>
            <PageHeader
                title="Topical Clusters"
                intro="The topics you own and where you are thin: pillar pages, supporting coverage and content gaps."
                tabs={seoTabs}
            />
            <Clusters />
        </>
    );
}
