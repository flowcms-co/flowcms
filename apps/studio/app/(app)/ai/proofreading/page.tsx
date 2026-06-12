import PageHeader from "@/components/shell/PageHeader";
import ProofreadingTabs from "@/templates/ai/ProofreadingTabs";
import { NAV } from "@/lib/navigation";

const aiTabs = NAV.find((n) => n.href === "/ai")?.tabs;

export default function AiProofreadingRoute() {
    return (
        <>
            <PageHeader
                title="AI Tools"
                intro="Check a draft before publishing: grammar and style, plus originality."
                tabs={aiTabs}
            />
            <ProofreadingTabs />
        </>
    );
}
