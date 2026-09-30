import { describe, expect, it } from "vitest";

import { layoutTree, type LayoutOptions } from "./layout";
import { fromMermaid, toMermaid } from "./mermaid";
import { moveFrom } from "./navigation";
import { readTree, serializeTree } from "./persistence";
import {
  addChild,
  cloneTree,
  createTree,
  cutNodeIds,
  forkBranch,
  hiddenCount,
  setCollapsed,
  setHideCut,
  setNodeStatus,
  setNodesStatus,
  toggleCut,
  visibleAncestor,
  visibleChildren,
  visibleSubtree,
} from "./tree";
import type { NodeId, TreeDoc, TreeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title: string): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  return { state: result.state, id: result.nodeId! };
}

/** Start → A → A1, A2; Start → B. */
function sample() {
  const t = createTree("Start");
  const start = t.roots[0];
  const a = add(t, start, "A");
  const b = add(a.state, start, "B");
  const a1 = add(b.state, a.id, "A1");
  const a2 = add(a1.state, a.id, "A2");
  return { state: a2.state, start, a: a.id, b: b.id, a1: a1.id, a2: a2.id };
}

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("node status", () => {
  it("starts empty, and sets and clears, touching only the nodes slice", () => {
    const s = sample();
    expect(s.state.nodes[s.a].status).toBeNull();
    expect(s.state.hideCut).toBe(false);
    const kept = setNodeStatus(s.state, s.a, "keep");
    expect(kept.nodes[s.a].status).toBe("keep");
    expect(kept.edges).toBe(s.state.edges);
    expect(setNodeStatus(kept, s.a, "keep")).toBe(kept);
    expect(setNodeStatus(kept, s.a, null).nodes[s.a].status).toBeNull();
  });

  it("sets several at once", () => {
    const s = sample();
    const next = setNodesStatus(s.state, [s.a1, s.b], "maybe");
    expect([s.a1, s.b].map((id) => next.nodes[id].status)).toEqual(["maybe", "maybe"]);
  });

  it("toggles cut: cuts all unless all are cut, then clears", () => {
    const s = sample();
    const mixed = setNodeStatus(s.state, s.a1, "cut");
    const allCut = toggleCut(mixed, [s.a1, s.b]);
    expect([allCut.nodes[s.a1].status, allCut.nodes[s.b].status]).toEqual(["cut", "cut"]);
    const back = toggleCut(allCut, [s.a1, s.b]);
    expect([back.nodes[s.a1].status, back.nodes[s.b].status]).toEqual([null, null]);
    // A keep/maybe node is cut by X, not cleared.
    expect(toggleCut(setNodeStatus(s.state, s.b, "keep"), [s.b]).nodes[s.b].status).toBe("cut");
    expect(toggleCut(s.state, [])).toBe(s.state);
  });
});

describe("cut branches", () => {
  it("counts a node as cut if it or any ancestor is, keeping descendants' own status", () => {
    let { state, a, a1, a2, b, start } = sample();
    state = setNodeStatus(state, a1, "keep");
    state = setNodeStatus(state, a, "cut");
    expect(cutNodeIds(state)).toEqual(new Set([a, a1, a2]));
    expect(cutNodeIds(state).has(b) || cutNodeIds(state).has(start)).toBe(false);
    // Un-cutting A brings back exactly what was there.
    const restored = setNodeStatus(state, a, null);
    expect(cutNodeIds(restored).size).toBe(0);
    expect(restored.nodes[a1].status).toBe("keep");
  });

  it("stays on the page, greyed out, until hidden", () => {
    const s = sample();
    const cut = setNodeStatus(s.state, s.a, "cut");
    expect(visibleSubtree(cut).nodeIds).toHaveLength(5);

    const hidden = setHideCut(cut, true);
    expect(visibleSubtree(hidden).nodeIds).toEqual([s.start, s.b]);
    expect(visibleSubtree(hidden).edgeIds).toHaveLength(1);
    expect(visibleChildren(hidden, s.start)).toEqual([s.b]);
    expect(setHideCut(hidden, true)).toBe(hidden);
  });

  it("closes the gap in the layout, like folding", () => {
    const s = sample();
    const hidden = setHideCut(setNodeStatus(s.state, s.a, "cut"), true);
    const options: LayoutOptions = { nodeGap: 20, rankGap: 40, treeGap: 60, fallbackSize: { width: 100, height: 40 } };
    const { positions } = layoutTree(hidden, new Map(), options);
    expect([...positions.keys()].sort()).toEqual([s.start, s.b].sort());
  });

  it("hides a cut root's whole tree", () => {
    const s = sample();
    const hidden = setHideCut(setNodeStatus(s.state, s.start, "cut"), true);
    expect(visibleSubtree(hidden).nodeIds).toEqual([]);
    expect(visibleAncestor(hidden, s.a1)).toBeNull();
  });

  it("moves a hidden node's stand-in to the parent of the hidden branch", () => {
    const s = sample();
    const hidden = setHideCut(setNodeStatus(s.state, s.a, "cut"), true);
    expect(visibleAncestor(hidden, s.a2)).toBe(s.start);
    expect(visibleAncestor(hidden, s.a)).toBe(s.start);
    expect(visibleAncestor(hidden, s.b)).toBe(s.b);
    // Folding higher up still wins.
    expect(visibleAncestor(setCollapsed(hidden, s.start, true), s.a2)).toBe(s.start);
  });

  it("skips hidden children when counting a fold and walking down", () => {
    const s = sample();
    const cut = setNodeStatus(s.state, s.a1, "cut");
    expect(hiddenCount(cut, s.start)).toBe(4);
    const hidden = setHideCut(cut, true);
    expect(hiddenCount(hidden, s.start)).toBe(3);
    expect(moveFrom(hidden, s.a, "child")).toBe(s.a2);
    const bothHidden = setHideCut(setNodeStatus(cut, s.a2, "cut"), true);
    expect(moveFrom(bothHidden, s.a, "child")).toBeNull();
  });

  it("carries status and the hide toggle into copies and forks", () => {
    const s = sample();
    const state = setHideCut(setNodeStatus(setNodeStatus(s.state, s.a1, "cut"), s.a, "maybe"), true);
    expect(cloneTree(state).hideCut).toBe(true);
    const fork = forkBranch(state, s.a, "Fork");
    const copied = Object.values(fork.state.nodes).filter((n) => !state.nodes[n.id]);
    expect(copied.map((n) => [n.title, n.status])).toEqual(
      expect.arrayContaining([["Fork", "maybe"], ["A1", "cut"], ["A2", null]]),
    );
  });
});

