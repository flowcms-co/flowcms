import ContentTabsHeader from "@/components/shell/ContentTabsHeader";
import ContentQuality from "@/templates/ContentQuality";

export default function ContentQualityRoute() {
    return (
        <>
            <ContentTabsHeader title="Content" intro="What your content scan flagged, with a direct path to fix each page." />
            <ContentQuality />
        </>
    );
}
