import type { Point, Size } from "./layout";
import { childrenOf, parentEdgeOf, visibleSubtree } from "./tree";
import type { LayoutDirection, NodeId, TreeState } from "./types";

/**
 * Keyboard navigation and "keep the selection in view". Pure: no React,
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
 * The node a move lands on, or `null` if there is nowhere to go (the root
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
 * The visible nodes in the same generation as `nodeId`, in drawing order.
 * `visibleSubtree` lists nodes depth-first in sibling order, which puts
 * each generation left-to-right (top-to-bottom in left-right trees).
 */
function rowOf(state: TreeState, nodeId: NodeId): NodeId[] {
  const depth = new Map<NodeId, number>([[state.rootId, 0]]);
  const { nodeIds } = visibleSubtree(state);
  for (const id of nodeIds) {
    for (const child of childrenOf(state, id)) depth.set(child, depth.get(id)! + 1);
  }
  const target = depth.get(nodeId);
  return nodeIds.filter((id) => depth.get(id) === target);
}

/** The camera, as React Flow describes it: screen = flow * zoom + (x, y). */
export interface Viewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/**
 * The smallest camera move that brings a node fully on screen with
 * `margin` screen pixels to spare, or `null` if it already is. Moving only
 * as far as needed (rather than centring) keeps the view calm while you
 * walk around a tree that already fits.
 *
 * A node too big for the screen is aligned by its start (top / left), so
 * its title stays readable.
 */
export function revealViewport(
  viewport: Viewport,
  screen: Size,
  position: Point,
  size: Size,
  margin: number,
): Viewport | null {
  const shift = (start: number, length: number, screenLength: number) => {
    const low = margin - start;
    const high = screenLength - margin - (start + length);
    if (low > 0) return low; // off the start: move right / down
    if (high < 0) return Math.max(high, low); // off the end, but never past the start
    return 0;
  };
  const { zoom } = viewport;
  const dx = shift(position.x * zoom + viewport.x, size.width * zoom, screen.width);
  const dy = shift(position.y * zoom + viewport.y, size.height * zoom, screen.height);
  return dx === 0 && dy === 0 ? null : { x: viewport.x + dx, y: viewport.y + dy, zoom };
}

export interface Rect extends Point, Size {}

/** Start / middle / end of an axis: left-centre-right, or top-middle-bottom. */
export type Align = "start" | "center" | "end";

/**
 * The camera that puts a rectangle (the whole tree) against the page:
 * flush to the left / centred / flush to the right, and independently to the
 * top / middle / bottom, always `margin` pixels in from the edge. Zooms out
 * (never in past `maxZoom`) only as far as needed for it all to fit.
 */
export function alignViewport(
  bounds: Rect,
  screen: Size,
  align: { x: Align; y: Align },
  margin: number,
  maxZoom: number,
): Viewport {
  const fit = Math.min((screen.width - 2 * margin) / bounds.width, (screen.height - 2 * margin) / bounds.height);
  const zoom = Math.max(0.01, Math.min(maxZoom, fit));
  const place = (start: number, size: number, room: number, a: Align) => {
    const free = room - size * zoom - 2 * margin;
    return margin + (a === "start" ? 0 : a === "center" ? free / 2 : free) - start * zoom;
  };
  return {
    x: place(bounds.x, bounds.width, screen.width, align.x),
    y: place(bounds.y, bounds.height, screen.height, align.y),
    zoom,
  };
}
