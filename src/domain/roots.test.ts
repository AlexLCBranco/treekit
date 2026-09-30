import { describe, expect, it } from "vitest";

import { layoutTree } from "./layout";
import { toMermaid } from "./mermaid";
import { moveFrom } from "./navigation";
import { readTree, serializeTree } from "./persistence";
import {
  addChild,
  addRoot,
  cloneTree,
  createTree,
  deleteBranch,
  deleteNode,
  isRoot,
  neighbourAfterDelete,
  visibleSubtree,
} from "./tree";
import type { NodeId, TreeDoc, TreeId } from "./types";

const options = { nodeGap: 10, rankGap: 20, fallbackSize: { width: 100, height: 40 } };

/** A board with two trees: `first` (root + 1 child) and `second` (a lone root at 500, 300). */
function board() {
  const t0 = createTree("first");
  const first = t0.roots[0].id;
  const child = addChild(t0, first, "child");
  const two = addRoot(child.state, 500, 300, "second");
  return { tree: two.state, first, child: child.nodeId!, second: two.nodeId };
}

describe("several roots", () => {
  it("adds a root at a point, with no edges and nothing else touched", () => {
    const { tree, first, second } = board();
    expect(tree.roots).toEqual([
      { id: first, x: 0, y: 0 },
      { id: second, x: 500, y: 300 },
    ]);
    expect(tree.nodes[second].title).toBe("second");
    expect(tree.childEdges[second]).toEqual([]);
    expect(isRoot(tree, second)).toBe(true);
    expect(isRoot(tree, board().child)).toBe(false);
  });

  it("draws every root's tree", () => {
    const { tree, first, child, second } = board();
    expect(visibleSubtree(tree).nodeIds).toEqual([first, child, second]);
  });

  it("lays each tree out from its own root's position", () => {
    const { tree, first, child, second } = board();
    const { positions } = layoutTree(tree, new Map(), options);
    // Same shape as a lone tree, shifted: the root's top-centre is its point.
    expect(positions.get(first)).toEqual({ x: -50, y: 0 });
    expect(positions.get(child)).toEqual({ x: -50, y: 60 });
    expect(positions.get(second)).toEqual({ x: 450, y: 300 });
  });

  it("uses the root's point as its left-middle edge in LR mode", () => {
    const { tree, second } = board();
    const { positions } = layoutTree({ ...tree, direction: "LR" }, new Map(), options);
    expect(positions.get(second)).toEqual({ x: 500, y: 300 - 20 });
  });

  it("deleting a root removes its whole tree, but never the last root", () => {
    const { tree, first, child, second } = board();
    const gone = deleteBranch(tree, first);
    expect(gone.roots.map((r) => r.id)).toEqual([second]);
    expect(gone.nodes[first]).toBeUndefined();
    expect(gone.nodes[child]).toBeUndefined();
    expect(Object.keys(gone.edges)).toEqual([]);
    expect(deleteBranch(gone, second)).toBe(gone);
  });

  it("deleting only a root is refused (its children would have nowhere to go)", () => {
    const { tree, first } = board();
    expect(deleteNode(tree, first)).toBe(tree);
  });

  it("selects a neighbouring root after deleting a root", () => {
    const { tree, first, second } = board();
    expect(neighbourAfterDelete(tree, first)).toBe(second);
    expect(neighbourAfterDelete(tree, second)).toBe(first);
  });

  it("does not walk along a row into another tree", () => {
    const { tree, first, second } = board();
    expect(moveFrom(tree, first, "next")).toBeNull();
    expect(moveFrom(tree, second, "prev")).toBeNull();
  });

  it("clones every root with fresh ids and the same positions", () => {
    const { tree } = board();
    const copy = cloneTree(tree);
    expect(copy.roots.map(({ x, y }) => [x, y])).toEqual([
      [0, 0],
      [500, 300],
    ]);
    for (const root of copy.roots) {
      expect(tree.nodes[root.id]).toBeUndefined();
      expect(copy.nodes[root.id]).toBeDefined();
    }
  });

  it("exports every tree to Mermaid", () => {
    const text = toMermaid(board().tree);
    expect(text).toContain('["first"]');
    expect(text).toContain('["second"]');
    expect(text).toContain('["child"]');
  });
});

describe("saving several roots", () => {
  const doc = (): TreeDoc => ({ id: "t1" as TreeId, name: "Board", state: board().tree });
  const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

  it("round-trips every root and its position", () => {
    const d = doc();
    expect(readTree(roundTrip(serializeTree(d)))).toEqual({ status: "ok", doc: d });
  });

  it("opens a version 1 save (one rootId) as a single root at the origin", () => {
    const t = createTree("old");
    const v1 = {
      version: 1,
      doc: {
        id: "t1",
        name: "Old",
        state: {
          rootId: t.roots[0].id,
          nodes: t.nodes,
          edges: t.edges,
          childEdges: t.childEdges,
          direction: "TB",
        },
      },
    };
    const read = readTree(roundTrip(v1));
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.doc.state.roots).toEqual([{ id: t.roots[0].id, x: 0, y: 0 }]);
  });

  it("repairs a missing or duplicated root, and keeps the trees that survive", () => {
    const d = doc();
    const data = roundTrip(serializeTree(d));
    data.doc.state.roots.push({ id: "ghost", x: 1, y: 1 }, data.doc.state.roots[0]);
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired")
      expect(read.doc.state.roots.map((r) => r.id)).toEqual(d.state.roots.map((r) => r.id));
  });

  it("does not drop a second root's tree as unreachable", () => {
    const d = doc();
    const read = readTree(roundTrip(serializeTree(d)));
    if (read.status !== "ok") throw new Error("expected ok");
    const ids = Object.keys(read.doc.state.nodes) as NodeId[];
    expect(ids).toHaveLength(3);
  });

  it("drops an edge that points into a root", () => {
    const d = doc();
    const data = roundTrip(serializeTree(d));
    const [a, b] = d.state.roots;
    data.doc.state.edges.bad = { id: "bad", source: a.id, target: b.id, label: "" };
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") expect(read.doc.state.edges["bad" as never]).toBeUndefined();
  });
});
