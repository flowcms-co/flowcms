"use client";

import { mediaUrl } from "@/lib/api";
import { isImageRef, preview, textOf, wordDiff, type FieldChange } from "@/lib/activity";
import { cn } from "@/lib/cn";

/** One value: an image for a media reference, otherwise its text. */
const Value = ({ v, tone }: { v: unknown; tone: "before" | "after" }) =>
    isImageRef(v) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(v)} alt={tone === "before" ? "Before" : "After"} className="h-20 max-w-[10rem] rounded-lg border border-grey-light object-cover dark:border-grey-light/10" />
    ) : (
        <span className={cn("break-words", tone === "before" ? "text-error line-through decoration-error/50" : "text-success")}>{preview(v, 400)}</span>
    );

/**
 * What changed, field by field: text and rich text diffed word by word, images
 * shown before and after, anything else as before → after.
 */
const ChangeList = ({ changes, max }: { changes: FieldChange[]; max?: number }) => {
    const shown = max ? changes.slice(0, max) : changes;
    if (!changes.length) return <p className="text-caption-2 text-grey">No field changes.</p>;
    return (
        <ul className="flex flex-col gap-2.5">
            {shown.map((c, i) => (
                <li key={`${c.path}-${i}`} className="rounded-xl border border-grey-light/70 p-2.5 dark:border-grey-light/10">
                    <div className="mb-1 flex items-center gap-2">
                        <code className="truncate font-mono text-[0.6875rem] text-primary dark:text-lilac">{c.path || "(whole value)"}</code>
                        {c.formattingOnly && <span className="rounded bg-grey-light px-1.5 text-[0.625rem] font-semibold text-grey dark:bg-dark-3">formatting only</span>}
                    </div>
                    {typeof c.before === "string" && typeof c.after === "string" && !isImageRef(c.before) && !isImageRef(c.after) ? (
                        <p className="text-caption-2 leading-relaxed text-black dark:text-white">
                            {wordDiff(textOf(c.before), textOf(c.after)).map((p, j) =>
                                p.kind === "same" ? (
                                    <span key={j}>{p.text}</span>
                                ) : p.kind === "del" ? (
                                    <del key={j} className="rounded bg-error/10 text-error decoration-error/50">{p.text}</del>
                                ) : (
                                    <ins key={j} className="rounded bg-success/15 text-success no-underline">{p.text}</ins>
                                ),
                            )}
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2 text-caption-2">
                            <Value v={c.before} tone="before" />
                            <span className="text-grey">→</span>
                            <Value v={c.after} tone="after" />
                        </div>
                    )}
                </li>
            ))}
            {max && changes.length > max && <li className="text-caption-2 text-grey">and {changes.length - max} more</li>}
        </ul>
    );
};

export default ChangeList;
