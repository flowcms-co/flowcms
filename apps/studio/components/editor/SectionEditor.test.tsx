import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import SectionEditor, { type ComponentDef, type Section } from "./SectionEditor";
import { RefTypesContext } from "./FieldsForm";
import { api } from "@/lib/api";
import { fetchEntryPage } from "@/lib/entries";

vi.mock("@/lib/api", () => ({ api: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock("@/lib/entries", () => ({ fetchEntryPage: vi.fn() }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ can: () => true, user: { role: { allowedTypeIds: [] } } }) }));

const tag = (id: string, title: string, status = "PUBLISHED") => ({ id, title, slug: title.toLowerCase(), status, contentType: { name: "Tag" } });
const created = tag("new1", "Rust", "DRAFT");
const deep = tag("t99", "Go");
const other = tag("t1", "Python");

const card: ComponentDef = {
    apiId: "card",
    name: "Card",
    icon: "document",
    fields: [{ id: "f1", name: "tags", type: "Reference", required: false, referencedTypeId: "tag", multiple: true }],
};

/** A Dynamic Zone with one section holding a Reference field to the Tag type. */
const Zone = ({ onChange }: { onChange: (s: Section[]) => void }) => {
    const [sections, setSections] = useState<Section[]>([{ __component: "card", __uid: "u1" }]);
    return (
        <RefTypesContext.Provider value={[{ id: "tag", name: "Tag", fields: [] }]}>
            <SectionEditor
                sections={sections}
                components={{ card }}
                onChange={(next) => {
                    setSections(next);
                    onChange(next);
                }}
            />
        </RefTypesContext.Provider>
    );
};

const setup = async (match: ReturnType<typeof tag> | null) => {
    vi.mocked(fetchEntryPage).mockImplementation(async (q = {}) => ({
        // Search results never include the match: it sits beyond the first page.
        items: (q.ids ? [created, deep].filter((e) => q.ids!.split(",").includes(e.id)) : [other]) as never[],
        total: 120,
        page: 1,
        pageSize: 50,
    }));
    vi.mocked(api).mockImplementation(async (path: string) => {
        if (path.startsWith("/entries/match")) return { entry: match };
        if (path.startsWith("/entries/slug-available")) return { available: true };
        if (path === "/entries") return created;
        if (path.endsWith("/review")) return { enforced: true };
        throw new Error(`unexpected ${path}`);
    });
    const onChange = vi.fn();
    render(<Zone onChange={onChange} />);
    return { onChange, input: await screen.findByPlaceholderText("Search tags…") };
};

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("reference picker in a Dynamic Zone section", () => {
    it("creates a tag from the typed text, links it and marks it as a draft", async () => {
        const { onChange, input } = await setup(null);
        fireEvent.change(input, { target: { value: "Rust" } });
        const row = await screen.findByText(/Create “Rust”/);
        expect(row.textContent).toBe("Create “Rust”Tag"); // the type name is a badge, not pluralized prose
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ __component: "card", __uid: "u1", tags: ["new1"] }]));
        const post = vi.mocked(api).mock.calls.find(([p]) => p === "/entries")!;
        expect(JSON.parse(String(post[1]!.body))).toEqual({ contentTypeId: "tag", title: "Rust", slug: "rust", data: {}, reuseExisting: true });
        expect(await screen.findByText("Draft")).toBeTruthy();
        expect(await screen.findByText(/until they’re approved and published/)).toBeTruthy();
    });

    it("shows the server's exact match on top and links it on Enter instead of creating", async () => {
        const { onChange, input } = await setup(deep);
        fireEvent.change(input, { target: { value: "go" } });
        await screen.findByText("Go");
        expect(screen.queryByText(/Create “/)).toBeNull();
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ __component: "card", __uid: "u1", tags: ["t99"] }]));
        expect(vi.mocked(api).mock.calls.some(([p]) => p === "/entries")).toBe(false);
    });
});

