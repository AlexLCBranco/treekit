import { describe, expect, it } from "vitest";

import {
  addChild,
  childrenOf,
  createTree,
  deleteBranch,
  deleteBranches,
  deleteNode,
  neighbourAfterDelete,
  setNodesColor,
} from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title = ""): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  if (!result.nodeId) throw new Error("parent missing");
  return { state: result.state, id: result.nodeId };
}

/** root -> [a -> [a1, a2], b] */
function sample() {
  const t0 = createTree("root");
  const a = add(t0, t0.roots[0], "a");
  const a1 = add(a.state, a.id, "a1");
  const a2 = add(a1.state, a.id, "a2");
  const b = add(a2.state, t0.roots[0], "b");
  return { tree: b.state, root: t0.roots[0], a: a.id, a1: a1.id, a2: a2.id, b: b.id };
}

describe("deleteBranch", () => {
  it("removes the node, its descendants and every edge that touched them", () => {
    const { tree, root, a, b } = sample();
    const next = deleteBranch(tree, a);
    expect(Object.keys(next.nodes).sort()).toEqual([root, b].sort());
    expect(Object.keys(next.edges)).toHaveLength(1);
    expect(Object.keys(next.childEdges).sort()).toEqual([root, b].sort());
    expect(childrenOf(next, root)).toEqual([b]);
  });

  it("refuses to delete the root", () => {
    const { tree, root } = sample();
    expect(deleteBranch(tree, root)).toBe(tree);
  });
});

describe("deleteNode", () => {
  it("moves the children up into the node's place, in order", () => {
    const { tree, root, a, a1, a2, b } = sample();
    const next = deleteNode(tree, a);
    expect(next.nodes[a]).toBeUndefined();
    expect(childrenOf(next, root)).toEqual([a1, a2, b]);
    expect(Object.keys(next.edges)).toHaveLength(3);
  });

  it("keeps the moved children's edge labels", () => {
    const { tree, a, a1 } = sample();
    const edgeId = tree.childEdges[a][0];
    const labelled = {
      ...tree,
      edges: { ...tree.edges, [edgeId]: { ...tree.edges[edgeId], label: "yes" } },
    };
    const next = deleteNode(labelled, a);
    expect(Object.values(next.edges).find((e) => e.target === a1)?.label).toBe("yes");
  });
});

describe("neighbourAfterDelete", () => {
  it("prefers the next sibling, then the previous one, then the parent", () => {
    const { tree, root, a, a1, a2, b } = sample();
    expect(neighbourAfterDelete(tree, a)).toBe(b);
    expect(neighbourAfterDelete(tree, a2)).toBe(a1);
    expect(neighbourAfterDelete(deleteBranch(tree, a), b)).toBe(root);
    expect(neighbourAfterDelete(tree, root)).toBeNull();
  });
});

describe("deleteBranches", () => {
  it("deletes each branch, skipping a node already gone with its ancestor", () => {
    const { tree, root, a, a1, b } = sample();
    const next = deleteBranches(tree, [a, a1, b]);
    expect(Object.keys(next.nodes)).toEqual([root]);
  });

  it("still keeps the last root", () => {
    const { tree, root } = sample();
    expect(deleteBranches(tree, [root])).toBe(tree);
  });
});

describe("setNodesColor", () => {
  it("colours every listed node and leaves the others", () => {
    const { tree, a, b, root } = sample();
    const next = setNodesColor(tree, [a, b], "red");
    expect(next.nodes[a].color).toBe("red");
    expect(next.nodes[b].color).toBe("red");
    expect(next.nodes[root].color).not.toBe("red");
  });
});
