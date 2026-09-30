import type { Point, Size } from "./layout";
import { childrenOf, parentEdgeOf, visibleSubtree } from "./tree";
import type { LayoutDirection, NodeId, TreeState } from "./types";

/**
 * Keyboard navigation and the camera fit. Pure: no React,
 * no store, no React Flow.
 *
 * Moves follow the tree's structure, not screen geometry: "up the tree",
 * "down into a branch", "along the row". Structural moves never skip a node
 * or land somewhere surprising because two nodes happen to sit close
 * together, and they read the same in both layout directions.
 */

/** A move in tree terms, independent of which way the tree is drawn. */
export type TreeMove = "parent" | "child" | "prev" | "next";

export type ArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

/**
 * Which tree move an arrow key means. The arrows point the way things are
 * drawn: top-down, ↑ is the parent and ←/→ walk the row; left-right, ← is
 * the parent and ↑/↓ walk the column.
 */
export function arrowToMove(key: ArrowKey, direction: LayoutDirection): TreeMove {
  const topDown: Record<ArrowKey, TreeMove> = {
    ArrowUp: "parent",
    ArrowDown: "child",
    ArrowLeft: "prev",
    ArrowRight: "next",
  };
  const leftRight: Record<ArrowKey, TreeMove> = {
    ArrowLeft: "parent",
    ArrowRight: "child",
    ArrowUp: "prev",
    ArrowDown: "next",
  };
  return (direction === "TB" ? topDown : leftRight)[key];
}

/**
 * The node a move lands on, or `null` if there is nowhere to go (a root
 * has no parent, a leaf or folded node no visible child, a row has ends).
 *
 *  - parent: the node above.
 *  - child: `remembered` if it is still one of its visible children (the
 *    child last selected, so going up and back down returns to the same
 *    place), else the first child.
 *  - prev / next: the neighbour in the same generation, in drawing order,
 *    crossing over to cousins -- so ←/→ can sweep a whole row.
 */
export function moveFrom(
  state: TreeState,
  fromId: NodeId,
  move: TreeMove,
  remembered?: NodeId | null,
): NodeId | null {
  if (!state.nodes[fromId]) return null;

  if (move === "parent") return parentEdgeOf(state, fromId)?.source ?? null;

  if (move === "child") {
    if (state.nodes[fromId].collapsed) return null;
    const children = childrenOf(state, fromId);
    return remembered && children.includes(remembered) ? remembered : (children[0] ?? null);
  }

  const row = rowOf(state, fromId);
  const index = row.indexOf(fromId);
  if (index === -1) return null;
  return row[move === "next" ? index + 1 : index - 1] ?? null;
}

/**
 * The visible nodes in the same generation of the same tree as `nodeId`, in
 * drawing order. `visibleSubtree` lists nodes depth-first in sibling order,
 * which puts each generation left-to-right (top-to-bottom in left-right
 * trees). A board's separate trees are not walked between: where they sit
 * is up to the user, so there is no meaningful "next" root.
 */
function rowOf(state: TreeState, nodeId: NodeId): NodeId[] {
  const depth = new Map<NodeId, number>();
  const rootOf = new Map<NodeId, NodeId>();
  for (const id of state.roots) {
    depth.set(id, 0);
    rootOf.set(id, id);
  }
  const { nodeIds } = visibleSubtree(state);
  for (const id of nodeIds) {
    for (const child of childrenOf(state, id)) {
      depth.set(child, depth.get(id)! + 1);
      rootOf.set(child, rootOf.get(id)!);
    }
  }
  const target = depth.get(nodeId);
  const root = rootOf.get(nodeId);
  return nodeIds.filter((id) => depth.get(id) === target && rootOf.get(id) === root);
}

export interface Rect extends Point, Size {}

/** Start / middle / end of an axis: left-centre-right, or top-middle-bottom. */
export type Align = "start" | "center" | "end";

/**
 * The page the trees are drawn on, like Boardkit's board: the size of the
 * screen, and bigger (so it scrolls) only on an axis where the trees plus
 * `margin` on each side do not fit. `x`/`y` move the trees onto the page:
 * flush to the start / centred / flush to the end of each axis, `margin` in
 * from the edge. The trees are drawn at `zoom` (the zoom pill's choice,
 * never fitted automatically); the margin stays in screen pixels.
 */
export interface PagePlacement {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

export function placeOnPage(
  bounds: Rect,
  screen: Size,
  align: { x: Align; y: Align },
  margin: number,
  zoom = 1,
): PagePlacement {
  const axis = (start: number, size: number, room: number, a: Align) => {
    const page = Math.max(room, size * zoom + 2 * margin);
    const free = page - size * zoom - 2 * margin;
    return { page, offset: margin + (a === "start" ? 0 : a === "center" ? free / 2 : free) - start * zoom };
  };
  const x = axis(bounds.x, bounds.width, screen.width, align.x);
  const y = axis(bounds.y, bounds.height, screen.height, align.y);
  return { width: x.page, height: y.page, x: x.offset, y: y.offset };
}

/** The part of the page currently scrolled into view, in page pixels. */
export interface ScrollView {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The smallest scroll that brings `target` (in page pixels), plus `margin`
 * around it, into view. Stays put if it is already visible; a target bigger
 * than the view lines up with its start.
 */
export function scrollToReveal(target: Rect, view: ScrollView, margin: number): { left: number; top: number } {
  const axis = (start: number, size: number, scroll: number, room: number) => {
    const lo = start - margin;
    const hi = start + size + margin;
    if (hi - lo > room || lo < scroll) return Math.max(0, lo);
    if (hi > scroll + room) return hi - room;
    return scroll;
  };
  return {
    left: axis(target.x, target.width, view.left, view.width),
    top: axis(target.y, target.height, view.top, view.height),
  };
}
