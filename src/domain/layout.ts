import { visibleSubtree } from "./tree";
import type { EdgeId, NodeId, TreeState } from "./types";

/**
 * Auto-layout: turns a tree plus each node's (and edge label's) measured
 * size into top-left positions. This is the only file that knows how
 * placement works, so swapping the algorithm touches nothing else.
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
 *
 * Edge labels sit on the last straight stretch of their edge, just before
 * the child they describe. So each label counts twice: its depth widens the
 * gap in front of its child's generation (a "label band"), and its breadth
 * counts like a wide node, so neighbouring labels never overlap.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Start / middle / end of an axis: left-centre-right, or top-middle-bottom. */
export type Align = "start" | "center" | "end";

/** Alignment on the page's own axes, like Excalidraw's Align panel. `null`
    = the direction's default look. */
export interface Alignment {
  readonly x: Align | null;
  readonly y: Align | null;
}

/**
 * What the layout does for each axis. Defaults match the original look:
 * top-down centres parents over their children and rows of nodes; left-right
 * keeps each column flush with its start, so a narrow node stays close to
 * its parent instead of floating mid-column.
 */
export function resolveAlignment(direction: TreeState["direction"], align: Alignment) {
  return { x: align.x ?? (direction === "TB" ? "center" : "start"), y: align.y ?? "center" } as {
    x: Align;
    y: Align;
  };
}

export interface LayoutOptions {
  /** Gap between siblings (and between neighbouring subtrees). */
  readonly nodeGap: number;
  /** Gap between one generation and the next, not counting labels. */
  readonly rankGap: number;
  /** Used for a node that has not been measured yet. */
  readonly fallbackSize: Size;
  /** Alignment of parents over their children (across) and of nodes of
      different sizes within a generation (along). */
  readonly align?: Alignment;
}

/**
 * Where an edge bends and where its label goes, as distances along the
 * depth axis. Each is measured from the end of the edge it belongs with --
 * the bend from the parent, the label from the child -- so both stay put
 * while nodes glide to new places.
 */
export interface EdgeRoute {
  /** From the source's edge (its bottom, top-down) to the bend. */
  readonly bendAfterSource: number;
  /** From the target's near edge (its top, top-down) back to the label's
      centre. */
  readonly labelBeforeTarget: number;
}

export interface TreeLayout {
  readonly positions: Map<NodeId, Point>;
  readonly routes: Map<EdgeId, EdgeRoute>;
}

export function layoutTree(
  state: TreeState,
  sizes: ReadonlyMap<NodeId, Size>,
  options: LayoutOptions,
  labelSizes: ReadonlyMap<EdgeId, Size> = new Map(),
): TreeLayout {
  const { nodeGap, rankGap, fallbackSize } = options;
  const vertical = state.direction === "TB";
  const resolved = resolveAlignment(state.direction, options.align ?? { x: null, y: null });
  // Breadth = the axis siblings spread along; depth = the axis it grows on.
  const breadthAlign = vertical ? resolved.x : resolved.y;
  const depthAlign = vertical ? resolved.y : resolved.x;
  const shareOf = (a: Align) => (a === "start" ? 0 : a === "center" ? 0.5 : 1);
  const { nodeIds, edgeIds } = visibleSubtree(state);
  const visible = new Set(nodeIds);

  const sizeOf = (id: NodeId) => sizes.get(id) ?? fallbackSize;
  const breadth = (size: Size) => (vertical ? size.width : size.height);
  const depthSize = (size: Size) => (vertical ? size.height : size.width);
  const childrenOf = (id: NodeId) =>
    (state.childEdges[id] ?? []).map((e) => state.edges[e].target).filter((c) => visible.has(c));

  // The label on the edge into each node, if it has a size.
  const incomingLabel = new Map<NodeId, Size>();
  for (const edgeId of edgeIds) {
    const size = labelSizes.get(edgeId);
    if (size && state.edges[edgeId].label) incomingLabel.set(state.edges[edgeId].target, size);
  }
  // A node's slot is as broad as the node or the label above it.
  const slotBreadthOf = (id: NodeId) => {
    const label = incomingLabel.get(id);
    return Math.max(breadth(sizeOf(id)), label ? breadth(label) : 0);
  };

  // 1. Depth of every node, how deep each level is, and how deep the label
  // band in front of it is.
  const level = new Map<NodeId, number>();
  const levelDepth: number[] = [];
  const labelBand: number[] = [];
  const assignLevels = (id: NodeId, d: number) => {
    level.set(id, d);
    levelDepth[d] = Math.max(levelDepth[d] ?? 0, depthSize(sizeOf(id)));
    const label = incomingLabel.get(id);
    labelBand[d] = Math.max(labelBand[d] ?? 0, label ? depthSize(label) : 0);
    for (const child of childrenOf(id)) assignLevels(child, d + 1);
  };
  assignLevels(state.rootId, 0);

  // Between two levels: half the rank gap, the bend, the other half of the
  // gap with the label band inside it, then the next level.
  const levelStart: number[] = [];
  let offset = 0;
  for (let d = 0; d < levelDepth.length; d++) {
    if (d > 0) offset += rankGap + labelBand[d];
    levelStart[d] = offset;
    offset += levelDepth[d];
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
    const size = Math.max(slotBreadthOf(id), block);
    subtreeBreadth.set(id, size);
    return size;
  };
  measure(state.rootId);

  // 3. Place top-down: each node centred in its slot, its children's block
  // centred under it.
  const positions = new Map<NodeId, Point>();
  // Where each node's depth-axis span starts, kept for the edge routes.
  const nearSide = new Map<NodeId, number>();
  const place = (id: NodeId, slotStart: number) => {
    const slot = subtreeBreadth.get(id)!;
    const own = slotBreadthOf(id);
    const share = shareOf(breadthAlign);
    // The node and its children's block each sit at the slot's start,
    // middle or end. Only one of them is narrower than the slot.
    const center = slotStart + own / 2 + (slot - own) * share;
    const d = level.get(id)!;
    const along = center - breadth(sizeOf(id)) / 2;
    const slack = levelDepth[d] - depthSize(sizeOf(id));
    const across = levelStart[d] + slack * shareOf(depthAlign);
    positions.set(id, vertical ? { x: along, y: across } : { x: across, y: along });
    nearSide.set(id, across);

    const block = childBlock.get(id)!;
    let cursor = slotStart + (slot - block) * share;
    for (const child of childrenOf(id)) {
      place(child, cursor);
      cursor += subtreeBreadth.get(child)! + nodeGap;
    }
  };
  // Start so the root is centred on 0: stable as the tree grows sideways.
  place(state.rootId, -subtreeBreadth.get(state.rootId)! / 2);

  // 4. Edge routes. The bend sits half a rank gap past the end of the
  // parent's level; the label is centred between the bend and the child's
  // level, which leaves a quarter rank gap either side of the tallest one.
  const routes = new Map<EdgeId, EdgeRoute>();
  for (const edgeId of edgeIds) {
    const { source, target } = state.edges[edgeId];
    const d = level.get(target)!;
    const parentLevelEnd = levelStart[d - 1] + levelDepth[d - 1];
    const sourceEnd = nearSide.get(source)! + depthSize(sizeOf(source));
    const labelCenter = levelStart[d] - (rankGap / 2 + labelBand[d]) / 2;
    routes.set(edgeId, {
      bendAfterSource: parentLevelEnd + rankGap / 2 - sourceEnd,
      labelBeforeTarget: nearSide.get(target)! - labelCenter,
    });
  }

  return { positions, routes };
}
