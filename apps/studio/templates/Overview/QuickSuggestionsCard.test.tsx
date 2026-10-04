import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import QuickSuggestionsCard from "./QuickSuggestionsCard";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...p }: { children: React.ReactNode; href: string }) => <a {...p}>{children}</a> }));
vi.mock("@/components/ui/Card", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/ai/ConnectNotice", () => ({ default: () => null }));
vi.mock("@/lib/useAi", () => ({ useAiProviders: () => ({ hasProvider: false, loading: false }), runAi: vi.fn(), aiErrorMessage: () => "" }));

afterEach(() => {
    cleanup();
    vi.mocked(api).mockReset();
});

const longText = "This page explains in plain words how we help. ".repeat(4);

describe("QuickSuggestionsCard", () => {
    it("scans pages whose text lives outside a `body` field and says how many it scanned", async () => {
        vi.mocked(api).mockImplementation(async (path: string) =>
            path.startsWith("/entries") ? [{ id: "1", title: "A", data: { sections: [{ __component: "text", copy: longText }] } }, { id: "2", title: "B", data: { hero: "/media/x.png" } }] : {},
        );
        render(<QuickSuggestionsCard />);
        await waitFor(() => expect(document.body.textContent).toContain("1 of 2 latest pages scanned."));
    });

    it("reports a failed fetch instead of saying All clear", async () => {
        vi.mocked(api).mockRejectedValue(new Error("500"));
        render(<QuickSuggestionsCard />);
        await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Couldn’t scan your content"));
        expect(document.body.textContent).not.toContain("All clear");
    });

    it("does not say All clear when no page had text to scan", async () => {
        vi.mocked(api).mockImplementation(async (path: string) => (path.startsWith("/entries") ? [{ id: "2", title: "B", data: { hero: "/media/x.png" } }] : {}));
        render(<QuickSuggestionsCard />);
        await waitFor(() => expect(document.body.textContent).toContain("Nothing to scan yet"));
        expect(document.body.textContent).not.toContain("All clear");
    });
});
