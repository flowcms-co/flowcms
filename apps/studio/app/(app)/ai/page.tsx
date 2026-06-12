import PageHeader from "@/components/shell/PageHeader";
import ContentGenerator from "@/templates/ai/ContentGenerator";
import { NAV } from "@/lib/navigation";

const aiTabs = NAV.find((n) => n.href === "/ai")?.tabs;

export default function AiRoute() {
    return (
        <>
            <PageHeader
                title="AI Tools"
                intro="Generate, check, and improve content with AI."
                tabs={aiTabs}
            />
            <ContentGenerator />
        </>
    );
}
