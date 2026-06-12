import { redirect } from "next/navigation";

/** Knowledge moved into the AI Tools suite (it's an AI concern). Permanent
 *  redirect so old links / bookmarks keep working. */
export default function SettingsKnowledgeRoute() {
    redirect("/ai/knowledge");
}
