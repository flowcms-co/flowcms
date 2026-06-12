"use client";

import { useRouter, useSearchParams } from "next/navigation";
import SubTabs, { type SubTab } from "@/components/shell/SubTabs";
import { useRole } from "@/components/providers/RoleProvider";
import Team from "@/templates/settings/Team";
import Roles from "@/templates/settings/Roles";
import System from "@/templates/settings/System";

/** Workspace settings — Team, Roles, and (super-only) System, as one page with
 *  a sub-tab row. Deep-linkable via ?tab=. */
const WorkspaceSettings = () => {
    const params = useSearchParams();
    const router = useRouter();
    const { role } = useRole();

    const tabs: SubTab[] = [
        { id: "team", label: "Team" },
        { id: "roles", label: "Roles" },
        ...(role === "super" ? [{ id: "system", label: "System" }] : []),
    ];
    const requested = params.get("tab");
    const active = tabs.some((t) => t.id === requested) ? (requested as string) : "team";

    return (
        <div className="flex flex-col gap-6">
            <SubTabs tabs={tabs} active={active} onSelect={(id) => router.replace(`/settings/workspace?tab=${id}`)} />
            {active === "team" && <Team />}
            {active === "roles" && <Roles />}
            {active === "system" && <System />}
        </div>
    );
};

export default WorkspaceSettings;
