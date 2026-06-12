import PageHeader from "@/components/shell/PageHeader";
import Knowledge from "@/templates/settings/Knowledge";
import { NAV } from "@/lib/navigation";

const aiTabs = NAV.find((n) => n.href === "/ai")?.tabs;

export default function AiKnowledgeRoute() {
    return (
        <>
            <PageHeader
                title="AI Tools"
                intro="The Brain: the brand voice, writing rules, and auto-learning memory your AI reads before every task."
                tabs={aiTabs}
            />
            <Knowledge />
        </>
    );
}
