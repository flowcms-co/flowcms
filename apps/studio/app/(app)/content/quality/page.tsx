import PageHeader from "@/components/shell/PageHeader";
import ContentQuality from "@/templates/ContentQuality";
import { NAV } from "@/lib/navigation";

const contentTabs = NAV.find((n) => n.href === "/content")?.tabs;

export default function ContentQualityRoute() {
    return (
        <>
            <PageHeader
                title="Content"
                intro="What your content scan flagged, with a direct path to fix each page."
                tabs={contentTabs}
            />
            <ContentQuality />
        </>
    );
}
