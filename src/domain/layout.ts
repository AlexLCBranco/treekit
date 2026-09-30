import { visibleSubtree } from "./tree";
import type { NodeId, TreeState } from "./types";

/**
 * Auto-layout: turns a tree plus each node's measured size into top-left
 * positions. This is the only file that knows how placement works, so
 * swapping the algorithm touches nothing else.
 *
 * A hand-written "tidy tree" rather than dagre: dagre is a general graph
 * layout that reorders siblings to reduce edge crossings, so "option A"
 * could end up to the right of "option B" just because B was added. For a
 * decision tree, sibling order is meaning, and a tree has no crossings to
 * reduce anyway. This algorithm keeps order, is deterministic, handles
 * variable node sizes, and has no dependency. (If Mermaid import ever needs
 * nodes with two parents, a graph layout like dagre/elk can sit beside this
 * one for those trees.)
 *
 * How it works, with "breadth" = the axis siblings spread along (x in
 * top-down) and "depth" = the axis the tree grows along (y in top-down):
 *  1. Every depth level is as deep as its deepest node, so each generation
 *     lines up in one row (or column), like Mermaid.
 *  2. Each subtree's breadth is the larger of its own node and its children
 *     laid side by side with `nodeGap` between them.
 *  3. Children are placed left-to-right in order, their block centred on
 *     the parent.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LayoutOptions {
  /** Gap between siblings (and between neighbouring subtrees). */
  readonly nodeGap: number;
  /** Gap between one generation and the next. */
  readonly rankGap: number;
  /** Used for a node that has not been measured yet. */
  readonly fallbackSize: Size;
}

export function layoutTree(
  state: TreeState,
  sizes: ReadonlyMap<NodeId, Size>,
  options: LayoutOptions,
): Map<NodeId, Point> {
  const { nodeGap, rankGap, fallbackSize } = options;
  const vertical = state.direction === "TB";
  const { nodeIds } = visibleSubtree(state);
  const visible = new Set(nodeIds);

  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const breadthOf = (id: NodeId) => (vertical ? sizeOf(id).width : sizeOf(id).height);
  const depthSizeOf = (id: NodeId) => (vertical ? sizeOf(id).height : sizeOf(id).width);
  const childrenOf = (id: NodeId) =>
    (state.childEdges[id] ?? []).map((e) => state.edges[e].target).filter((c) => visible.has(c));

  // 1. Depth of every node, and how deep each level is.
  const level = new Map<NodeId, number>();
  const levelDepth: number[] = [];
  const assignLevels = (id: NodeId, d: number) => {
    level.set(id, d);
    levelDepth[d] = Math.max(levelDepth[d] ?? 0, depthSizeOf(id));
    for (const child of childrenOf(id)) assignLevels(child, d + 1);
  };
  assignLevels(state.rootId, 0);

  const levelStart: number[] = [];
  let offset = 0;
  for (let d = 0; d < levelDepth.length; d++) {
    levelStart[d] = offset;
    offset += levelDepth[d] + rankGap;
  }

  // 2. Breadth of every subtree, bottom-up.
  const subtreeBreadth = new Map<NodeId, number>();
  const childBlock = new Map<NodeId, number>();
  const measure = (id: NodeId): number => {
    const children = childrenOf(id);
    const block =
      children.reduce((sum, child) => sum + measure(child), 0) +
      nodeGap * Math.max(0, children.length - 1);
    childBlock.set(id, block);
    const breadth = Math.max(breadthOf(id), block);
    subtreeBreadth.set(id, breadth);
    return breadth;
  };
  measure(state.rootId);

  // 3. Place top-down: each node centred in its slot, its children's block
  // centred under it.
  const positions = new Map<NodeId, Point>();
  const place = (id: NodeId, slotStart: number) => {
    const center = slotStart + subtreeBreadth.get(id)! / 2;
    const d = level.get(id)!;
    const along = center - breadthOf(id) / 2;
    // Top-down: centred within its row, so a short node sits level with
    // tall ones. Left-right: flush with the column's start, so a narrow
    // node stays close to its parent instead of floating mid-column.
    const slack = levelDepth[d] - depthSizeOf(id);
    const across = levelStart[d] + (vertical ? slack / 2 : 0);
    positions.set(id, vertical ? { x: along, y: across } : { x: across, y: along });

    let cursor = center - childBlock.get(id)! / 2;
    for (const child of childrenOf(id)) {
      place(child, cursor);
      cursor += subtreeBreadth.get(child)! + nodeGap;
    }
  };
  // Start so the root is centred on 0: stable as the tree grows sideways.
  place(state.rootId, -subtreeBreadth.get(state.rootId)! / 2);

  return positions;
}
