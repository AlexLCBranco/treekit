import type { LayoutOptions } from "../../domain/layout";

/**
 * Layout numbers dagre needs as plain JS values. The fallback size roughly
 * matches a one-line node at `--node-min-width`; it is only used for the one
 * frame before React Flow has measured a new node.
 */
export const TREE_LAYOUT: LayoutOptions = {
  nodeGap: 32,
  rankGap: 64,
  fallbackSize: { width: 120, height: 44 },
};

/** How long a node glides to its new place after the layout changes. */
export const LAYOUT_TWEEN_MS = 220;

/** When the selection lands off-screen (or this close to an edge, in
    screen pixels), the camera pans just far enough to show it. Leaves
    room for the zoom controls and version badge in the corners. */
export const REVEAL_MARGIN = 56;
/** Same length as the glide, so camera and node arrive together. */
export const REVEAL_PAN_MS = LAYOUT_TWEEN_MS;
