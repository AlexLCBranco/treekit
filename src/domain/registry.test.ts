import { describe, expect, it } from "vitest";

import { readRegistry, removeTree, serializeRegistry, upsertTree } from "./registry";
import { addChild, childrenOf, cloneTree, createTree } from "./tree";
import type { TreeId } from "./types";

const a = { id: "a" as TreeId, name: "A" };
const b = { id: "b" as TreeId, name: "B" };

describe("registry", () => {
  it("round-trips through its saved form", () => {
    expect(readRegistry(JSON.parse(JSON.stringify(serializeRegistry([a, b]))))).toEqual([a, b]);
  });

  it("rejects non-registries and skips bad or duplicate entries", () => {
    expect(readRegistry(null)).toBeNull();
    expect(readRegistry({ version: 9, trees: [] })).toBeNull();
    expect(readRegistry({ version: 1, trees: [a, 5, { name: "no id" }, a, { id: "c", name: "" }] })).toEqual([
      a,
      { id: "c", name: "Untitled tree" },
    ]);
  });

  it("appends new trees and renames existing ones in place", () => {
    const list = upsertTree(upsertTree([], a), b);
    expect(list).toEqual([a, b]);
    expect(upsertTree(list, { id: a.id, name: "A2" })).toEqual([{ id: a.id, name: "A2" }, b]);
    expect(upsertTree(list, a)).toBe(list);
    expect(removeTree(list, a.id)).toEqual([b]);
  });
});

describe("cloneTree", () => {
  it("copies structure and content with entirely fresh ids", () => {
    const t0 = createTree("root", "LR");
    const child = addChild(t0, t0.roots[0], "child");
    const original = addChild(child.state, child.nodeId!, "grandchild").state;
    const copy = cloneTree(original);

    const originalIds = new Set([...Object.keys(original.nodes), ...Object.keys(original.edges)]);
    for (const id of [...Object.keys(copy.nodes), ...Object.keys(copy.edges)]) {
      expect(originalIds.has(id)).toBe(false);
    }
    expect(copy.direction).toBe("LR");
    const [copiedChild] = childrenOf(copy, copy.roots[0]);
    expect(copy.nodes[copiedChild].title).toBe("child");
    expect(copy.nodes[childrenOf(copy, copiedChild)[0]].title).toBe("grandchild");
  });
});
