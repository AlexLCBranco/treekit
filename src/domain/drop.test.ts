import { describe, expect, it } from "vitest";

import { dropPlacement, dropSpotAt } from "./drop";
import type { Rect } from "./navigation";
import { addChild, addRoot, childrenOf, createTree, moveBranch, parentEdgeOf, setCollapsed, setEdgeLabel } from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title: string): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  return { state: result.state, id: result.nodeId! };
}

/** Root → A (→ A1), B, C. */
function sample() {
  let state = createTree("Root");
  const root = state.roots[0];
  const a = add(state, root, "A");
  const b = add(a.state, root, "B");
  const c = add(b.state, root, "C");
  const a1 = add(c.state, a.id, "A1");
  state = a1.state;
  return { state, root, a: a.id, b: b.id, c: c.id, a1: a1.id };
}

const titles = (state: TreeState, id: NodeId) => childrenOf(state, id).map((c) => state.nodes[c].title);

describe("moveBranch", () => {
  it("reorders among siblings", () => {
    const t = sample();
    const next = moveBranch(t.state, t.c, t.root, 0);
    expect(titles(next, t.root)).toEqual(["C", "A", "B"]);
  });

  it("moves a branch under another parent, keeping its edge label and children", () => {
    const t = sample();
    const edge = parentEdgeOf(t.state, t.a)!;
    const labelled = setEdgeLabel(t.state, edge.id, "yes");
    const next = moveBranch(labelled, t.a, t.b, 0);
    expect(titles(next, t.root)).toEqual(["B", "C"]);
    expect(titles(next, t.b)).toEqual(["A"]);
    expect(titles(next, t.a)).toEqual(["A1"]);
    expect(parentEdgeOf(next, t.a)).toMatchObject({ id: edge.id, source: t.b, label: "yes" });
  });

  it("moves a branch into another tree", () => {
    const t = sample();
    const other = addRoot(t.state, 1, "Other");
    const next = moveBranch(other.state, t.a, other.nodeId, 0);
    expect(titles(next, other.nodeId)).toEqual(["A"]);
    expect(titles(next, t.root)).toEqual(["B", "C"]);
  });

  it("refuses a root, or a parent inside the moved branch", () => {
    const t = sample();
    expect(moveBranch(t.state, t.root, t.b, 0)).toBe(t.state);
    expect(moveBranch(t.state, t.a, t.a1, 0)).toBe(t.state);
    expect(moveBranch(t.state, t.a, t.a, 0)).toBe(t.state);
  });

  it("returns the same state when the branch stays where it is", () => {
    const t = sample();
    expect(moveBranch(t.state, t.b, t.root, 1)).toBe(t.state);
  });

  it("unfolds a folded parent it moves into", () => {
    const t = sample();
    const folded = setCollapsed(t.state, t.a, true);
    const next = moveBranch(folded, t.c, t.a, 0);
    expect(next.nodes[t.a].collapsed).toBe(false);
    expect(titles(next, t.a)).toEqual(["C", "A1"]);
  });
});

describe("dropSpotAt", () => {
  // Top-down: the root above, A, B, C in a row 100 wide with 20 between, A1 under A.
  const layout = (t: ReturnType<typeof sample>) =>
    new Map<NodeId, Rect>([
      [t.root, { x: 120, y: 0, width: 100, height: 40 }],
      [t.a, { x: 0, y: 100, width: 100, height: 40 }],
      [t.b, { x: 120, y: 100, width: 100, height: 40 }],
      [t.c, { x: 240, y: 100, width: 100, height: 40 }],
      [t.a1, { x: 0, y: 200, width: 100, height: 40 }],
    ]);

  it("the middle of a node means child, its ends mean sibling", () => {
    const t = sample();
    const rects = layout(t);
    expect(dropSpotAt(t.state, t.c, { x: 170, y: 120 }, rects, 20)).toEqual({ kind: "child", nodeId: t.b });
    expect(dropSpotAt(t.state, t.c, { x: 125, y: 120 }, rects, 20)).toEqual({ kind: "before", nodeId: t.b });
    expect(dropSpotAt(t.state, t.c, { x: 215, y: 120 }, rects, 20)).toEqual({ kind: "after", nodeId: t.b });
  });

  it("the gap beside a node means sibling, within reach", () => {
    const t = sample();
    const rects = layout(t);
    expect(dropSpotAt(t.state, t.a1, { x: 105, y: 120 }, rects, 20)).toEqual({ kind: "after", nodeId: t.a });
    expect(dropSpotAt(t.state, t.a1, { x: 360, y: 120 }, rects, 30)).toEqual({ kind: "after", nodeId: t.c });
    expect(dropSpotAt(t.state, t.a1, { x: 400, y: 120 }, rects, 30)).toBeNull();
    expect(dropSpotAt(t.state, t.a1, { x: 170, y: 70 }, rects, 30)).toBeNull();
  });

  it("anywhere on a root means child", () => {
    const t = sample();
    expect(dropSpotAt(t.state, t.c, { x: 122, y: 20 }, layout(t), 20)).toEqual({ kind: "child", nodeId: t.root });
  });

  it("never targets the dragged branch", () => {
    const t = sample();
    expect(dropSpotAt(t.state, t.a, { x: 50, y: 220 }, layout(t), 20)).toBeNull();
  });

  it("left-right trees spread siblings down the page", () => {
    const t = sample();
    const state = { ...t.state, direction: "LR" as const };
    const rects = new Map<NodeId, Rect>([[t.b, { x: 100, y: 0, width: 100, height: 40 }]]);
    expect(dropSpotAt(state, t.c, { x: 150, y: 2 }, rects, 20)).toEqual({ kind: "before", nodeId: t.b });
    expect(dropSpotAt(state, t.c, { x: 150, y: 50 }, rects, 20)).toEqual({ kind: "after", nodeId: t.b });
  });
});

describe("dropPlacement", () => {
  it("child goes last; before / after go beside the node", () => {
    const t = sample();
    expect(dropPlacement(t.state, t.c, { kind: "child", nodeId: t.a })).toEqual({ parentId: t.a, index: 1 });
    expect(dropPlacement(t.state, t.c, { kind: "before", nodeId: t.a })).toEqual({ parentId: t.root, index: 0 });
    expect(dropPlacement(t.state, t.a, { kind: "after", nodeId: t.c })).toEqual({ parentId: t.root, index: 2 });
  });

  it("is null where nothing would change", () => {
    const t = sample();
    expect(dropPlacement(t.state, t.b, { kind: "after", nodeId: t.a })).toBeNull();
    expect(dropPlacement(t.state, t.b, { kind: "before", nodeId: t.c })).toBeNull();
    expect(dropPlacement(t.state, t.c, { kind: "child", nodeId: t.root })).toBeNull();
    expect(dropPlacement(t.state, t.root, { kind: "child", nodeId: t.a })).toBeNull();
  });
});
