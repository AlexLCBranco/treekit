import { describe, expect, it } from "vitest";

import {
  addChild,
  addRoot,
  childrenOf,
  createTree,
  forkBranch,
  forkTitle,
  parentEdgeOf,
  renameNode,
  rootOf,
  setCollapsed,
  setEdgeLabel,
  setNodeColor,
  setNotes,
  subtreeIds,
  trashTree,
} from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title: string): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  return { state: result.state, id: result.nodeId! };
}

/** Start → Yes (label "if he stays") → Stay → Later (label "a year on"); Start → No. */
function story() {
  let state = createTree("Start");
  const start = state.roots[0];
  const yes = add(state, start, "Yes");
  const no = add(yes.state, start, "No");
  const stay = add(no.state, yes.id, "Stay");
  const later = add(stay.state, stay.id, "Later");
  state = later.state;
  state = setEdgeLabel(state, parentEdgeOf(state, yes.id)!.id, "if he stays");
  state = setEdgeLabel(state, parentEdgeOf(state, later.id)!.id, "a year on");
  state = setNodeColor(state, stay.id, "green");
  state = setNotes(state, later.id, "She writes back.");
  state = setCollapsed(state, stay.id, true);
  return { state, start, yes: yes.id, no: no.id, stay: stay.id, later: later.id };
}

describe("forkBranch", () => {
  it("copies the branch into a new tree right after its own, the copied node as root", () => {
    const s = story();
    const other = addRoot(s.state, 1, "Other");
    const { state, nodeId } = forkBranch(other.state, s.yes, "Start — Yes");
    expect(state.roots).toEqual([s.start, nodeId, other.nodeId]);
    const root = nodeId!;
    expect(state.nodes[root].title).toBe("Start — Yes");
    expect(parentEdgeOf(state, root)).toBeNull();

    const [stay] = childrenOf(state, root);
    const [later] = childrenOf(state, stay);
    expect(state.nodes[stay]).toMatchObject({ title: "Stay", color: "green", collapsed: true });
    expect(state.nodes[later]).toMatchObject({ title: "Later", notes: "She writes back." });
    expect(state.edges[parentEdgeOf(state, later)!.id].label).toBe("a year on");
  });

  it("gives the copy fresh ids and leaves the original untouched", () => {
    const s = story();
    const { state, nodeId } = forkBranch(s.state, s.yes, "Fork");
    const copied = subtreeIds(state, nodeId!);
    const original = subtreeIds(s.state, s.yes);
    expect(copied).toHaveLength(original.length);
    for (const id of copied) expect(s.state.nodes[id]).toBeUndefined();
    for (const id of original) expect(state.nodes[id]).toBe(s.state.nodes[id]);
    for (const id of Object.keys(s.state.edges)) {
      expect(state.edges[id as never]).toBe(s.state.edges[id as never]);
    }
    // No edge of the copy points back into the original.
    for (const id of copied) {
      for (const edgeId of state.childEdges[id]) expect(copied).toContain(state.edges[edgeId].target);
    }
    expect(state.childEdges[s.start]).toBe(s.state.childEdges[s.start]);
  });

  it("edits to the copy never reach the original", () => {
    const s = story();
    const { state, nodeId } = forkBranch(s.state, s.yes, "Fork");
    const [stayCopy] = childrenOf(state, nodeId!);
    const edited = renameNode(setNotes(state, stayCopy, "changed"), stayCopy, "Leave");
    expect(edited.nodes[s.stay]).toMatchObject({ title: "Stay", notes: "" });
  });

  it("forks a leaf, and a root (a copy of the whole tree)", () => {
    const s = story();
    const leaf = forkBranch(s.state, s.no, "Start — No");
    expect(subtreeIds(leaf.state, leaf.nodeId!)).toHaveLength(1);

    const whole = forkBranch(s.state, s.start, "Start (copy)");
    expect(subtreeIds(whole.state, whole.nodeId!)).toHaveLength(subtreeIds(s.state, s.start).length);
    expect(whole.state.roots).toEqual([s.start, whole.nodeId]);
  });

  it("does nothing for a missing node or a branch of a trashed tree", () => {
    const s = story();
    expect(forkBranch(s.state, "ghost" as NodeId, "x").state).toBe(s.state);
    const two = addRoot(s.state, 1, "Other");
    const trashed = trashTree(two.state, s.start, 0);
    expect(forkBranch(trashed, s.yes, "x")).toEqual({ state: trashed, nodeId: null });
  });
});

describe("forkTitle and rootOf", () => {
  it("names a fork after its tree and the forked node", () => {
    const s = story();
    expect(rootOf(s.state, s.later)).toBe(s.start);
    expect(forkTitle(s.state, s.stay)).toBe("Start — Stay");
    expect(forkTitle(s.state, s.start)).toBe("Start (copy)");
    const blank = renameNode(s.state, s.stay, "");
    expect(forkTitle(blank, s.stay)).toBe("Start — Untitled");
  });
});
