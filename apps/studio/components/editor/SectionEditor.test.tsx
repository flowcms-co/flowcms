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
        total: 0,
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
        await screen.findByText(/Create tag “Rust”/);
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
        expect(screen.queryByText(/Create tag/)).toBeNull();
        fireEvent.keyDown(input, { key: "Enter" });

        await waitFor(() => expect(onChange).toHaveBeenCalledWith([{ __component: "card", __uid: "u1", tags: ["t99"] }]));
        expect(vi.mocked(api).mock.calls.some(([p]) => p === "/entries")).toBe(false);
    });
});
