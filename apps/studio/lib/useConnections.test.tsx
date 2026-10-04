import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/api", () => {
    class ApiError extends Error {
        status: number;
        constructor(status: number, message: string) {
            super(message);
            this.status = status;
        }
    }
    return { api, ApiError };
});

import { ApiError } from "@/lib/api";
import { refreshConnections, useConnections } from "./useConnections";

describe("useConnections", () => {
    beforeEach(() => api.mockReset());

    it("reports a 403 as no access, not as not connected, and picks up a new connection on refresh", async () => {
        let gsc = false;
        api.mockImplementation(async (path: string) => {
            if (path === "/seo/connectors") throw new ApiError(403, "Forbidden");
            if (path === "/analytics/status") return { gsc: { connected: gsc }, ga4: { connected: false } };
            return [];
        });
        const { result } = renderHook(() => useConnections());
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.forbidden).toEqual({ analytics: false, seo: true, integrations: false });
        expect(result.current.connections.gsc).toBe(false);

        gsc = true; // connected in settings
        act(() => refreshConnections());
        await waitFor(() => expect(result.current.connections.gsc).toBe(true));
    });
});
