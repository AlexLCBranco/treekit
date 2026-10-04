/**
 * Where a dragged branch would land. Pure geometry in flow coordinates
 * (like the marquee), so it can be tested without React Flow.
 *
 * With "breadth" = the axis siblings spread along (x top-down, y
 * left-right), a pointer over a node means:
 *  - its middle half: become that node's last child;
 *  - its first or last quarter along the breadth: become its sibling,
 *    just before or after it.
 * A pointer in the gap beside a node (in line with it, within `reach`)
 * also means "sibling before/after", so the gaps between siblings are
 * targets too. A root has no siblings: anywhere on it means "child".
 */
import type { Point } from "./layout";
import type { Rect } from "./navigation";
import { isRoot, moveBranch, parentEdgeOf, subtreeIds } from "./tree";
import type { NodeId, TreeState } from "./types";

export type DropSpot =
  | { readonly kind: "child"; readonly nodeId: NodeId }
  | { readonly kind: "before" | "after"; readonly nodeId: NodeId };

/** Where in the tree a drop puts the branch: as `moveBranch` takes it. */
export interface DropPlacement {
  readonly parentId: NodeId;
  /** Among the parent's other children. */
  readonly index: number;
}

/** The share of a node's breadth, at each end, that means "sibling". */
const SIBLING_EDGE = 0.25;

/**
 * The spot under `point` while `draggedId` is dragged, or `null` (nowhere:
 * dropping there puts the branch back). Nodes inside the dragged branch are
 * never targets. `rects` are where the layout puts each visible node.
 */
export function dropSpotAt(
  state: TreeState,
  draggedId: NodeId,
  point: Point,
  rects: ReadonlyMap<NodeId, Rect>,
  reach: number,
): DropSpot | null {
  const dragged = new Set(subtreeIds(state, draggedId));
  const vertical = state.direction === "TB";
  const breadth = (p: Point) => (vertical ? p.x : p.y);
  const depth = (p: Point) => (vertical ? p.y : p.x);
  const span = (r: Rect) => (vertical ? r.width : r.height);
  const thickness = (r: Rect) => (vertical ? r.height : r.width);

  let beside: { spot: DropSpot; distance: number } | null = null;
  for (const [id, rect] of rects) {
    if (dragged.has(id)) continue;
    const root = isRoot(state, id);
    const along = breadth(point) - breadth(rect);
    const across = depth(point) - depth(rect);
    if (across < 0 || across > thickness(rect)) continue;
    const t = along / span(rect);
    if (t >= 0 && t <= 1) {
      if (root || (t >= SIBLING_EDGE && t <= 1 - SIBLING_EDGE)) return { kind: "child", nodeId: id };
      return { kind: t < 0.5 ? "before" : "after", nodeId: id };
    }
    if (root) continue;
    const distance = t < 0 ? -along : along - span(rect);
    if (distance <= reach && (!beside || distance < beside.distance)) {
      beside = { spot: { kind: t < 0 ? "before" : "after", nodeId: id }, distance };
    }
  }
  return beside?.spot ?? null;
}

/**
 * What dropping on `spot` does to the tree, or `null` if nothing would
 * change (the branch's own place) or it is not allowed.
 */
export function dropPlacement(state: TreeState, draggedId: NodeId, spot: DropSpot): DropPlacement | null {
  const incoming = parentEdgeOf(state, draggedId);
  if (!incoming) return null;
  let placement: DropPlacement;
  if (spot.kind === "child") {
    const others = (state.childEdges[spot.nodeId] ?? []).filter((e) => e !== incoming.id);
    placement = { parentId: spot.nodeId, index: others.length };
  } else {
    const edge = parentEdgeOf(state, spot.nodeId);
    if (!edge) return null;
    const others = state.childEdges[edge.source].filter((e) => e !== incoming.id);
    const at = others.indexOf(edge.id);
    placement = { parentId: edge.source, index: spot.kind === "before" ? at : at + 1 };
  }
  const moved = moveBranch(state, draggedId, placement.parentId, placement.index);
  return moved === state ? null : placement;
}
