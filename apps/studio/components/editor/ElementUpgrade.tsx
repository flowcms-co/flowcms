"use client";

import { TierBadge, UpgradeCta } from "@/components/ui/UpgradeLock";

/** What the Insert element menu shows without the `elements` license. Loaded only when opened. */
const ElementUpgrade = () => (
    <div className="flex flex-col gap-2 p-1">
        <div className="flex items-center gap-2">
            <span className="text-caption-1 font-semibold text-black dark:text-white">Elements</span>
            <TierBadge feature="elements" />
        </div>
        <p className="text-caption-2 text-grey">Premade infographics for your articles, like a steps diagram.</p>
        <UpgradeCta feature="elements" />
    </div>
);

export default ElementUpgrade;
