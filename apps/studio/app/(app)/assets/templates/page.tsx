import PageHeader from "@/components/shell/PageHeader";
import Templates from "@/templates/AssetsPage/Templates";
import { NAV } from "@/lib/navigation";

const assetsTabs = NAV.find((n) => n.href === "/assets")?.tabs;

export default function AssetsTemplatesRoute() {
    return (
        <>
            <PageHeader
                title="Assets"
                intro="Reusable page templates to start content faster."
                tabs={assetsTabs}
            />
            <Templates />
        </>
    );
}
