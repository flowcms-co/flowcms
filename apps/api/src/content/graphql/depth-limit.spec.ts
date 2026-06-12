import { buildSchema, parse, specifiedRules, validate } from "graphql";
import { describe, expect, it } from "vitest";
import { depthLimitRule } from "./graphql.controller";

// A tiny self-referential schema so a query can nest arbitrarily deep.
const schema = buildSchema(`
    type Node {
        id: ID!
        child: Node
    }
    type Query {
        root: Node
    }
`);

function depthErrors(query: string, max: number) {
    return validate(schema, parse(query), [...specifiedRules, depthLimitRule(max)]);
}

describe("depthLimitRule()", () => {
    it("passes a query at or under the max depth", () => {
        // depth 2: root -> child
        const errors = depthErrors(`{ root { child { id } } }`, 3);
        expect(errors).toHaveLength(0);
    });

    it("reports an error for a query deeper than the max", () => {
        // depth 4: root -> child -> child -> child
        const errors = depthErrors(`{ root { child { child { child { id } } } } }`, 3);
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toMatch(/too deep/i);
    });

    it("follows fragment spreads when measuring depth", () => {
        const query = `
            { root { ...deep } }
            fragment deep on Node { child { child { child { id } } } }
        `;
        const errors = depthErrors(query, 3);
        expect(errors.length).toBeGreaterThan(0);
    });
});
