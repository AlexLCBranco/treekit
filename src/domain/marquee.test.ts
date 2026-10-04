import { describe, expect, it } from "vitest";

import { contains, labelRect, marqueeGroup } from "./marquee";
import type { NodeId } from "./types";

const id = (s: string) => s as NodeId;

describe("contains", () => {
  const box = { x: 0, y: 0, width: 100, height: 100 };

  it("holds a rect fully inside, edges included", () => {
    expect(contains(box, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
    expect(contains(box, box)).toBe(true);
  });

  it("does not hold a rect that sticks out", () => {
    expect(contains(box, { x: 90, y: 10, width: 20, height: 20 })).toBe(false);
    expect(contains(box, { x: -1, y: 10, width: 20, height: 20 })).toBe(false);
  });
});

describe("labelRect", () => {
  const node = { x: 100, y: 200, width: 80, height: 40 };
  const label = { width: 30, height: 10 };

  it("sits above the node's top centre when the tree grows down", () => {
    expect(labelRect(node, label, 25, "TB")).toEqual({ x: 125, y: 170, width: 30, height: 10 });
  });

  it("sits left of the node's middle when the tree grows right", () => {
    expect(labelRect(node, label, 25, "LR")).toEqual({ x: 60, y: 215, width: 30, height: 10 });
  });
});

describe("marqueeGroup", () => {
  it("keeps the order of nodes already picked and appends new ones", () => {
    expect(marqueeGroup([id("a"), id("b")], new Set([id("c"), id("b"), id("a")]))).toEqual(["a", "b", "c"]);
  });

  it("drops nodes the box no longer picks", () => {
    expect(marqueeGroup([id("a"), id("b")], new Set([id("b")]))).toEqual(["b"]);
    expect(marqueeGroup([id("a")], new Set())).toEqual([]);
  });
});
