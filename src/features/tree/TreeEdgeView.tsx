import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { memo, useCallback } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import type { EdgeRoute, Size } from "../../domain/layout";
import type { EdgeId } from "../../domain/types";
import { cutIdsOf, pathIdsOf, selectionOf, useTreeStore } from "../../store/treeStore";
import styles from "./TreeEdgeView.module.css";

export interface TreeEdgeData extends Record<string, unknown> {
  /** Where the edge bends and its label sits, from the layout. */
  readonly route: EdgeRoute;
  /** Reports the label's size (or `null` once it is gone) so the layout
      can make room for it. */
  readonly onLabelSize: (edgeId: EdgeId, size: Size | null) => void;
}

/** React Flow's edge record for a tree edge. Like nodes, the label itself
    is not copied in: the component reads it from the store by id. */
export type TreeFlowEdge = Edge<TreeEdgeData, "tree">;

/**
 * One parent -> child line, plus its label.
 *
 * The line is React Flow's "smooth step" path, but with the bend placed by
 * the layout (half a rank gap past the parent) instead of halfway between
 * the two nodes, so the stretch into the child is long enough to hold the
 * label. The label is HTML, rendered by React Flow's `EdgeLabelRenderer`
 * in a layer above the SVG edges, so it can hold a text field.
 *
 * A line into a cut node (or anywhere under one) is dashed and faded, like
 * the node.
 *
 * A line on the trail from the root to the selected node is drawn in a
 * lighter accent, like the nodes on it.
 *
 * Subscribes narrowly, like a node: only to its own label, whether it is
 * being edited, and whether the node it leads to is selected, on the
 * selected node's trail, or cut.
 */
export const TreeEdgeView = memo(function TreeEdgeView({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<TreeFlowEdge>) {
  const edgeId = id as EdgeId;
  const label = useTreeStore((s) => s.tree.edges[edgeId]?.label ?? "");
  const isEditing = useTreeStore((s) => s.editingEdgeId === edgeId);
  // Lit with its node, including when that node is part of a marquee group.
  const isTargetSelected = useTreeStore((s) => {
    const target = s.tree.edges[edgeId]?.target;
    return target !== undefined && selectionOf(s).includes(target);
  });
  // On the trail from the root to the selected node (its own line included).
  const onPath = useTreeStore((s) => {
    const target = s.tree.edges[edgeId]?.target;
    return target !== undefined && pathIdsOf(s).has(target);
  });
  const isCut = useTreeStore((s) => {
    const target = s.tree.edges[edgeId]?.target;
    return target !== undefined && cutIdsOf(s.tree).has(target);
  });
  const setEdgeLabel = useTreeStore((s) => s.setEdgeLabel);
  const startEditingLabel = useTreeStore((s) => s.startEditingLabel);
  const stopEditing = useTreeStore((s) => s.stopEditing);

  const vertical = sourcePosition === Position.Bottom;
  const bend = data?.route.bendAfterSource;
  const labelOffset = data?.route.labelBeforeTarget ?? 0;
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 10,
    ...(bend === undefined ? {} : vertical ? { centerY: sourceY + bend } : { centerX: sourceX + bend }),
  });
  const labelX = vertical ? targetX : targetX - labelOffset;
  const labelY = vertical ? targetY - labelOffset : targetY;

  const onLabelSize = data?.onLabelSize;
  // Measures the pill with a ResizeObserver while it is on screen. A ref
  // callback that returns a cleanup (React 19) pairs the start and stop in
  // one place. offsetWidth/Height are the unzoomed CSS size, which is what
  // the layout works in. Memoised: React re-runs a ref callback whenever it
  // is a new function, and here each run reports a size, which re-renders,
  // which would make a new function -- an endless loop.
  const measure = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el || !onLabelSize) return;
      const report = () => onLabelSize(edgeId, { width: el.offsetWidth, height: el.offsetHeight });
      const observer = new ResizeObserver(report);
      observer.observe(el);
      report();
      return () => {
        observer.disconnect();
        onLabelSize(edgeId, null);
      };
    },
    [edgeId, onLabelSize],
  );

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        className={[isCut && styles.cutPath, onPath && styles.trailPath].filter(Boolean).join(" ") || undefined}
      />
      {(label || isEditing) && (
        <EdgeLabelRenderer>
          <div
            ref={measure}
            className={`${styles.label} nodrag nopan`}
            data-selected={isTargetSelected || undefined}
            data-on-path={onPath || undefined}
            data-editing={isEditing || undefined}
            data-cut={isCut || undefined}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            onDoubleClick={() => startEditingLabel(edgeId)}
          >
            <InlineEditable
              value={label}
              editing={isEditing}
              onCommit={(text) => setEdgeLabel(edgeId, text)}
              onDone={stopEditing}
              placeholder="Label"
              ariaLabel="Edge label"
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
