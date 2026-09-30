import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { Trash2 } from "lucide-react";
import { memo, useEffect, type CSSProperties } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { hiddenCount, isRoot as isRootOf } from "../../domain/tree";
import type { NodeId } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import styles from "./TreeNodeView.module.css";

/** React Flow's node record for a tree node. The node's content is not
    copied in here: the component reads it from the store by id, so React
    Flow's node array only carries position and selection. */
export type TreeFlowNode = Node<Record<string, never>, "tree">;

/**
 * One node on the canvas: its title (inline-renamable), and on the side the
 * tree grows towards, a "+" that adds a child and (if it has children) a
 * button that folds the branch. A folded node shows how many nodes it hides.
 * On its top edge, a trash button deletes the branch (a root sends its whole
 * tree to the trash instead).
 *
 * Subscribes narrowly: only to its own node record, its child count,
 * whether it is being edited, and the tree's direction. Renaming one node
 * re-renders that node alone. (The hidden count is a number, so the
 * selector's result only "changes" when the count does.)
 */
export const TreeNodeView = memo(function TreeNodeView({ id, selected }: NodeProps<TreeFlowNode>) {
  const nodeId = id as NodeId;
  const node = useTreeStore((s) => s.tree.nodes[nodeId]);
  const isEditing = useTreeStore((s) => s.editingId === nodeId);
  const isRoot = useTreeStore((s) => isRootOf(s.tree, nodeId));
  // Every node can be deleted except the root of the board's last tree.
  const canDelete = useTreeStore((s) => !isRootOf(s.tree, nodeId) || s.tree.roots.length > 1);
  const deleteBranch = useTreeStore((s) => s.deleteBranch);
  const direction = useTreeStore((s) => s.tree.direction);
  const childCount = useTreeStore((s) => s.tree.childEdges[nodeId]?.length ?? 0);
  const hidden = useTreeStore((s) =>
    s.tree.nodes[nodeId]?.collapsed ? hiddenCount(s.tree, nodeId) : 0,
  );
  const toggleCollapsed = useTreeStore((s) => s.toggleCollapsed);
  const addChild = useTreeStore((s) => s.addChild);
  const renameNode = useTreeStore((s) => s.renameNode);
  const startEditing = useTreeStore((s) => s.startEditing);
  const stopEditing = useTreeStore((s) => s.stopEditing);

  // React Flow caches where each handle sits. Flipping the direction moves
  // the handles (top/bottom <-> left/right), so the cache must be refreshed
  // or edges keep attaching to the old sides.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => updateNodeInternals(id), [direction, id, updateNodeInternals]);

  if (!node) return null;

  const vertical = direction === "TB";
  const style = node.color
    ? ({ "--node-accent": `var(--palette-${node.color})` } as CSSProperties)
    : undefined;

  return (
    <div
      className={styles.node}
      data-selected={selected || undefined}
      data-root={isRoot || undefined}
      data-colored={node.color ? true : undefined}
      data-collapsed={node.collapsed || undefined}
      data-direction={direction}
      style={style}
      onDoubleClick={() => startEditing(nodeId)}
    >
      {/* Handles are where edges attach. Hidden: nodes are connected by the
          tree model, never by dragging a wire between handles. */}
      {!isRoot && (
        <Handle
          type="target"
          position={vertical ? Position.Top : Position.Left}
          className={styles.handle}
          isConnectable={false}
        />
      )}

      <InlineEditable
        value={node.title}
        editing={isEditing}
        onCommit={(title) => renameNode(nodeId, title)}
        onDone={stopEditing}
        placeholder="Untitled"
        ariaLabel="Node title"
        className={styles.title}
      />

      <Handle
        type="source"
        position={vertical ? Position.Bottom : Position.Right}
        className={styles.handle}
        isConnectable={false}
      />

      <button
        type="button"
        className={`${styles.nodeButton} ${styles.addChild} nodrag nopan`}
        onClick={(event) => {
          event.stopPropagation();
          addChild(nodeId);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        aria-label="Add child"
        title="Add child (Tab)"
      >
        +
      </button>

      {canDelete && (
        <button
          type="button"
          className={`${styles.nodeButton} ${styles.delete} nodrag nopan`}
          onClick={(event) => {
            event.stopPropagation();
            deleteBranch(nodeId);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={isRoot ? "Delete tree" : "Delete branch"}
          title={isRoot ? "Delete tree (Del)" : "Delete branch (Del)"}
        >
          <Trash2 size={12} />
        </button>
      )}

      {childCount > 0 && (
        <button
          type="button"
          className={`${styles.nodeButton} ${styles.collapse} nodrag nopan`}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(nodeId);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={node.collapsed ? `Expand branch (${hidden} hidden)` : "Collapse branch"}
          aria-expanded={!node.collapsed}
          title={node.collapsed ? `Expand: ${hidden} hidden (Space)` : "Collapse branch (Space)"}
        >
          {node.collapsed ? hidden : "−"}
        </button>
      )}
    </div>
  );
});
