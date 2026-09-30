import { describe, expect, it } from "vitest";

import { layoutTree } from "./layout";
import { addChild, childrenOf, createTree, renameNode, visibleSubtree } from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId, title = ""): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent, title);
  if (!result.nodeId) throw new Error("parent missing");
  return { state: result.state, id: result.nodeId };
}

describe("tree operations", () => {
  it("creates a tree with only a root", () => {
    const tree = createTree("Root");
    expect(Object.keys(tree.nodes)).toEqual([tree.rootId]);
    expect(tree.nodes[tree.rootId].title).toBe("Root");
  });

  it("appends children in order and links them with edges", () => {
    let tree = createTree();
    const first = add(tree, tree.rootId, "A");
    const second = add(first.state, tree.rootId, "B");
    tree = second.state;
    expect(childrenOf(tree, tree.rootId)).toEqual([first.id, second.id]);
  });

  it("ignores a missing parent", () => {
    const tree = createTree();
    expect(addChild(tree, "nope" as NodeId)).toEqual({ state: tree, nodeId: null });
  });

  it("only copies the slices it touches", () => {
    const tree = createTree();
    const renamed = renameNode(tree, tree.rootId, "New");
    expect(renamed.edges).toBe(tree.edges);
    expect(renamed.childEdges).toBe(tree.childEdges);
    expect(renameNode(renamed, tree.rootId, "New")).toBe(renamed);
  });

  it("hides the children of a collapsed node, and expands it on add", () => {
    let tree = createTree();
    const child = add(tree, tree.rootId);
    tree = add(child.state, child.id).state;
    tree = {
      ...tree,
      nodes: { ...tree.nodes, [child.id]: { ...tree.nodes[child.id], collapsed: true } },
    };
    expect(visibleSubtree(tree).nodeIds).toEqual([tree.rootId, child.id]);

    tree = add(tree, child.id).state;
    expect(tree.nodes[child.id].collapsed).toBe(false);
    expect(visibleSubtree(tree).nodeIds).toHaveLength(4);
  });
});

describe("layout", () => {
  const options = { nodeGap: 20, rankGap: 40, fallbackSize: { width: 100, height: 40 } };

  it("places children below their parent, siblings side by side in order", () => {
    let tree = createTree();
    const a = add(tree, tree.rootId);
    const b = add(a.state, tree.rootId);
    tree = b.state;
    const pos = layoutTree(tree, new Map(), options);
    const root = pos.get(tree.rootId)!;
    const pa = pos.get(a.id)!;
    const pb = pos.get(b.id)!;
    expect(pa.y).toBeGreaterThan(root.y);
    expect(pa.y).toBe(pb.y);
    expect(pa.x).toBeLessThan(pb.x);
  });

  it("never overlaps neighbouring subtrees, whatever their sizes", () => {
    let tree = createTree();
    const a = add(tree, tree.rootId);
    const b = add(a.state, tree.rootId);
    const a1 = add(b.state, a.id);
    const a2 = add(a1.state, a.id);
    const b1 = add(a2.state, b.id);
    tree = b1.state;
    const sizes = new Map([[a2.id, { width: 300, height: 90 }]]);
    const pos = layoutTree(tree, sizes, options);
    // a2 is the right-most grandchild under A; b1 must start after it.
    expect(pos.get(b1.id)!.x).toBeGreaterThanOrEqual(pos.get(a2.id)!.x + 300 + options.nodeGap);
    // Grandchildren share one row even though a2 is taller.
    expect(pos.get(a1.id)!.y + 20).toBe(pos.get(a2.id)!.y + 45);
  });

  it("grows rightwards in LR mode", () => {
    let tree = createTree("R", "LR");
    const a = add(tree, tree.rootId);
    tree = a.state;
    const pos = layoutTree(tree, new Map(), options);
    expect(pos.get(a.id)!.x).toBeGreaterThan(pos.get(tree.rootId)!.x);
  });
});
