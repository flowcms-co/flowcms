import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import FieldsForm from "./FieldsForm";
import FixPanel from "./FixPanel";
import type { SchemaField } from "@/mocks/schema";
import { checkContentRules, type ContentRules } from "@flowcms/shared/content-rules";

vi.mock("@/lib/api", () => ({ api: vi.fn(), mediaUrl: (u: string) => u, uploadFile: vi.fn(), ApiError: class ApiError extends Error {} }));
vi.mock("@/components/providers/AuthProvider", () => ({ useAuth: () => ({ can: () => true, user: { role: { allowedTypeIds: [] } } }) }));

afterEach(cleanup);

const fields: SchemaField[] = [
    { id: "1", name: "introText", label: "Intro", type: "Rich text", required: false },
    { id: "2", name: "heading", label: "Heading", type: "Text", required: false },
];
const rules: ContentRules = { guide: { label: "Guide", url: "https://example.com/guide" }, fields: { introText: { allow: ["paragraph", "bold", "italic", "link"] }, heading: { noTrailingColon: true } } };

describe("content rules in the form", () => {
    it("trims the intro toolbar to bold, italic and link", async () => {
        render(<FieldsForm fields={fields} data={{ introText: "<p>Hi</p>" }} onChange={() => {}} rules={rules} />);
        await waitFor(() => expect(screen.getByLabelText("Bold")).toBeTruthy());
        expect(screen.getByLabelText("Italic")).toBeTruthy();
        expect(screen.getByRole("button", { name: /link/i })).toBeTruthy();
        for (const gone of ["Heading 2", "Heading 3", "Bullet list", "Numbered list", "Quote", "Code block", "Insert image", "Underline", "Highlight"]) expect(screen.queryByLabelText(gone)).toBeNull();
    });

    it("keeps the full toolbar when no rule limits the field", async () => {
        render(<FieldsForm fields={fields} data={{ introText: "<p>Hi</p>" }} onChange={() => {}} rules={null} />);
        await waitFor(() => expect(screen.getByLabelText("Heading 2")).toBeTruthy());
        expect(screen.getByLabelText("Bullet list")).toBeTruthy();
    });

    it("shows an error under the field, marks it for jumping, and links the guide", () => {
        render(<FieldsForm fields={fields} data={{ heading: "Signs:" }} onChange={() => {}} rules={rules} errors={{ heading: "This heading ends with a colon." }} />);
        expect(screen.getByRole("alert").textContent).toContain("This heading ends with a colon.");
        expect(document.querySelector('[data-field-path="heading"]')).toBeTruthy();
        expect(screen.getAllByRole("link", { name: "Guide" })[0].getAttribute("href")).toBe("https://example.com/guide");
    });

    it("shows 'See: <label>' after a rule message, opening the guide in a new tab", () => {
        render(<FieldsForm fields={fields} data={{ heading: "Signs:" }} onChange={() => {}} rules={rules} errors={{ heading: "This heading ends with a colon." }} />);
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toBe("This heading ends with a colon. See: Guide");
        const link = alert.querySelector("a")!;
        expect(link.getAttribute("href")).toBe("https://example.com/guide");
        expect(link.getAttribute("target")).toBe("_blank");
    });

    it("tidies a heading as it is typed and when the field is left, and says so", () => {
        const onChange = vi.fn();
        const onTidy = vi.fn();
        render(<FieldsForm fields={[fields[1]]} data={{ heading: "" }} onChange={onChange} rules={rules} onTidy={onTidy} />);
        const input = screen.getByRole("textbox");
        fireEvent.change(input, { target: { value: "  Water  damage" } });
        expect(onChange).toHaveBeenLastCalledWith({ heading: "Water damage" });
        expect(onTidy).toHaveBeenCalled();
    });

    it("does not touch a field that was only opened and left", () => {
        const onChange = vi.fn();
        render(<FieldsForm fields={[fields[1]]} data={{ heading: " Old  heading: " }} onChange={onChange} rules={rules} />);
        fireEvent.blur(screen.getByRole("textbox"));
        expect(onChange).not.toHaveBeenCalled();
    });
});

describe("the fix panel", () => {
    it("lists problems with where, what and how, and jumps on click", () => {
        const data = { introText: "<ul><li>a</li></ul>" };
        const issues = checkContentRules({ ...rules, fields: { introText: rules.fields.introText } }, fields as never, {}, data);
        const onJump = vi.fn();
        render(<FixPanel issues={issues} onJump={onJump} onClose={() => {}} />);
        expect(screen.getByText("Fix before publishing (1)")).toBeTruthy();
        expect(screen.getByText("Click an item to jump to it.")).toBeTruthy();
        expect(screen.getByText("Intro")).toBeTruthy();
        fireEvent.click(screen.getByText(/This box has a bullet list/));
        expect(onJump).toHaveBeenCalledWith("introText");
    });
});
