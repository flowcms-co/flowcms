import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import KpiStrip from "./KpiStrip";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...p }: { children: React.ReactNode; href: string }) => <a {...p}>{children}</a> }));
vi.mock("@/components/ui/Card", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/components/motion/StatNumber", () => ({ default: ({ value }: { value: string }) => <span>{value}</span> }));
const dash = vi.hoisted(() => ({ state: { data: null as unknown, loading: true, error: false } }));
vi.mock("@/lib/useDashboard", () => ({ useDashboard: () => dash.state }));

afterEach(() => {
    cleanup();
    vi.mocked(api).mockReset();
});

const pipeline = { draft: 4, review: 2, approved: 3, scheduled: 1, published: 9 };

describe("KpiStrip", () => {
    it("shows live counts with no made-up deltas, and the Optimizer's issue total", async () => {
        dash.state = { data: { pipeline, perLocale: false }, loading: false, error: false };
        vi.mocked(api).mockResolvedValue({ counts: { total: 1607 } });
        render(<KpiStrip />);
        await waitFor(() => expect(screen.getByLabelText("SEO issues: 1607")).toBeTruthy());
        expect(api).toHaveBeenCalledWith("/seo/scan/issues");
        expect(screen.getByLabelText("Ready to publish: 3")).toBeTruthy();
        expect(document.body.textContent).not.toMatch(/%/);
    });

    it("shows a dash, not 0, when the SEO fetch fails", async () => {
        dash.state = { data: { pipeline, perLocale: false }, loading: false, error: false };
        vi.mocked(api).mockRejectedValue(new Error("403"));
        render(<KpiStrip />);
        await waitFor(() => expect(screen.getByLabelText("SEO issues: not available")).toBeTruthy());
    });

    it("tells loading and failure apart from a real zero", async () => {
        vi.mocked(api).mockResolvedValue({ counts: { total: 0 } });
        dash.state = { data: null, loading: true, error: false };
        const { unmount } = render(<KpiStrip />);
        expect(screen.getByLabelText("In review: loading")).toBeTruthy();
        unmount();
        dash.state = { data: null, loading: false, error: true };
        render(<KpiStrip />);
        expect(screen.getByLabelText("In review: not available")).toBeTruthy();
        expect(screen.getByRole("alert").textContent).toMatch(/Couldn.t load/);
        await waitFor(() => expect(screen.getByLabelText("SEO issues: 0")).toBeTruthy());
    });
});
