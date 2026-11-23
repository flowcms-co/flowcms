import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentQuality from "./index";
import { api } from "@/lib/api";
import { fetchEntryBodies } from "@/lib/entries";

vi.hoisted(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as never;
});
vi.mock("@/lib/api", () => ({ api: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock("@/lib/entries", () => ({ fetchEntryBodies: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("issue=formatting") }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
const confirmMock = vi.fn<(o?: unknown) => Promise<boolean>>(async () => true);
const noticeMock = vi.fn<(o?: unknown) => Promise<undefined>>(async () => undefined);
vi.mock("@/components/providers/ConfirmProvider", () => ({ confirm: (o: unknown) => confirmMock(o), notice: (o: unknown) => noticeMock(o) }));

let licensed = true;
vi.mock("@/components/providers/LicenseProvider", () => ({ usePlan: () => ({ has: () => licensed }) }));

afterEach(() => {
    licensed = true;
    cleanup();
    vi.clearAllMocks();
});

const type = { id: "t1", fields: [{ name: "title", type: "Text" }, { name: "intro", type: "Rich text" }], contentRules: { fields: { intro: { allow: ["paragraph"] } } } };

const setup = () => {
    vi.mocked(fetchEntryBodies).mockImplementation(async (q: { status?: string; typeId?: string }) => ({
        items: q.typeId ? [{ id: "e1", title: "Costs", slug: "costs", status: "DRAFT", data: { intro: "<ul><li>a</li></ul>" } }] : [],
        total: q.typeId ? 1 : 0,
    })) as never;
    vi.mocked(api).mockImplementation(async (path: string) => {
        if (path === "/content-types") return [type] as never;
        if (path === "/content-types/components") return [] as never;
        if (path === "/entries/e1/tidy") return { id: "e1", changed: true, note: "Tidied 2 extra spaces" } as never;
        return {} as never;
    });
};

describe("Content > Quality > Formatting", () => {
    it("lists a page that cannot be published, and tidies it on request without publishing", async () => {
        setup();
        render(<ContentQuality />);
        await screen.findByText("Costs");
        expect(screen.getByText("1 to fix before publishing")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Tidy" }));
        await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Tidied 2 extra spaces. Saved as a draft, nothing was published."));
        expect(vi.mocked(api)).toHaveBeenCalledWith("/entries/e1/tidy", { method: "POST" });
    });

    it("tidy all flagged asks first, then queues one job for the flagged pages", async () => {
        setup();
        render(<ContentQuality />);
        await screen.findByText("Costs");
        fireEvent.click(screen.getByRole("button", { name: "Tidy all flagged" }));
        await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/entries/bulk/tidy", { method: "POST", body: JSON.stringify({ ids: ["e1"] }) }));
        expect(JSON.stringify(confirmMock.mock.calls[0])).toContain("Nothing is published");
    });

    it("is off without the content_rules license: no formatting list, no tidy, nothing fetched", async () => {
        licensed = false;
        setup();
        render(<ContentQuality />);
        await waitFor(() => expect(vi.mocked(fetchEntryBodies)).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: "Tidy all flagged" })).toBeNull();
        expect(screen.queryByRole("button", { name: "Formatting" })).toBeNull();
        expect(vi.mocked(api)).not.toHaveBeenCalledWith("/content-types");
    });
});