describe("saving status", () => {
  it("round-trips status and the hide toggle", () => {
    const s = sample();
    const state = setHideCut(setNodesStatus(s.state, [s.a, s.b], "maybe"), true);
    const doc: TreeDoc = { id: "t" as TreeId, name: "T", state };
    expect(readTree(roundTrip(serializeTree(doc)))).toEqual({ status: "ok", doc });
  });

  it("opens version 3 saves unchanged: no status, cut branches shown", () => {
    const s = sample();
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: s.state }));
    data.version = 3;
    delete data.doc.state.hideCut;
    for (const node of Object.values(data.doc.state.nodes)) delete (node as { status?: unknown }).status;
    const read = readTree(data);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    expect(read.doc.state.hideCut).toBe(false);
    expect(Object.values(read.doc.state.nodes).every((n) => n.status === null)).toBe(true);
  });

  it("opens version 1 and 2 saves too, with every new field defaulted", () => {
    const s = sample();
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: s.state }));
    data.version = 1;
    data.doc.state.rootId = s.start;
    delete data.doc.state.roots;
    delete data.doc.state.trash;
    delete data.doc.state.hideCut;
    for (const node of Object.values(data.doc.state.nodes) as Record<string, unknown>[]) {
      delete node.status;
      delete node.notes;
    }
    const read = readTree(data);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.doc.state).toEqual(s.state);
  });

  it("repairs an unknown status", () => {
    const s = sample();
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: s.state }));
    data.doc.state.nodes[s.a].status = "discarded";
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") expect(read.doc.state.nodes[s.a].status).toBeNull();
  });
});

describe("status in Mermaid", () => {
  it("writes classDef and class lines for the statuses in use", () => {
    const s = sample();
    const text = toMermaid(setNodesStatus(setNodeStatus(s.state, s.a, "cut"), [s.a1, s.b], "keep"));
    expect(text).toContain("    classDef keep stroke-width:3px\n    class n3,n5 keep\n");
    expect(text).toContain("    class n2 cut\n");
    expect(text).not.toContain("classDef maybe");
  });

  it("reads statuses back from class lines and ::: shorthand, ignoring other classes", () => {
    const s = sample();
    const state = setNodeStatus(setNodeStatus(s.state, s.a, "cut"), s.b, "maybe");
    const back = fromMermaid(toMermaid(state));
    if (!back.ok) throw new Error(back.error);
    const statuses = Object.values(back.state.nodes).map((n) => [n.title, n.status]);
    expect(statuses).toEqual(expect.arrayContaining([["A", "cut"], ["B", "maybe"], ["Start", null]]));

    const short = fromMermaid("flowchart TD\n  X[Start] --> Y[Maybe]:::maybe --> Z:::fancy\n  class X keep");
    if (!short.ok) throw new Error(short.error);
    expect(Object.values(short.state.nodes).map((n) => n.status)).toEqual(["keep", "maybe", null]);
  });
});
