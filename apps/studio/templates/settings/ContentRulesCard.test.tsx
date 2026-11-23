import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ContentRulesCard from "./ContentRulesCard";
import { api } from "@/lib/api";

vi.hoisted(() => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as never;
});
vi.mock("@/lib/api", () => ({ api: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ can: () => true }) }));
let licensed = true;
vi.mock("@/components/providers/LicenseProvider", () => ({
    usePlan: () => ({ has: () => licensed, locked: () => !licensed, tierFor: () => "enterprise" }),
}));

afterEach(() => {
    cleanup();
    licensed = true;
    vi.clearAllMocks();
});

const rows = [
    { id: "t1", name: "Resources", apiId: "resources", guide: { label: "Guide", url: "https://docs.example.org/a" } },
    { id: "t2", name: "Service", apiId: "service", guide: null },
];

describe("Settings > Content rules", () => {
    it("lists the types with rules and saves a guide link per type", async () => {
        vi.mocked(api).mockImplementation(async (path: string) => (path === "/ee/content-rules/guides" ? (rows as never) : ({} as never)));
        render(<ContentRulesCard />);
        await screen.findByText("Service");
        const urls = screen.getAllByPlaceholderText("https://");
        fireEvent.change(urls[1], { target: { value: "https://docs.example.org/b" } });
        fireEvent.click(screen.getAllByText("Save")[1]);
        await waitFor(() => expect(vi.mocked(api)).toHaveBeenCalledWith("/ee/content-rules/guide", { method: "PUT", body: JSON.stringify({ url: "https://docs.example.org/b", label: "", typeId: "t2" }) }));
    });

    it("refuses a link that is not https before sending anything", async () => {
        vi.mocked(api).mockImplementation(async () => rows as never);
        render(<ContentRulesCard />);
        await screen.findByText("Service");
        fireEvent.change(screen.getAllByPlaceholderText("https://")[1], { target: { value: "http://docs.example.org" } });
        fireEvent.click(screen.getAllByText("Save")[1]);
        expect(await screen.findByText("The guide link must be a full https:// address.")).toBeTruthy();
        expect(vi.mocked(api)).toHaveBeenCalledTimes(1); // only the list
    });

    it("shows the upgrade promo and calls nothing when not licensed", () => {
        licensed = false;
        render(<ContentRulesCard />);
        expect(screen.getByText("Upgrade to Enterprise")).toBeTruthy();
        expect(vi.mocked(api)).not.toHaveBeenCalled();
    });
});
