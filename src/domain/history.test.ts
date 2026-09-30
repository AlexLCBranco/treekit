import { describe, expect, it } from "vitest";

import { amendLast, EMPTY_HISTORY, record, redo, undo } from "./history";
import { addChild, createTree, renameNode } from "./tree";
import type { NodeId } from "./types";

describe("history", () => {
  it("undoes and redoes a step, restoring the exact slices", () => {
    const t0 = createTree("root");
    const t1 = renameNode(t0, t0.roots[0].id, "renamed");
    const h1 = record(EMPTY_HISTORY, t0, t1);

    const back = undo(h1, t1)!;
    expect(back.state.nodes).toBe(t0.nodes);
    const forward = redo(back.history, back.state)!;
    expect(forward.state.nodes).toBe(t1.nodes);
  });

  it("stores only the slices that changed", () => {
    const t0 = createTree();
    const t1 = renameNode(t0, t0.roots[0].id, "x");
    const entry = record(EMPTY_HISTORY, t0, t1).past[0];
    expect(Object.keys(entry.after)).toEqual(["nodes"]);
  });

  it("drops no-op steps and clears redo on a new step", () => {
    const t0 = createTree();
    expect(record(EMPTY_HISTORY, t0, t0)).toBe(EMPTY_HISTORY);

    const t1 = renameNode(t0, t0.roots[0].id, "a");
    const undone = undo(record(EMPTY_HISTORY, t0, t1), t1)!;
    expect(undone.history.future).toHaveLength(1);
    const t2 = renameNode(undone.state, t0.roots[0].id, "b");
    expect(record(undone.history, undone.state, t2).future).toHaveLength(0);
  });

  it("folds add-then-name into one undo step", () => {
    const t0 = createTree();
    const added = addChild(t0, t0.roots[0].id);
    const t1 = added.state;
    const t2 = renameNode(t1, added.nodeId as NodeId, "named");
    const h = amendLast(record(EMPTY_HISTORY, t0, t1), t1, t2);

    expect(h.past).toHaveLength(1);
    const back = undo(h, t2)!;
    expect(back.state.nodes).toBe(t0.nodes);
    expect(back.state.edges).toBe(t0.edges);
    expect(redo(back.history, back.state)!.state.nodes).toBe(t2.nodes);
  });

  it("returns null at either end of the stack", () => {
    const t0 = createTree();
    expect(undo(EMPTY_HISTORY, t0)).toBeNull();
    expect(redo(EMPTY_HISTORY, t0)).toBeNull();
  });
});
