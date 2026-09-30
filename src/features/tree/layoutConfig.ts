import type { LayoutOptions } from "../../domain/layout";

/**
 * Layout numbers dagre needs as plain JS values. The fallback size roughly
 * matches a one-line node at `--node-min-width`; it is only used for the one
 * frame before React Flow has measured a new node.
 */
export const TREE_LAYOUT: LayoutOptions = {
  nodeGap: 32,
  rankGap: 64,
  /** Between the trees of one board. */
  treeGap: 96,
  fallbackSize: { width: 120, height: 44 },
};

/** How long a node glides to its new place after the layout changes. */
export const LAYOUT_TWEEN_MS = 220;

/** Same length as the glide, so camera and nodes arrive together. */
export const FRAME_PAN_MS = LAYOUT_TWEEN_MS;

/** Distance (screen pixels) between the tree and the page edge it is aligned
    to. Sides and bottom leave room for the zoom pill, cursor tools and
    version badge; the header sits above the page, so the top needs less. */
export const FRAME_MARGIN = 72;
export const FRAME_MARGINS = { top: 32, right: FRAME_MARGIN, bottom: FRAME_MARGIN, left: FRAME_MARGIN };
