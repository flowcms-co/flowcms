import PageHeader from "@/components/shell/PageHeader";
import Optimizer from "@/templates/seo/Optimizer";
import { NAV } from "@/lib/navigation";

const seoTabs = NAV.find((n) => n.href === "/seo")?.tabs;

export default function SeoOptimizerRoute() {
    return (
        <>
            <PageHeader
                title="AI Optimizer"
                intro="Everything wrong with your SEO, grouped and ready to fix: metadata, schema, structure, performance, AI readiness, internal links and technical issues."
                tabs={seoTabs}
            />
            <Optimizer />
        </>
    );
}
