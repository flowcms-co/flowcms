import { Suspense } from "react";
import SiteDemoClient from "./SiteDemoClient";

export const metadata = { title: "Northbound — preview" };

/** Bundled example frontend (a stand-in customer site) for the live-preview demo. */
export default function SiteDemoPage() {
    return (
        <Suspense fallback={null}>
            <SiteDemoClient />
        </Suspense>
    );
}
