import PageHeader from "@/components/shell/PageHeader";
import SeoDashboard from "@/templates/seo/Dashboard";
import { NAV } from "@/lib/navigation";

const seoTabs = NAV.find((n) => n.href === "/seo")?.tabs;

export default function SeoRoute() {
    return (
        <>
            <PageHeader
                title="SEO"
                intro="Real-time overview of your SEO performance and opportunities."
                tabs={seoTabs}
            />
            <SeoDashboard />
        </>
    );
}
