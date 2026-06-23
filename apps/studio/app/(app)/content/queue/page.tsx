import ContentTabsHeader from "@/components/shell/ContentTabsHeader";
import QueuePage from "@/templates/QueuePage";

export default function ContentQueueRoute() {
    return (
        <>
            <ContentTabsHeader title="Content" intro="What's going live, and when." />
            <QueuePage />
        </>
    );
}
