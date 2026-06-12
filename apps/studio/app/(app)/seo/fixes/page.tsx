import { redirect } from "next/navigation";

// Fix Settings was merged into the AI Optimizer (settings live at the top there).
export default function SeoFixSettingsRedirect() {
    redirect("/seo/optimizer");
}
