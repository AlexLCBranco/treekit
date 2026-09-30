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
  deleteBranches,
  deleteNode,
  emptyTrash,
  isRoot,
  neighbourAfterDelete,
  purgeTrashedTree,
  restoreTree,
  TRASH_LIMIT,
  trashTree,
  visibleSubtree,
} from "./tree";
import type { NodeId, TreeDoc, TreeId } from "./types";

const options = { nodeGap: 10, rankGap: 20, treeGap: 30, fallbackSize: { width: 100, height: 40 } };

/** A board with two trees: `first` (root + 1 child) and `second` (a lone root). */
function board() {
  const t0 = createTree("first");
  const first = t0.roots[0];
  const child = addChild(t0, first, "child");
  const two = addRoot(child.state, 1, "second");
  return { tree: two.state, first, child: child.nodeId!, second: two.nodeId };
}

describe("several roots", () => {
  it("adds a root at a place in the row, with no edges", () => {
    const { tree, first, second } = board();
    expect(tree.roots).toEqual([first, second]);
    expect(tree.nodes[second].title).toBe("second");
    expect(tree.childEdges[second]).toEqual([]);
    expect(isRoot(tree, second)).toBe(true);
    expect(isRoot(tree, board().child)).toBe(false);

    const front = addRoot(tree, 0, "front");
    expect(front.state.roots).toEqual([front.nodeId, first, second]);
    const end = addRoot(tree, 99);
    expect(end.state.roots).toEqual([first, second, end.nodeId]); // clamped to the end
  });

  it("draws every root's tree", () => {
    const { tree, first, child, second } = board();
    expect(visibleSubtree(tree).nodeIds).toEqual([first, child, second]);
  });

  it("lays trees out side by side from the same top, the row centred on 0", () => {
    const { tree, first, child, second } = board();
    const { positions } = layoutTree(tree, new Map(), options);
    // Two 100-wide trees and a 30 gap: 230 wide, so it spans -115 to 115.
    expect(positions.get(first)).toEqual({ x: -115, y: 0 });
    expect(positions.get(child)).toEqual({ x: -115, y: 60 });
    expect(positions.get(second)).toEqual({ x: 15, y: 0 });
  });

  it("stacks trees in a column in LR mode, all starting at the same left", () => {
    const { tree, first, second } = board();
    const { positions } = layoutTree({ ...tree, direction: "LR" }, new Map(), options);
    expect(positions.get(first)!.x).toBe(0);
    expect(positions.get(second)!.x).toBe(0);
    expect(positions.get(second)!.y).toBeGreaterThan(positions.get(first)!.y);
  });

  it("refuses to delete just a root (its children would have nowhere to go)", () => {
    const { tree, first } = board();
    expect(deleteNode(tree, first)).toBe(tree);
    expect(deleteBranch(tree, first)).toBe(tree);
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

  it("clones every root and the trash with fresh ids", () => {
    const { tree, first, second } = board();
    const copy = cloneTree(trashTree(tree, second, 5));
    expect(copy.roots).toHaveLength(1);
    expect(copy.roots[0]).not.toBe(first);
    expect(copy.trash).toHaveLength(1);
    expect(copy.trash[0]).toMatchObject({ deletedAt: 5 });
    expect(copy.nodes[copy.trash[0].rootId]).toBeDefined();
    expect(tree.nodes[copy.trash[0].rootId]).toBeUndefined();
  });

  it("exports every tree on the board to Mermaid, but not the trash", () => {
    const { tree, second } = board();
    const text = toMermaid(tree);
    expect(text).toContain('["first"]');
    expect(text).toContain('["second"]');
    expect(toMermaid(trashTree(tree, second, 0))).not.toContain('["second"]');
  });
});

describe("the trash", () => {
  it("takes a whole tree off the board but keeps it for restoring", () => {
    const { tree, first, child, second } = board();
    const trashed = trashTree(tree, first, 100);
    expect(trashed.roots).toEqual([second]);
    expect(trashed.trash).toEqual([{ rootId: first, deletedAt: 100 }]);
    // Kept, but not drawn.
    expect(trashed.nodes[first]).toBeDefined();
    expect(trashed.nodes[child]).toBeDefined();
    expect(visibleSubtree(trashed).nodeIds).toEqual([second]);
    expect(layoutTree(trashed, new Map(), options).positions.has(child)).toBe(false);
  });

  it("sends selected roots to the trash in a group delete, keeping the last tree", () => {
    const { tree, first, child, second } = board();
    const all = deleteBranches(tree, [first, child, second], 7);
    expect(all.roots).toEqual([second]); // second is the last one left, so it stays
    expect(all.trash).toEqual([{ rootId: first, deletedAt: 7 }]);
    expect(deleteBranches(tree, [first])).toBe(tree); // no timestamp: roots are left alone
  });

  it("never trashes the last tree, or a node that is not a root", () => {
    const { tree, first, child, second } = board();
    const one = trashTree(tree, first, 0);
    expect(trashTree(one, second, 0)).toBe(one);
    expect(trashTree(tree, child, 0)).toBe(tree);
  });

  it("restores a tree to the end of the row, whole", () => {
    const { tree, first, child, second } = board();
    const restored = restoreTree(trashTree(tree, first, 0), first);
    expect(restored.roots).toEqual([second, first]);
    expect(restored.trash).toEqual([]);
    expect(visibleSubtree(restored).nodeIds).toEqual([second, first, child]);
    expect(restoreTree(restored, first)).toBe(restored);
  });

  it("deletes one trashed tree for good, or all of them", () => {
    const { tree, first, child, second } = board();
    const trashed = trashTree(tree, first, 0);
    const purged = purgeTrashedTree(trashed, first);
    expect(purged.trash).toEqual([]);
    expect(purged.nodes[first]).toBeUndefined();
    expect(purged.nodes[child]).toBeUndefined();
    expect(Object.keys(purged.edges)).toEqual([]);
    expect(purged.nodes[second]).toBeDefined();
    expect(purgeTrashedTree(trashed, second)).toBe(trashed); // not in the trash
    expect(emptyTrash(trashed)).toEqual(purged);
    expect(emptyTrash(purged)).toBe(purged);
  });

  it("forgets the oldest trashed tree past the limit", () => {
    let state = createTree("keep");
    const ids: NodeId[] = [];
    for (let i = 0; i < TRASH_LIMIT + 1; i++) {
      const added = addRoot(state, 99, `t${i}`);
      ids.push(added.nodeId);
      state = trashTree(added.state, added.nodeId, i);
    }
    expect(state.trash).toHaveLength(TRASH_LIMIT);
    expect(state.trash[0].rootId).toBe(ids[1]);
    expect(state.nodes[ids[0]]).toBeUndefined();
    expect(state.nodes[ids[1]]).toBeDefined();
  });
});

describe("saving several roots and the trash", () => {
  const doc = (): TreeDoc => {
    const { tree, first } = board();
    return { id: "t1" as TreeId, name: "Board", state: trashTree(tree, first, 42) };
  };
  const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

  it("round-trips the roots and the trash", () => {
    const d = doc();
    expect(readTree(roundTrip(serializeTree(d)))).toEqual({ status: "ok", doc: d });
  });

  it("does not drop a trashed tree as unreachable", () => {
    const d = doc();
    const read = readTree(roundTrip(serializeTree(d)));
    if (read.status !== "ok") throw new Error("expected ok");
    expect(Object.keys(read.doc.state.nodes)).toHaveLength(3);
  });

  it("opens a version 1 save (one rootId) as a single root with an empty trash", () => {
    const t = createTree("old");
    const v1 = {
      version: 1,
      doc: {
        id: "t1",
        name: "Old",
        state: {
          rootId: t.roots[0],
          nodes: t.nodes,
          edges: t.edges,
          childEdges: t.childEdges,
          direction: "TB",
        },
      },
    };
    const read = readTree(roundTrip(v1));
    expect(read.status).toBe("ok");
    if (read.status === "ok") {
      expect(read.doc.state.roots).toEqual([t.roots[0]]);
      expect(read.doc.state.trash).toEqual([]);
    }
  });

  it("opens roots saved as { id, x, y } objects, ignoring the position", () => {
    const d = doc();
    const data = roundTrip(serializeTree(d));
    data.doc.state.roots = data.doc.state.roots.map((id: string) => ({ id, x: 5, y: 5 }));
    const read = readTree(data);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.doc.state.roots).toEqual(d.state.roots);
  });

  it("repairs a missing or duplicated root, and a trash entry that is also on the board", () => {
    const d = doc();
    const data = roundTrip(serializeTree(d));
    const [root] = d.state.roots;
    data.doc.state.roots.push("ghost", root);
    data.doc.state.trash.push({ rootId: root, deletedAt: 1 });
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") {
      expect(read.doc.state.roots).toEqual(d.state.roots);
      expect(read.doc.state.trash).toEqual(d.state.trash);
    }
  });

  it("drops an edge that points into a root", () => {
    const d = doc();
    const data = roundTrip(serializeTree(d));
    data.doc.state.edges.bad = {
      id: "bad",
      source: d.state.roots[0],
      target: d.state.trash[0].rootId,
      label: "",
    };
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") expect(read.doc.state.edges["bad" as never]).toBeUndefined();
  });
});
