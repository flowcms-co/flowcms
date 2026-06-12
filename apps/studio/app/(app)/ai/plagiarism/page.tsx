import { redirect } from "next/navigation";

// Regrouped AI suite.
export default function RedirectRoute() {
    redirect("/ai/proofreading?tab=plagiarism");
}
