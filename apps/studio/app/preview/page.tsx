import { Suspense } from "react";
import PreviewClient from "./PreviewClient";

export const metadata = { title: "Preview · Flow CMS" };

/** Bare (no app shell) live page preview, opened from the block editor. */
export default function PreviewPage() {
    return (
        <Suspense fallback={null}>
            <PreviewClient />
        </Suspense>
    );
}
