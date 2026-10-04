import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { clearDashboardCache, useDashboard } from "./useDashboard";
import { api } from "@/lib/api";

let userId = "u1";
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ user: { id: userId } }) }));

afterEach(() => {
    cleanup();
    clearDashboardCache();
    vi.mocked(api).mockReset();
    userId = "u1";
});

describe("useDashboard", () => {
    it("reports loading, then data", async () => {
        vi.mocked(api).mockResolvedValue({ hasData: true });
        const { result } = renderHook(() => useDashboard());
        expect(result.current).toEqual({ data: null, loading: true, error: false });
        await waitFor(() => expect(result.current.data).toEqual({ hasData: true }));
        expect(result.current.loading).toBe(false);
    });

    it("reports a failed fetch as an error, not as an empty dashboard", async () => {
        vi.mocked(api).mockRejectedValue(new Error("500"));
        const { result } = renderHook(() => useDashboard());
        await waitFor(() => expect(result.current.error).toBe(true));
        expect(result.current).toEqual({ data: null, loading: false, error: true });
    });

    it("never shows one user's cached summary to the next user when the refresh fails", async () => {
        vi.mocked(api).mockResolvedValueOnce({ hasData: true, owner: "u1" });
        const first = renderHook(() => useDashboard());
        await waitFor(() => expect(first.result.current.data).toBeTruthy());
        first.unmount();

        userId = "u2";
        vi.mocked(api).mockRejectedValueOnce(new Error("offline"));
        const second = renderHook(() => useDashboard());
        expect(second.result.current.data).toBeNull();
        await waitFor(() => expect(second.result.current.error).toBe(true));
        expect(second.result.current.data).toBeNull();
    });
});
