import PageHeader from "@/components/shell/PageHeader";
import CalendarPage from "@/templates/CalendarPage";
import { NAV } from "@/lib/navigation";

const contentTabs = NAV.find((n) => n.href === "/content")?.tabs;

export default function ContentCalendarRoute() {
    return (
        <>
            <PageHeader
                title="Content"
                intro="Plan and schedule your content across the month."
                tabs={contentTabs}
            />
            <CalendarPage />
        </>
    );
}
