import { Suspense } from "react";
import EditorPage from "@/templates/EditorPage";

export default function BlockEditorPage() {
    return (
        <Suspense fallback={null}>
            <EditorPage />
        </Suspense>
    );
}
