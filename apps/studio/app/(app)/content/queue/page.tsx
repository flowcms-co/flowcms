import PageHeader from "@/components/shell/PageHeader";
import QueuePage from "@/templates/QueuePage";
import { NAV } from "@/lib/navigation";

const contentTabs = NAV.find((n) => n.href === "/content")?.tabs;

export default function ContentQueueRoute() {
    return (
        <>
            <PageHeader
                title="Content"
                intro="What's going live, and when."
                tabs={contentTabs}
            />
            <QueuePage />
        </>
    );
}