describe("reference picker: search, selection and order", () => {
    const guides = [tag("g1", "Basement flood cleanup cost"), tag("g2", "Burst pipe repair"), tag("g3", "Frozen pipe thawing"), tag("g4", "Roof leak checklist")];
    const zoneOf = (onChange: (s: Section[]) => void, initial: string[] = []) => {
        const Field = () => {
            const [sections, setSections] = useState<Section[]>([{ __component: "card", __uid: "u1", ...(initial.length ? { tags: initial } : {}) }]);
            return (
                <RefTypesContext.Provider value={[{ id: "tag", name: "Tag", fields: [] }]}>
                    <SectionEditor sections={sections} components={{ card }} onChange={(next) => { setSections(next); onChange(next); }} />
                </RefTypesContext.Provider>
            );
        };
        return <Field />;
    };
    const mount = async (initial: string[] = [], stale = false) => {
        vi.mocked(fetchEntryPage).mockImplementation(async (q = {}) => ({
            // `stale`: a server answer that ignores the search text, as a late response for
            // the empty query would look.
            items: (q.ids ? guides.filter((e) => q.ids!.split(",").includes(e.id)) : stale || !q.q ? guides : guides.filter((g) => g.title.toLowerCase().includes(String(q.q).toLowerCase()))) as never[],
            total: guides.length,
            page: 1,
            pageSize: 50,
        }));
        vi.mocked(api).mockImplementation(async (path: string) => {
            if (path.startsWith("/entries/match")) return { entry: null };
            if (path.endsWith("/review")) return { enforced: false };
            throw new Error(`unexpected ${path}`);
        });
        const onChange = vi.fn();
        render(zoneOf(onChange, initial));
        return { onChange, input: (await screen.findByRole("combobox")) as HTMLInputElement };
    };
    const options = () => screen.queryAllByRole("option").map((o) => o.textContent);
    const tagsOf = (onChange: ReturnType<typeof vi.fn>) => (onChange.mock.calls.at(-1)![0] as Section[])[0].tags;

    it("an empty field reads 'None selected', not 'No tags yet', when the type has entries", async () => {
        const { input } = await mount();
        await waitFor(() => expect(input.placeholder).toBe("Search tags…"));
        expect(input.getAttribute("aria-label")).toBe("Tags: None selected");
        expect(screen.getByText("None selected")).toBeTruthy();
    });

    it("typing filters by title and slug, even if the server answers with everything", async () => {
        const { input } = await mount([], true);
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "pipe" } });
        await waitFor(() => expect(options().filter((o) => !o?.startsWith("Create"))).toEqual(["Burst pipe repair", "Frozen pipe thawing"]));
    });

    it("pressing an option with the mouse selects it", async () => {
        const { input, onChange } = await mount();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "pipe" } });
        const option = await screen.findByText("Frozen pipe thawing");
        fireEvent.mouseDown(option);
        await waitFor(() => expect(tagsOf(onChange)).toEqual(["g3"]));
        // The typed text is cleared and the pick shows as a chip.
        expect(input.value).toBe("");
        await screen.findByLabelText("Remove Frozen pipe thawing");
    });

    it("arrow keys and Enter select the highlighted option", async () => {
        const { input, onChange } = await mount();
        fireEvent.focus(input);
        fireEvent.change(input, { target: { value: "pipe" } });
        await screen.findByText("Burst pipe repair");
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "ArrowDown" });
        fireEvent.keyDown(input, { key: "Enter" });
        await waitFor(() => expect(tagsOf(onChange)).toEqual(["g3"]));
    });

    it("picked entries are chips whose order can be changed", async () => {
        const { onChange } = await mount(["g1", "g2", "g3"]);
        fireEvent.click(await screen.findByLabelText("Move Frozen pipe thawing earlier"));
        await waitFor(() => expect(tagsOf(onChange)).toEqual(["g1", "g3", "g2"]));
        expect((screen.getByLabelText("Move Basement flood cleanup cost earlier") as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("combobox").getAttribute("aria-label")).toBe("Tags: 3 selected");
    });
});
