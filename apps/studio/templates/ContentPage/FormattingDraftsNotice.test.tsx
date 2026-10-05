import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FormattingDraftsNotice from "./FormattingDraftsNotice";
import { api } from "@/lib/api";

const confirmMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: vi.fn(), ApiError: class extends Error {} }));
vi.mock("@/components/providers/ConfirmProvider", () => ({ confirm: confirmMock }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ can: () => true }) }));

afterEach(() => {
    cleanup();
    vi.mocked(api).mockReset();
    confirmMock.mockReset();
});

describe("FormattingDraftsNotice", () => {
    it("shows nothing when there is nothing to repair", async () => {
        vi.mocked(api).mockResolvedValue([]);
        const { container } = render(<FormattingDraftsNotice />);
        await waitFor(() => expect(api).toHaveBeenCalledWith("/entries/drafts/formatting-only"));
        expect(container.textContent).toBe("");
    });

    it("offers to discard formatting-only drafts, and does so only after confirming", async () => {
        vi.mocked(api).mockImplementation(async (path: string) => (path.endsWith("/discard") ? { discarded: 2 } : [{ id: "a", title: "Fire damage", type: "Service" }, { id: "b", title: "Water damage", type: "Service" }]));
        render(<FormattingDraftsNotice />);
        const button = await screen.findByText("Discard these drafts");
        expect(screen.getByRole("alert").textContent).toContain("2 published entries have unpublished changes that nobody typed");

        confirmMock.mockResolvedValueOnce(false);
        fireEvent.click(button);
        await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
        expect(api).not.toHaveBeenCalledWith("/entries/drafts/formatting-only/discard", expect.anything());
        expect(confirmMock.mock.calls[0][0].message).toContain("• Fire damage");

        confirmMock.mockResolvedValueOnce(true);
        fireEvent.click(button);
        await screen.findByText("Discarded 2 drafts.");
        expect(api).toHaveBeenCalledWith("/entries/drafts/formatting-only/discard", { method: "POST" });
    });
});
