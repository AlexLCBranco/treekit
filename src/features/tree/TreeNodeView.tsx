import { Handle, Position, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { ChevronsDownUp, ChevronsUpDown, NotebookPen, StickyNote, Trash2 } from "lucide-react";
import { memo, useEffect, type CSSProperties } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import { hiddenCount, isRoot as isRootOf, visibleChildren } from "../../domain/tree";
import type { NodeId } from "../../domain/types";
import { cutIdsOf, pathIdsOf, useTreeStore } from "../../store/treeStore";
import { STATUS_META } from "./statusMeta";
import styles from "./TreeNodeView.module.css";

/** React Flow's node record for a tree node. The node's content is not
    copied in here: the component reads it from the store by id, so React
    Flow's node array only carries position, selection and drag state
    (`lifted`: part of the branch being dragged; `dropTarget`: that
    branch would drop into this node). */
export type TreeFlowNode = Node<{ readonly lifted?: boolean; readonly dropTarget?: boolean }, "tree">;

/**
 * One node on the canvas: its title (inline-renamable), a "+" on the side
 * the tree grows towards, and on hover a toolbar above it that opens the
 * notes, folds the branch and deletes it (a root sends its whole tree to
 * the trash instead). A folded node shows how many nodes it hides; a node
 * with notes shows an icon, and their first lines on hover. A status
 * shows as a badge on the other corner; a cut node, and everything under
 * it, is greyed out.
 *
 * The nodes on the way from the root to the selected one get a lighter
 * ring, so the trail that led there stands out.
 *
 * Subscribes narrowly: only to its own node record, its child count,
 * whether it is being edited, looks cut or is on the selected node's
 * trail, and the tree's direction. Renaming one node
 * re-renders that node alone. (The hidden count is a number, so the
 * selector's result only "changes" when the count does.)
 */
export const TreeNodeView = memo(function TreeNodeView({ id, selected, dragging, data }: NodeProps<TreeFlowNode>) {
  const nodeId = id as NodeId;
  const node = useTreeStore((s) => s.tree.nodes[nodeId]);
  const isEditing = useTreeStore((s) => s.editingId === nodeId);
  const isRoot = useTreeStore((s) => isRootOf(s.tree, nodeId));
  // Every node can be deleted except the root of the board's last tree.
  const canDelete = useTreeStore((s) => !isRootOf(s.tree, nodeId) || s.tree.roots.length > 1);
  const deleteBranch = useTreeStore((s) => s.deleteBranch);
  const direction = useTreeStore((s) => s.tree.direction);
  // Hidden cut children don't count: there is nothing to fold if all are.
  const childCount = useTreeStore((s) => visibleChildren(s.tree, nodeId).length);
  const isCut = useTreeStore((s) => cutIdsOf(s.tree).has(nodeId));
  // On the trail from the root to the selected node (the selected node
  // itself shows the full selection ring instead).
  const onPath = useTreeStore((s) => s.selectedId !== nodeId && pathIdsOf(s).has(nodeId));
  // Part of a marquee group (see `selectionOf`): its toolbar stays hidden.
  const inGroup = useTreeStore(
    (s) =>
      s.selectedIds.length > 1 &&
      s.selectedId !== null &&
      s.selectedIds.includes(s.selectedId) &&
      s.selectedIds.includes(nodeId),
  );
  const hidden = useTreeStore((s) =>
    s.tree.nodes[nodeId]?.collapsed ? hiddenCount(s.tree, nodeId) : 0,
  );
  const toggleCollapsed = useTreeStore((s) => s.toggleCollapsed);
  const openNotes = useTreeStore((s) => s.openNotes);
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
      data-grouped={inGroup || undefined}
      data-on-path={onPath || undefined}
      data-root={isRoot || undefined}
      data-colored={node.color ? true : undefined}
      data-collapsed={node.collapsed || undefined}
      data-notes={node.notes ? true : undefined}
      data-cut={isCut || undefined}
      data-direction={direction}
      data-dragging={dragging || undefined}
      data-lifted={data.lifted || undefined}
      data-drop-target={data.dropTarget || undefined}
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

      {/* A folded node keeps a badge beside "+" with how many nodes it
          hides, visible without hovering; clicking it expands. */}
      {node.collapsed && (
        <button
          type="button"
          className={`${styles.nodeButton} ${styles.collapse} nodrag nopan`}
          onClick={(event) => {
            event.stopPropagation();
            toggleCollapsed(nodeId);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          aria-label={`Expand branch (${hidden} hidden)`}
          title={`Expand: ${hidden} hidden (Space)`}
        >
          {hidden}
        </button>
      )}

      {/* Notes: a small icon in the corner says there are some; hovering
          shows their first lines. Both float, so notes never resize the node. */}
      {node.status && <StatusBadge status={node.status} />}
      {node.notes && (
        <>
          <span className={`${styles.badge} ${styles.notesIcon}`} aria-label="Has notes" role="img">
            <StickyNote size={10} aria-hidden />
          </span>
          <div className={styles.notesPreview} aria-hidden>
            <p className={styles.notesPreviewText}>{node.notes}</p>
          </div>
        </>
      )}

      {/* The hover toolbar: a pill floating above the node, like Boardkit's
          card actions, so its buttons never crowd the node's edges. */}
      <div
        className={`${styles.toolbar} nodrag nopan`}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.toolbarButton}
          onClick={(event) => {
            event.stopPropagation();
            openNotes(nodeId);
          }}
          aria-label="Notes"
          title="Notes (N)"
        >
          <NotebookPen size={14} />
        </button>
        {childCount > 0 && (
          <button
            type="button"
            className={styles.toolbarButton}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsed(nodeId);
            }}
            aria-label={node.collapsed ? "Expand branch" : "Collapse branch"}
            aria-expanded={!node.collapsed}
            title={node.collapsed ? "Expand branch (Space)" : "Collapse branch (Space)"}
          >
            {node.collapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={`${styles.toolbarButton} ${styles.delete}`}
            onClick={(event) => {
              event.stopPropagation();
              deleteBranch(nodeId);
            }}
            aria-label={isRoot ? "Delete tree" : "Delete branch"}
            title={isRoot ? "Delete tree (Del)" : "Delete branch (Del)"}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
});

/** The status marker on the node's top-left corner: neutral, so it never
    competes with a colour tint. */
function StatusBadge({ status }: { readonly status: keyof typeof STATUS_META }) {
  const { label, icon: Icon } = STATUS_META[status];
  return (
    <span
      className={`${styles.badge} ${styles.statusBadge}`}
      data-status={status}
      role="img"
      aria-label={label}
      title={label}
    >
      <Icon size={10} strokeWidth={2.5} aria-hidden />
    </span>
  );
}
