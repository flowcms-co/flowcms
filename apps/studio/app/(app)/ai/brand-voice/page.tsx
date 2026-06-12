import { redirect } from "next/navigation";

// Brand Voice was folded into The Brain (words to use / avoid live there now).
export default function AiBrandVoiceRoute() {
    redirect("/ai/knowledge");
}
