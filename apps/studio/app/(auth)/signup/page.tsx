import { redirect } from "next/navigation";

/** Public self-registration was removed: accounts are created by the first-run
 *  claim (/welcome) or by an admin invite (Settings → Workspace → Team). The
 *  old /signup URL lands on sign-in for anyone who bookmarked it. */
export default function SignupRemoved() {
    redirect("/login");
}
