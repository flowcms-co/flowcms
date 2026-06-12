import { redirect } from "next/navigation";

// The AI Auditor was renamed to the AI Optimizer.
export default function RedirectRoute() {
    redirect("/seo/optimizer");
}
