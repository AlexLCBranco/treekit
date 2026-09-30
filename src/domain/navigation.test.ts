import { describe, expect, it } from "vitest";

import { arrowToMove, moveFrom, placeOnPage, scrollToReveal } from "./navigation";
import { addChild, createTree, setCollapsed } from "./tree";
import type { NodeId, TreeState } from "./types";

function add(state: TreeState, parent: NodeId): { state: TreeState; id: NodeId } {
  const result = addChild(state, parent);
  if (!result.nodeId) throw new Error("parent missing");
  return { state: result.state, id: result.nodeId };
}

/**
 *        root
 *       /    \
 *      a      b
 *     / \      \
 *    a1  a2     b1
 */
function sample() {
  let tree = createTree();
  const root = tree.roots[0];
  let r = add(tree, root);
  const a = r.id;
  r = add(r.state, root);
  const b = r.id;
  r = add(r.state, a);
  const a1 = r.id;
  r = add(r.state, a);
  const a2 = r.id;
  r = add(r.state, b);
  const b1 = r.id;
  tree = r.state;
  return { tree, root, a, b, a1, a2, b1 };
}

describe("arrowToMove", () => {
  it("points the arrows the way the tree is drawn", () => {
    expect(arrowToMove("ArrowUp", "TB")).toBe("parent");
    expect(arrowToMove("ArrowDown", "TB")).toBe("child");
    expect(arrowToMove("ArrowRight", "TB")).toBe("next");
    expect(arrowToMove("ArrowLeft", "LR")).toBe("parent");
    expect(arrowToMove("ArrowRight", "LR")).toBe("child");
    expect(arrowToMove("ArrowDown", "LR")).toBe("next");
  });
});

describe("moveFrom", () => {
  it("goes up to the parent, and nowhere from the root", () => {
    const { tree, root, a, a1 } = sample();
    expect(moveFrom(tree, a1, "parent")).toBe(a);
    expect(moveFrom(tree, a, "parent")).toBe(root);
    expect(moveFrom(tree, root, "parent")).toBeNull();
  });

  it("goes down to the first child, or the remembered one", () => {
    const { tree, a, a1, a2, b1 } = sample();
    expect(moveFrom(tree, a, "child")).toBe(a1);
    expect(moveFrom(tree, a, "child", a2)).toBe(a2);
    // A remembered node that is not (or no longer) its child is ignored.
    expect(moveFrom(tree, a, "child", b1)).toBe(a1);
    expect(moveFrom(tree, a1, "child")).toBeNull();
  });

  it("does not go into a folded branch", () => {
    const { tree, a } = sample();
    expect(moveFrom(setCollapsed(tree, a, true), a, "child")).toBeNull();
  });

  it("walks a whole generation, crossing to cousins", () => {
    const { tree, a, b, a1, a2, b1 } = sample();
    expect(moveFrom(tree, a, "next")).toBe(b);
    expect(moveFrom(tree, b, "next")).toBeNull();
    expect(moveFrom(tree, a, "prev")).toBeNull();
    expect(moveFrom(tree, a2, "next")).toBe(b1);
    expect(moveFrom(tree, b1, "prev")).toBe(a2);
    expect(moveFrom(tree, a2, "prev")).toBe(a1);
  });

  it("skips nodes hidden in a folded branch", () => {
    const { tree, a, b1 } = sample();
    expect(moveFrom(setCollapsed(tree, a, true), b1, "prev")).toBeNull();
  });

  it("ignores a missing node", () => {
    expect(moveFrom(sample().tree, "nope" as NodeId, "next")).toBeNull();
  });
});

describe("placeOnPage", () => {
  const screen = { width: 800, height: 600 };
  const bounds = { x: -200, y: 10, width: 400, height: 300 };
  const at = (x: "start" | "center" | "end", y: "start" | "center" | "end") =>
    placeOnPage(bounds, screen, { x, y }, 40);

  it("uses the screen as the page when the tree fits, tree against the chosen edges", () => {
    expect(at("start", "start")).toEqual({ width: 800, height: 600, x: 240, y: 30 });
    expect(at("end", "end")).toEqual({ width: 800, height: 600, x: 560, y: 250 });
  });

  it("centres on either axis", () => {
    expect(at("center", "center")).toEqual({ width: 800, height: 600, x: 400, y: 140 });
  });

  it("grows the page (never zooms) on an axis where a big tree does not fit", () => {
    const page = placeOnPage({ x: 0, y: 0, width: 1440, height: 100 }, screen, { x: "center", y: "start" }, 40);
    expect(page).toEqual({ width: 1520, height: 600, x: 40, y: 40 });
  });
});

describe("scrollToReveal", () => {
  const view = { left: 100, top: 100, width: 400, height: 300 };

  it("stays put when the target is already in view", () => {
    expect(scrollToReveal({ x: 200, y: 200, width: 50, height: 50 }, view, 10)).toEqual({ left: 100, top: 100 });
  });

  it("scrolls just far enough, margin included", () => {
    expect(scrollToReveal({ x: 480, y: 50, width: 50, height: 20 }, view, 10)).toEqual({ left: 140, top: 40 });
  });

  it("lines up a target bigger than the view with its start, never below 0", () => {
    expect(scrollToReveal({ x: 5, y: 300, width: 900, height: 20 }, view, 10)).toEqual({ left: 0, top: 100 });
  });
});
