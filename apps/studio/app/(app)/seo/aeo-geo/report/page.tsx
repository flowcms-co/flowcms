import PageHeader from "@/components/shell/PageHeader";
import AeoReport from "@/templates/seo/AeoReport";

export default function AeoReportRoute() {
    return (
        <>
            <PageHeader
                title="AI Visibility report"
                intro="The full answer-engine picture: every tracked question, prompt, readiness check and recommendation."
            />
            <AeoReport />
        </>
    );
}
