import { describe, expect, it } from "vitest";

import { addChild, createTree, setCollapsed, toggleCollapsedNodes } from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title: string): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  return { state: result.state, id: result.nodeId! };
}

/** Start → A → A1; Start → B → B1; Start → C (a leaf). */
function sample() {
  const t = createTree("Start");
  const start = t.roots[0];
  const a = add(t, start, "A");
  const b = add(a.state, start, "B");
  const c = add(b.state, start, "C");
  const a1 = add(c.state, a.id, "A1");
  const b1 = add(a1.state, b.id, "B1");
  return { state: b1.state, a: a.id, b: b.id, c: c.id };
}

describe("toggleCollapsedNodes", () => {
  it("folds every node with children and skips leaves", () => {
    const { state, a, b, c } = sample();
    const next = toggleCollapsedNodes(state, [a, b, c]);
    expect(next.nodes[a].collapsed).toBe(true);
    expect(next.nodes[b].collapsed).toBe(true);
    expect(next.nodes[c].collapsed).toBeFalsy();
  });

  it("folds the rest when only some are folded", () => {
    const { state, a, b } = sample();
    const next = toggleCollapsedNodes(setCollapsed(state, a, true), [a, b]);
    expect(next.nodes[a].collapsed).toBe(true);
    expect(next.nodes[b].collapsed).toBe(true);
  });

  it("unfolds them all when all are folded", () => {
    const { state, a, b } = sample();
    const folded = toggleCollapsedNodes(state, [a, b]);
    const next = toggleCollapsedNodes(folded, [a, b]);
    expect(next.nodes[a].collapsed).toBe(false);
    expect(next.nodes[b].collapsed).toBe(false);
  });

  it("returns the same state when nothing can fold", () => {
    const { state, c } = sample();
    expect(toggleCollapsedNodes(state, [c, "missing" as NodeId])).toBe(state);
  });
});
