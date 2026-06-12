import PageHeader from "@/components/shell/PageHeader";
import ContentTable from "@/templates/ContentPage/ContentTable";
import { NAV } from "@/lib/navigation";

const contentTabs = NAV.find((n) => n.href === "/content")?.tabs;

export default function ContentPage() {
    return (
        <>
            {/* No page-level "New Content" action — the topbar already provides it. */}
            <PageHeader
                title="Content"
                intro="All your content: drafts, scheduled, and live."
                tabs={contentTabs}
            />
            <ContentTable />
        </>
    );
}
