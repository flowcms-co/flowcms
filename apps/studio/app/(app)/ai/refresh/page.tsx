import PageHeader from "@/components/shell/PageHeader";
import Refresh from "@/templates/ai/Refresh";
import { NAV } from "@/lib/navigation";

const aiTabs = NAV.find((n) => n.href === "/ai")?.tabs;

export default function AiRefreshRoute() {
    return (
        <>
            <PageHeader
                title="AI Tools"
                intro="Content decay tracker: refresh pages losing traffic."
                tabs={aiTabs}
            />
            <Refresh />
        </>
    );
}
