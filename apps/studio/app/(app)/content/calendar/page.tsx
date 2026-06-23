import ContentTabsHeader from "@/components/shell/ContentTabsHeader";
import CalendarPage from "@/templates/CalendarPage";

export default function ContentCalendarRoute() {
    return (
        <>
            <ContentTabsHeader title="Content" intro="Plan and schedule your content across the month." />
            <CalendarPage />
        </>
    );
}
