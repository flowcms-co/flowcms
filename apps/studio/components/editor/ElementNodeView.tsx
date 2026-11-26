"use client";

import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { elementTemplate, renderElement } from "@flowcms/shared/elements";
import { usePlanIfAny } from "@/components/providers/LicenseProvider";
import { EDIT_ELEMENT_EVENT, useElementStyles, type EditElementDetail } from "@/lib/elements";

/** An element inside the editor: the real rendered preview in a frame, with Edit and Remove. */
const ElementNodeView = ({ node, editor, getPos, deleteNode, selected }: NodeViewProps) => {
    useElementStyles();
    const licensed = usePlanIfAny()?.has("elements") ?? false;
    const template = String(node.attrs.template ?? "");
    const t = elementTemplate(template);
    const values = node.attrs.values;
    const html = values === null || values === undefined ? "" : renderElement(template, values);
    const problems = t && values ? t.validate(values) : [];
    const edit = () => {
        const pos = getPos();
        if (typeof pos === "number") window.dispatchEvent(new CustomEvent<EditElementDetail>(EDIT_ELEMENT_EVENT, { detail: { editor, pos } }));
    };
    const btn = "inline-flex h-8 items-center rounded-lg px-3 text-caption-2 font-semibold transition-colors";
    return (
        <NodeViewWrapper data-flow-element-view="" className={`my-4 rounded-xl border bg-white dark:bg-dark-1 ${selected ? "border-primary" : "border-grey-light dark:border-grey-light/15"}`}>
            <div contentEditable={false} className="select-none">
                <div className="flex items-center justify-between gap-2 border-b border-grey-light px-3 py-1.5 dark:border-grey-light/15">
                    <span className="text-caption-2 font-semibold text-grey">{t ? t.name : "Unknown element"}</span>
                    <span className="flex items-center gap-1">
                        {licensed && t && (
                            <button type="button" onClick={edit} className={`${btn} text-primary hover:bg-lavender-mist dark:text-lilac dark:hover:bg-dark-3`}>
                                Edit element
                            </button>
                        )}
                        <button type="button" onClick={() => deleteNode()} className={`${btn} text-grey hover:bg-lavender-mist hover:text-error dark:hover:bg-dark-3`}>
                            Remove element
                        </button>
                    </span>
                </div>
                {problems.length > 0 && (
                    <ul className="border-b border-grey-light bg-warning/10 px-3 py-1.5 text-caption-2 text-black dark:border-grey-light/15 dark:text-white">
                        {problems.map((m) => (
                            <li key={m}>{m}</li>
                        ))}
                    </ul>
                )}
                <div className="px-4" dangerouslySetInnerHTML={{ __html: html || `<p class="py-4 text-caption-1 text-grey">This element could not be read. Remove it and insert it again.</p>` }} />
            </div>
        </NodeViewWrapper>
    );
};

export default ElementNodeView;
