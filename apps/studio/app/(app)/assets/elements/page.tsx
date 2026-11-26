import PageHeader from "@/components/shell/PageHeader";
import ElementTemplates from "@/templates/AssetsPage/ElementTemplates";
import { NAV } from "@/lib/navigation";

const assetsTabs = NAV.find((n) => n.href === "/assets")?.tabs;

export default function AssetsElementsRoute() {
    return (
        <>
            <PageHeader title="Assets" intro="Premade elements for your articles, in your brand." tabs={assetsTabs} />
            <ElementTemplates />
        </>
    );
}
