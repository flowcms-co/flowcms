import PageHeader from "@/components/shell/PageHeader";
import Usage from "@/templates/ai/Usage";
import ModelRoutingCard from "@/templates/ai/ModelRoutingCard";
import { NAV } from "@/lib/navigation";

const aiTabs = NAV.find((n) => n.href === "/ai")?.tabs;

export default function AiUsageRoute() {
    return (
        <>
            <PageHeader title="AI Tools" intro="Token and cost usage across the workspace, with your monthly spend cap." tabs={aiTabs} />
            <div className="flex flex-col gap-6">
                <ModelRoutingCard />
                <Usage />
            </div>
        </>
    );
}
