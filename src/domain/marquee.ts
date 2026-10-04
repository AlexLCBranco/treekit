/**
 * What the marquee (the box dragged on empty page) picks. Pure geometry in
 * flow coordinates, so it can be tested without React Flow.
 *
 * A node is picked when the box holds all of it (React Flow's "full"
 * selection mode). An edge label belongs to the node it leads to, so a box
 * holding the label picks that node too, even if the node itself is
 * outside the box.
 */
import type { Size } from "./layout";
import type { Rect } from "./navigation";
import type { LayoutDirection, NodeId } from "./types";

/** Whether `outer` holds all of `inner` (touching edges count). */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Where an edge label sits: centred on the line into its node, `before`
 * (the layout's `labelBeforeTarget`) back from the node's near side -- its
 * top when the tree grows down, its left when it grows right. Mirrors how
 * TreeEdgeView places the pill.
 */
export function labelRect(node: Rect, label: Size, before: number, direction: LayoutDirection): Rect {
  const cx = direction === "TB" ? node.x + node.width / 2 : node.x - before;
  const cy = direction === "TB" ? node.y - before : node.y + node.height / 2;
  return { x: cx - label.width / 2, y: cy - label.height / 2, width: label.width, height: label.height };
}

/**
 * The group after the box moved, given every node it now picks. Nodes
 * already in the group keep their place and new ones join at the end, so
 * the last one picked stays last (the group's primary node, which arrows
 * and rename act on).
 */
export function marqueeGroup(previous: readonly NodeId[], picked: ReadonlySet<NodeId>): NodeId[] {
  const kept = previous.filter((id) => picked.has(id));
  const added = [...picked].filter((id) => !kept.includes(id));
  return [...kept, ...added];
}
