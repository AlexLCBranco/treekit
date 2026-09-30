import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { memo, useEffect, type CSSProperties } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import type { NodeId } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import styles from "./TreeNodeView.module.css";

/** React Flow's node record for a tree node. The node's content is not
    copied in here: the component reads it from the store by id, so React
    Flow's node array only carries position and selection. */
export type TreeFlowNode = Node<Record<string, never>, "tree">;

/**
 * One node on the canvas: its title (inline-renamable) and a "+" button
 * that adds a child on the side the tree grows towards.
 *
 * Subscribes narrowly: only to its own node record, whether it is being
 * edited, and the tree's direction. Renaming one node re-renders that node
 * alone.
 */
export const TreeNodeView = memo(function TreeNodeView({ id, selected }: NodeProps<TreeFlowNode>) {
  const nodeId = id as NodeId;
  const node = useTreeStore((s) => s.tree.nodes[nodeId]);
  const isEditing = useTreeStore((s) => s.editingId === nodeId);
  const isRoot = useTreeStore((s) => s.tree.rootId === nodeId);
  const direction = useTreeStore((s) => s.tree.direction);
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
        className={`${styles.addChild} nodrag nopan`}
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
    </div>
  );
});
