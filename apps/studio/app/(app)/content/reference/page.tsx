import ContentTabsHeader from "@/components/shell/ContentTabsHeader";
import ReferenceContent from "@/templates/ContentPage/ReferenceContent";

export default function ContentReferenceRoute() {
    return (
        <>
            <ContentTabsHeader title="Content" intro="Reference data (tags, cities, …) used by your other pages." />
            <ReferenceContent />
        </>
    );
}
