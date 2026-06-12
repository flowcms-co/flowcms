import { redirect } from "next/navigation";

/** Folded into a combined Settings page. Permanent redirect for old links. */
export default function Redirect() {
    redirect("/settings/content?tab=import");
}
