"use client";

/**
 * Public render of a dynamic-zone "sections" array (the page-builder output). Used
 * by both the studio Content preview and the bundled Site demo so what you build in
 * the section editor is what you see. Renders by `__component` discriminator with a
 * sensible default for unknown/custom components. Pure presentational.
 */

import Icon from "@/components/ui/Icon";

export type Section = Record<string, unknown> & { __component?: string; __uid?: string };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Lenient field lookup: "Cover image" may be keyed coverImage / cover_image / etc. */
const pick = (s: Section, ...names: string[]): string => {
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wanted = names.map(norm);
    for (const k of Object.keys(s)) if (!k.startsWith("__") && wanted.includes(norm(k)) && str(s[k])) return str(s[k]);
    return "";
};

/** Find the first dynamic-zone array in an entry's data (objects with __component). */
export function findSections(data: Record<string, unknown> | null | undefined): Section[] | null {
    if (!data) return null;
    for (const v of Object.values(data)) {
        if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && "__component" in (x as object))) {
            return v as Section[];
        }
    }
    return null;
}

const isImage = (s: string) => /^(https?:\/\/|\/)/.test(s);

/** Render one section by its component type. */
const SectionView = ({ s }: { s: Section }) => {
    const type = (s.__component ?? "").toLowerCase();

    if (type.includes("hero")) {
        const title = pick(s, "title", "heading", "headline");
        const subtitle = pick(s, "subtitle", "subheading", "subhead", "description");
        const cover = pick(s, "cover image", "cover", "image", "background");
        const cta = pick(s, "primary cta label", "cta label", "button label", "cta");
        const href = pick(s, "primary cta url", "cta url", "button url", "url") || "#";
        return (
            <section className="mx-auto max-w-3xl px-6 py-12 text-center">
                {title && <h1 className="font-poppins text-[2.5rem] font-bold leading-[1.1] tracking-[-0.02em] text-balance text-black sm:text-[3rem] dark:text-white">{title}</h1>}
                {subtitle && <p className="mx-auto mt-5 max-w-2xl text-[1.125rem] leading-8 text-grey">{subtitle}</p>}
                {cover && isImage(cover) && (
                    // eslint-disable-next-line @next/next/no-img-element -- arbitrary asset/external URL
                    <img src={cover} alt={title} className="mt-8 aspect-[16/8] w-full rounded-2xl object-cover shadow-[0_1.5rem_3rem_rgba(26,26,46,0.16)]" />
                )}
                {cta && (
                    <a href={href} className="mt-7 inline-flex h-11 items-center rounded-xl bg-primary px-6 font-semibold text-white">
                        {cta}
                    </a>
                )}
            </section>
        );
    }

    if (type.includes("rich") || type.includes("text") || type.includes("content")) {
        const body = pick(s, "body", "content", "text");
        return <div className="flow-prose mx-auto max-w-[44rem] px-6 py-8" dangerouslySetInnerHTML={{ __html: body || "<p>Empty section.</p>" }} />;
    }

    if (type.includes("testimonial") || type.includes("review")) {
        const quote = pick(s, "quote", "text", "content", "review");
        const author = pick(s, "author", "name");
        const role = pick(s, "role", "title", "company");
        return (
            <section className="mx-auto max-w-[44rem] px-6 py-8">
                <figure className="rounded-3xl border border-grey-light bg-lavender-mist/40 p-8 dark:border-grey-light/10 dark:bg-dark-3/40">
                    <Icon className="mb-3 h-6 w-6 fill-primary/40" name="chat" />
                    <blockquote className="text-[1.25rem] leading-9 text-black dark:text-white" dangerouslySetInnerHTML={{ __html: quote }} />
                    {(author || role) && (
                        <figcaption className="mt-4 text-caption-1 text-grey">
                            <span className="font-semibold text-black dark:text-white">{author}</span>
                            {role && <span> · {role}</span>}
                        </figcaption>
                    )}
                </figure>
            </section>
        );
    }

    if (type.includes("cta")) {
        const heading = pick(s, "heading", "title");
        const label = pick(s, "button label", "label", "cta");
        const href = pick(s, "button url", "url") || "#";
        return (
            <section className="mx-auto my-8 max-w-3xl rounded-3xl bg-primary/10 px-6 py-12 text-center">
                {heading && <h2 className="font-poppins text-[1.75rem] font-bold text-black dark:text-white">{heading}</h2>}
                {label && <a href={href} className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-6 font-semibold text-white">{label}</a>}
            </section>
        );
    }

    if (type.includes("image") || type.includes("media")) {
        const src = pick(s, "image", "src", "url");
        const caption = pick(s, "caption", "alt text", "alt");
        if (!src) return null;
        return (
            <figure className="mx-auto max-w-3xl px-6 py-6">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary asset/external URL */}
                <img src={src} alt={caption} className="w-full rounded-2xl object-cover" />
                {caption && <figcaption className="mt-2 text-center text-caption-2 text-grey">{caption}</figcaption>}
            </figure>
        );
    }

    if (type.includes("quote")) {
        const quote = pick(s, "quote", "text");
        const by = pick(s, "attribution", "author");
        return (
            <blockquote className="mx-auto max-w-[44rem] border-l-4 border-primary px-6 py-4 text-[1.25rem] italic text-black dark:text-white">
                <span dangerouslySetInnerHTML={{ __html: quote }} />
                {by && <span className="mt-2 block text-caption-1 not-italic text-grey">— {by}</span>}
            </blockquote>
        );
    }

    if (type.includes("faq")) {
        const q = pick(s, "question", "q");
        const a = pick(s, "answer", "a");
        return (
            <section className="mx-auto max-w-[44rem] px-6 py-3">
                {q && <h3 className="text-title font-semibold text-black dark:text-white">{q}</h3>}
                {a && <div className="mt-1 text-grey" dangerouslySetInnerHTML={{ __html: a }} />}
            </section>
        );
    }

    // Unknown/custom: render any text fields.
    const fields = Object.entries(s).filter(([k, v]) => !k.startsWith("__") && str(v));
    if (!fields.length) return null;
    return (
        <section className="mx-auto max-w-[44rem] px-6 py-4">
            <div className="mb-1 text-caption-2 font-semibold uppercase tracking-wide text-primary">{s.__component}</div>
            {fields.map(([k, v]) => (
                <div key={k} className="text-body text-black dark:text-white">{str(v)}</div>
            ))}
        </section>
    );
};

const Sections = ({ sections }: { sections: Section[] }) => (
    <>
        {sections.map((s, i) => (
            <SectionView key={(s.__uid as string) ?? i} s={s} />
        ))}
    </>
);

export default Sections;
