import ContentTabsHeader from "@/components/shell/ContentTabsHeader";
import ContentTable from "@/templates/ContentPage/ContentTable";

export default function ContentPage() {
    return (
        <>
            {/* No page-level "New Content" action — the topbar already provides it. */}
            <ContentTabsHeader title="Content" intro="All your content: drafts, scheduled, and live." />
            <ContentTable />
        </>
    );
}
