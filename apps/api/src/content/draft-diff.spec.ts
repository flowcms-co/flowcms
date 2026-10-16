import { describe, expect, it } from "vitest";
import { draftDiff, pathKeys, pickPaths } from "./draft-diff";
import { AgentController } from "./agent.controller";

/* eslint-disable @typescript-eslint/no-explicit-any */
const live = {
    title: "Fire damage restoration",
    body: '<p>See the <a href="/guide">guide</a>.</p><ul><li>One</li></ul>',
    sections: [{ __component: "hero", heading: "Fast help" }, { __component: "faq", question: "How long?" }],
    guides: ["g1", "g2"],
};

describe("draftDiff", () => {
    it("lists changed field paths with before and after values", () => {
        const draft = { ...live, title: "Fire & smoke damage restoration", sections: [live.sections[0], { ...live.sections[1], question: "How long does it take?" }] };
        expect(draftDiff(live, draft)).toEqual([
            { path: "title", before: "Fire damage restoration", after: "Fire & smoke damage restoration", formattingOnly: false },
            { path: "sections[1].question", before: "How long?", after: "How long does it take?", formattingOnly: false },
        ]);
    });

    it("reports a list whose length changed as one change, and a new or removed field", () => {
        const changes = draftDiff(live, { title: live.title, body: live.body, sections: live.sections, guides: ["g1", "g2", "g3"], summary: "New" });
        expect(changes.map((c) => c.path)).toEqual(["guides", "summary"]);
        expect(changes[0]).toMatchObject({ before: ["g1", "g2"], after: ["g1", "g2", "g3"] });
        expect(changes[1]).toMatchObject({ before: null, after: "New" });
    });

    it("flags a change that is only editor formatting", () => {
        const noise = { ...live, body: '<p>See the <a target="_blank" rel="noopener noreferrer nofollow" href="/guide">guide</a>.</p><ul><li><p>One</p></li></ul><p> </p>' };
        expect(draftDiff(live, noise)).toEqual([expect.objectContaining({ path: "body", formattingOnly: true })]);
        expect(draftDiff(live, live)).toEqual([]);
    });
});

describe("agent API: live and draft side by side", () => {
    const draft = { ...live, title: "New title" };
    const entries = {
        get: async () => ({ id: "e1", status: "PUBLISHED", hasDraft: true, data: draft }),
        liveAndDraft: async () => ({ hasDraft: true, draftApproved: false, liveData: live, draftData: draft, formattingOnly: false, changes: draftDiff(live, draft) }),
    };
    const ctrl = new AgentController(entries as any, null as any, null as any, null as any);
    const req = { apiToken: { workspaceId: "w", scopes: ["content.read"], type: "ADMIN" } } as any;

    it("GET returns the live version and the pending draft", async () => {
        const e = await ctrl.get(req, "e1");
        expect(e).toMatchObject({ hasDraft: true, data: draft, liveData: live, draftData: draft });
    });

    it("GET draft-diff lists what the draft changes", async () => {
        expect(await ctrl.draftDiff(req, "e1")).toEqual({ hasDraft: true, draftApproved: false, formattingOnly: false, changes: [{ path: "title", before: live.title, after: "New title", formattingOnly: false }] });
    });
});

describe("pickPaths: restore one field or component", () => {
    const old = { title: "Old", faq: [{ q: "A?", a: "Old answer" }, { q: "B?", a: "B" }], sections: [{ heading: "One" }, { heading: "Two" }] };
    const cur = { title: "New", faq: [{ q: "A?", a: "New answer" }], sections: [{ heading: "One" }, { heading: "Two, edited" }], extra: 1 };

    it("takes only the named paths from the old version", () => {
        expect(pickPaths(cur, old, ["faq"])).toEqual({ ...cur, faq: old.faq });
        expect(pickPaths(cur, old, ["sections[1].heading"])).toEqual({ ...cur, sections: [{ heading: "One" }, { heading: "Two" }] });
        expect(pickPaths(cur, old, ["faq[0].a", "title"])).toEqual({ ...cur, title: "Old", faq: [{ q: "A?", a: "Old answer" }] });
    });

    it("removes a field the old version didn't have, and leaves the input untouched", () => {
        expect(pickPaths(cur, old, ["extra"])).not.toHaveProperty("extra");
        expect(cur.extra).toBe(1);
    });

    it("splits dotted and indexed paths", () => {
        expect(pathKeys("servicePageContent.sections[2].heading")).toEqual(["servicePageContent", "sections", 2, "heading"]);
    });
});
