import { describe, expect, it } from "vitest";

import { layoutTree, type Size } from "./layout";
import {
  addChild,
  childrenOf,
  createTree,
  hiddenCount,
  parentEdgeOf,
  renameNode,
  setCollapsed,
  setEdgeLabel,
  setNodeColor,
  visibleAncestor,
  visibleSubtree,
} from "./tree";
import type { EdgeId, NodeId, TreeState } from "./types";

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

  it("sets and clears a node's colour", () => {
    const tree = createTree();
    const { state, id } = add(tree, tree.rootId);
    const colored = setNodeColor(state, id, "red");
    expect(colored.nodes[id].color).toBe("red");
    // Only that node's record is new; the rest is shared.
    expect(colored.nodes[state.rootId]).toBe(state.nodes[state.rootId]);
    expect(colored.edges).toBe(state.edges);
    // No-ops return the same state, so the store records no undo step.
    expect(setNodeColor(colored, id, "red")).toBe(colored);
    expect(setNodeColor(colored, "nope" as NodeId, "blue")).toBe(colored);
    expect(setNodeColor(colored, id, null).nodes[id].color).toBeNull();
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

describe("collapse", () => {
  // root -> a -> b -> c, plus root -> d
  function chain() {
    const tree = createTree();
    const a = add(tree, tree.rootId);
    const b = add(a.state, a.id);
    const c = add(b.state, b.id);
    const d = add(c.state, tree.rootId);
    return { tree: d.state, a: a.id, b: b.id, c: c.id, d: d.id };
  }

  it("folds and unfolds a branch without deleting it", () => {
    const { tree, a, d } = chain();
    const folded = setCollapsed(tree, a, true);
    expect(folded.nodes[a].collapsed).toBe(true);
    expect(visibleSubtree(folded).nodeIds).toEqual([tree.rootId, a, d]);
    expect(Object.keys(folded.nodes)).toHaveLength(5);
    expect(folded.edges).toBe(tree.edges);

    const unfolded = setCollapsed(folded, a, false);
    expect(visibleSubtree(unfolded).nodeIds).toHaveLength(5);
  });

  it("treats leaves, repeats and missing nodes as no-ops", () => {
    const { tree, a, c } = chain();
    expect(setCollapsed(tree, c, true)).toBe(tree);
    expect(setCollapsed(tree, a, false)).toBe(tree);
    expect(setCollapsed(tree, "nope" as NodeId, true)).toBe(tree);
    const folded = setCollapsed(tree, a, true);
    expect(setCollapsed(folded, a, true)).toBe(folded);
  });

  it("counts every node below a collapsed one, nested folds included", () => {
    const { tree, a, b } = chain();
    expect(hiddenCount(tree, a)).toBe(2);
    expect(hiddenCount(setCollapsed(tree, b, true), a)).toBe(2);
    expect(hiddenCount(tree, tree.rootId)).toBe(4);
    expect(hiddenCount(tree, "nope" as NodeId)).toBe(0);
  });

  it("finds the outermost collapsed ancestor hiding a node", () => {
    const { tree, a, b, c, d } = chain();
    expect(visibleAncestor(tree, c)).toBe(c);
    const both = setCollapsed(setCollapsed(tree, a, true), b, true);
    expect(visibleAncestor(both, c)).toBe(a);
    expect(visibleAncestor(both, b)).toBe(a);
    expect(visibleAncestor(both, a)).toBe(a);
    expect(visibleAncestor(both, d)).toBe(d);
    expect(visibleAncestor(both, "nope" as NodeId)).toBeNull();
  });

  it("lays out a collapsed node like a leaf", () => {
    const { tree, a, b } = chain();
    const options = { nodeGap: 20, rankGap: 40, fallbackSize: { width: 100, height: 40 } };
    const { positions, routes } = layoutTree(setCollapsed(tree, a, true), new Map(), options);
    expect(positions.has(b)).toBe(false);
    expect(positions.size).toBe(3);
    expect(routes.size).toBe(2);
  });
});

describe("layout", () => {
  const options = { nodeGap: 20, rankGap: 40, fallbackSize: { width: 100, height: 40 } };

  it("places children below their parent, siblings side by side in order", () => {
    let tree = createTree();
    const a = add(tree, tree.rootId);
    const b = add(a.state, tree.rootId);
    tree = b.state;
    const pos = layoutTree(tree, new Map(), options).positions;
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
    const pos = layoutTree(tree, sizes, options).positions;
    // a2 is the right-most grandchild under A; b1 must start after it.
    expect(pos.get(b1.id)!.x).toBeGreaterThanOrEqual(pos.get(a2.id)!.x + 300 + options.nodeGap);
    // Grandchildren share one row even though a2 is taller.
    expect(pos.get(a1.id)!.y + 20).toBe(pos.get(a2.id)!.y + 45);
  });

  it("grows rightwards in LR mode", () => {
    let tree = createTree("R", "LR");
    const a = add(tree, tree.rootId);
    tree = a.state;
    const pos = layoutTree(tree, new Map(), options).positions;
    expect(pos.get(a.id)!.x).toBeGreaterThan(pos.get(tree.rootId)!.x);
  });
});

describe("edge labels", () => {
  it("sets and clears a label, leaving other slices untouched", () => {
    const t0 = createTree();
    const a = add(t0, t0.rootId);
    const edge = parentEdgeOf(a.state, a.id)!;
    const labelled = setEdgeLabel(a.state, edge.id, "yes");
    expect(labelled.edges[edge.id].label).toBe("yes");
    expect(labelled.nodes).toBe(a.state.nodes);
    expect(setEdgeLabel(labelled, edge.id, "").edges[edge.id].label).toBe("");
  });

  it("returns the same state for no change or a missing edge", () => {
    const t0 = createTree();
    const a = add(t0, t0.rootId);
    const edge = parentEdgeOf(a.state, a.id)!;
    expect(setEdgeLabel(a.state, edge.id, "")).toBe(a.state);
    expect(setEdgeLabel(a.state, "nope" as never, "x")).toBe(a.state);
  });
});

describe("layout with edge labels", () => {
  const options = { nodeGap: 20, rankGap: 40, fallbackSize: { width: 100, height: 40 } };

  /** root -> [a, b], with label sizes set on the edges into a and b. */
  function labelled(direction: "TB" | "LR", sizes: [Size | null, Size | null]) {
    let tree = createTree("R", direction);
    const a = add(tree, tree.rootId);
    const b = add(a.state, tree.rootId);
    tree = b.state;
    const labels = new Map<EdgeId, Size>();
    [a.id, b.id].forEach((id, i) => {
      const size = sizes[i];
      if (!size) return;
      const edge = parentEdgeOf(tree, id)!;
      tree = setEdgeLabel(tree, edge.id, "label");
      labels.set(edge.id, size);
    });
    return { tree, a: a.id, b: b.id, labels };
  }

  it("widens the gap before a generation by its tallest label", () => {
    const plain = labelled("TB", [null, null]);
    const withLabel = labelled("TB", [{ width: 30, height: 18 }, null]);
    const base = layoutTree(plain.tree, new Map(), options).positions;
    const pos = layoutTree(withLabel.tree, new Map(), options, withLabel.labels).positions;
    expect(pos.get(withLabel.a)!.y).toBe(base.get(plain.a)!.y + 18);
    expect(pos.get(withLabel.b)!.y).toBe(pos.get(withLabel.a)!.y);
  });

  it("ignores a size left over for an edge whose label is now empty", () => {
    const { tree, a, labels } = labelled("TB", [{ width: 30, height: 18 }, null]);
    const cleared = setEdgeLabel(tree, parentEdgeOf(tree, a)!.id, "");
    const pos = layoutTree(cleared, new Map(), options, labels).positions;
    expect(pos.get(a)!.y).toBe(40 + options.rankGap);
  });

  it("spaces siblings apart by their labels when a label is wider than its node", () => {
    const { tree, a, b, labels } = labelled("TB", [{ width: 200, height: 18 }, null]);
    const pos = layoutTree(tree, new Map(), options, labels).positions;
    // a's label is centred on a and 200 wide, so it reaches 50 past a's
    // right side; b starts a node gap after that.
    expect(pos.get(b)!.x).toBe(pos.get(a)!.x + 100 + 50 + options.nodeGap);
  });

  it("routes each edge: the bend half a gap past the parent, the label centred before the child", () => {
    const { tree, a, labels } = labelled("TB", [{ width: 30, height: 20 }, null]);
    const { positions, routes } = layoutTree(tree, new Map(), options, labels);
    const route = routes.get(parentEdgeOf(tree, a)!.id)!;
    const rootBottom = positions.get(tree.rootId)!.y + 40;
    const bend = rootBottom + route.bendAfterSource;
    const label = positions.get(a)!.y - route.labelBeforeTarget;
    expect(bend).toBe(rootBottom + options.rankGap / 2);
    // Label (20 tall) centred between the bend and the child: equal space
    // above and below it.
    expect(label - 10 - bend).toBe(positions.get(a)!.y - (label + 10));
  });

  it("uses label widths for the gap in LR mode", () => {
    const plain = labelled("LR", [null, null]);
    const withLabel = labelled("LR", [null, { width: 60, height: 18 }]);
    const base = layoutTree(plain.tree, new Map(), options).positions;
    const pos = layoutTree(withLabel.tree, new Map(), options, withLabel.labels).positions;
    expect(pos.get(withLabel.b)!.x).toBe(base.get(plain.b)!.x + 60);
  });
});

describe("layout alignment", () => {
  const options = { nodeGap: 20, rankGap: 40, fallbackSize: { width: 100, height: 40 } };
  // root with two children a, b (all 100 wide): children block is 220 wide.
  const build = () => {
    const tree = createTree();
    const a = add(tree, tree.rootId);
    const b = add(a.state, tree.rootId);
    return { tree: b.state, a: a.id, b: b.id };
  };
  const at = (align: { x: "start" | "center" | "end" | null; y: "start" | "center" | "end" | null }, sizes = new Map<NodeId, Size>()) => {
    const { tree, a, b } = build();
    const pos = layoutTree(tree, sizes, { ...options, align }).positions;
    return { root: pos.get(tree.rootId)!, a: pos.get(a)!, b: pos.get(b)! };
  };

  it("defaults to the parent centred over its children", () => {
    const { root, a, b } = at({ x: null, y: null });
    expect(root.x + 50).toBe((a.x + b.x + 100) / 2);
  });

  it("left: the parent starts where its children start", () => {
    const { root, a } = at({ x: "start", y: null });
    expect(root.x).toBe(a.x);
  });

  it("right: the parent ends where its children end", () => {
    const { root, b } = at({ x: "end", y: null });
    expect(root.x + 100).toBe(b.x + 100);
  });

  it("top / bottom: a short node sits at the start or end of its row", () => {
    const { tree, a, b } = build();
    const sizes = new Map<NodeId, Size>([
      [a, { width: 100, height: 100 }],
      [b, { width: 100, height: 40 }],
    ]);
    const top = layoutTree(tree, sizes, { ...options, align: { x: null, y: "start" } }).positions;
    expect(top.get(b)!.y).toBe(top.get(a)!.y);
    const bottom = layoutTree(tree, sizes, { ...options, align: { x: null, y: "end" } }).positions;
    expect(bottom.get(b)!.y + 40).toBe(bottom.get(a)!.y + 100);
  });
});
