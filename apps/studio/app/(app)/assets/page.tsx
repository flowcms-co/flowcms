import PageHeader from "@/components/shell/PageHeader";
import AssetsPage from "@/templates/AssetsPage";
import { NAV } from "@/lib/navigation";

const assetsTabs = NAV.find((n) => n.href === "/assets")?.tabs;

export default function AssetsLibraryRoute() {
    return (
        <>
            <PageHeader
                title="Assets"
                intro="Media library: images get AI alt text on upload."
                tabs={assetsTabs}
            />
            <AssetsPage />
        </>
    );
}
