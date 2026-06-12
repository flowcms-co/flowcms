"use client";

import { useRouter, useSearchParams } from "next/navigation";
import ApiKeys from "@/templates/settings/ApiKeys";
import Webhooks from "@/templates/settings/Webhooks";
import OpenApi from "@/templates/settings/OpenApi";
import Plugins from "@/templates/settings/Plugins";

const TABS = [
    { id: "api-keys", label: "API Keys" },
    { id: "webhooks", label: "Webhooks" },
    { id: "api-docs", label: "API Docs" },
    { id: "plugins", label: "Plugins" },
];

/**
 * Developers — one home for the API surface: tokens, webhooks, the REST/GraphQL
 * reference, and content plugins. Sub-sections are deep-linkable via ?tab=.
 */
const Developers = () => {
    const params = useSearchParams();
    const router = useRouter();
    const requested = params.get("tab");
    const active = TABS.some((t) => t.id === requested) ? (requested as string) : "api-keys";

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap gap-2">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => router.replace(`/settings/developers?tab=${t.id}`)}
                        className={`px-4 py-2 rounded-md text-menu transition-colors ${
                            active === t.id
                                ? "bg-primary text-white"
                                : "text-grey hover:text-primary hover:bg-lavender-mist dark:hover:bg-dark-1"
                        }`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>
            {active === "api-keys" && <ApiKeys />}
            {active === "webhooks" && <Webhooks />}
            {active === "api-docs" && <OpenApi />}
            {active === "plugins" && <Plugins />}
        </div>
    );
};

export default Developers;
