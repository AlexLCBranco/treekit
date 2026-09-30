import { describe, expect, it } from "vitest";

import { alignViewport, arrowToMove, moveFrom, revealViewport } from "./navigation";
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
  const root = tree.roots[0].id;
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

describe("revealViewport", () => {
  const screen = { width: 800, height: 600 };
  const size = { width: 100, height: 40 };
  const vp = { x: 0, y: 0, zoom: 1 };

  it("leaves the camera alone when the node is in view", () => {
    expect(revealViewport(vp, screen, { x: 300, y: 300 }, size, 40)).toBeNull();
  });

  it("moves only as far as needed, keeping the margin", () => {
    // Right edge at 900: move left so it ends at 800 - 40.
    expect(revealViewport(vp, screen, { x: 800, y: 300 }, size, 40)).toEqual({ x: -140, y: 0, zoom: 1 });
    // Above the top: move down so its top sits at 40.
    expect(revealViewport(vp, screen, { x: 300, y: -100 }, size, 40)).toEqual({ x: 0, y: 140, zoom: 1 });
  });

  it("accounts for pan and zoom", () => {
    // At zoom 2 the node spans screen x 1600..1800, shifted by -1000 -> 600..800.
    const zoomed = { x: -1000, y: 0, zoom: 2 };
    expect(revealViewport(zoomed, screen, { x: 800, y: 100 }, size, 40)).toEqual({ x: -1040, y: 0, zoom: 2 });
  });

  it("aligns a node bigger than the screen by its start", () => {
    const huge = { width: 2000, height: 40 };
    expect(revealViewport(vp, screen, { x: 500, y: 300 }, huge, 40)).toEqual({ x: -460, y: 0, zoom: 1 });
  });
});

describe("alignViewport", () => {
  const screen = { width: 800, height: 600 };
  const bounds = { x: -200, y: 10, width: 400, height: 300 };
  const at = (x: "start" | "center" | "end", y: "start" | "center" | "end") =>
    alignViewport(bounds, screen, { x, y }, 40, 1);

  it("puts the tree against the chosen edges, margin in", () => {
    expect(at("start", "start")).toEqual({ x: 240, y: 30, zoom: 1 });
    expect(at("end", "end")).toEqual({ x: 560, y: 250, zoom: 1 });
  });

  it("centres on either axis", () => {
    expect(at("center", "center")).toEqual({ x: 400, y: 140, zoom: 1 });
  });

  it("zooms out just enough for a big tree to fit", () => {
    const vp = alignViewport({ x: 0, y: 0, width: 1440, height: 100 }, screen, { x: "start", y: "start" }, 40, 1);
    expect(vp.zoom).toBeCloseTo(0.5);
    expect(vp.x).toBe(40);
  });
});
