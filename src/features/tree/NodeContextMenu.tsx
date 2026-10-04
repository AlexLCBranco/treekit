import { ChevronsDownUp, ChevronsUpDown, GitFork, NotebookPen, Trash2 } from "lucide-react";
import { useRef, useState, type MouseEvent, type ReactElement } from "react";
import { useShallow } from "zustand/react/shallow";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "../../components/ui/context-menu";
import { NODE_STATUSES, PALETTE_COLORS, type NodeId, type NodeStatus, type PaletteColor } from "../../domain/types";
import { selectionOf, useTreeStore } from "../../store/treeStore";
import { STATUS_META } from "./statusMeta";

const NONE = "none";

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The right-click menu for nodes: notes, fork, collapse/expand (for nodes
 * with children), the status and the colour palette.
 *
 * One menu wraps the whole canvas rather than one per node: on right-click
 * it looks up which node is under the pointer (React Flow puts the node's id
 * in `data-id`), so there is a single menu however big the tree grows.
 * Right-clicking empty canvas opens nothing. While a title or label is being
 * typed the menu stands aside, so the browser's own menu (paste, spelling)
 * still works in the field.
 *
 * `children` must be a single element: it becomes the trigger (`asChild`).
 */
export function NodeContextMenu({ children }: { readonly children: ReactElement }) {
  const [targetId, setTargetId] = useState<NodeId | null>(null);
  const isTyping = useTreeStore((s) => s.editingId !== null || s.editingEdgeId !== null);
  const select = useTreeStore((s) => s.select);
  // An action that puts focus in a text field (the notes, a fork's name)
  // waits until the menu has fully closed: while it animates out, the menu
  // still holds focus and would pull it straight back out of the field.
  const afterClose = useRef<(() => void) | null>(null);
  const runAfterClose = (action: () => void) => {
    afterClose.current = action;
  };

  function onContextMenu(event: MouseEvent) {
    const nodeEl = (event.target as HTMLElement).closest<HTMLElement>(".react-flow__node");
    const id = nodeEl?.dataset.id as NodeId | undefined;
    if (!id) {
      // Stops Radix opening the menu (it skips handlers after a
      // `preventDefault`); the browser's menu is suppressed too, as on
      // most canvas apps.
      event.preventDefault();
      return;
    }
    // Selected too, so it is obvious which node the menu is about. A node
    // already in a marquee group keeps the group (becoming its last pick),
    // so status and colour apply to all of it, as the keys do.
    const store = useTreeStore.getState();
    const group = selectionOf(store);
    if (group.length > 1 && group.includes(id)) store.selectMany([...group.filter((g) => g !== id), id]);
    else select(id);
    setTargetId(id);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={isTyping} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-60"
        // Let focus fall back to the page, not the canvas wrapper, so the
        // canvas keyboard shortcuts keep working after the menu closes.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const action = afterClose.current;
          afterClose.current = null;
          action?.();
        }}
      >
        {targetId && <NotesItem nodeId={targetId} runAfterClose={runAfterClose} />}
        {targetId && <ForkItem nodeId={targetId} runAfterClose={runAfterClose} />}
        {targetId && <CollapseItem nodeId={targetId} />}
        {targetId && <StatusItems nodeId={targetId} />}
        {targetId && <ColorItems nodeId={targetId} />}
        <DeleteGroupItem />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** "Notes…": opens the notes panel on this node. */
type ItemProps = {
  readonly nodeId: NodeId;
  readonly runAfterClose: (action: () => void) => void;
};

function NotesItem({ nodeId, runAfterClose }: ItemProps) {
  const openNotes = useTreeStore((s) => s.openNotes);
  return (
    <ContextMenuItem onSelect={() => runAfterClose(() => openNotes(nodeId))}>
      <NotebookPen aria-hidden />
      Notes…
      <ContextMenuShortcut>N</ContextMenuShortcut>
    </ContextMenuItem>
  );
}

/** "Fork branch to new tree": copies it into a new tree beside this one. */
function ForkItem({ nodeId, runAfterClose }: ItemProps) {
  const forkBranch = useTreeStore((s) => s.forkBranch);
  return (
    <ContextMenuItem onSelect={() => runAfterClose(() => forkBranch(nodeId))}>
      <GitFork aria-hidden />
      Fork branch to new tree
      <ContextMenuShortcut>F</ContextMenuShortcut>
    </ContextMenuItem>
  );
}

/** "Collapse/Expand branch", with a separator under it. Absent when there
    is nothing to fold. With a marquee group, folds all of it (or unfolds
    it if all of it already is), like Space. */
function CollapseItem({ nodeId }: { readonly nodeId: NodeId }) {
  const { foldable, folded, many } = useTreeStore(
    useShallow((s) => {
      const group = selectionOf(s);
      const ids = group.length > 1 && group.includes(nodeId) ? group : [nodeId];
      const withChildren = ids.filter((id) => (s.tree.childEdges[id]?.length ?? 0) > 0);
      return {
        foldable: withChildren.length,
        folded: withChildren.length > 0 && withChildren.every((id) => s.tree.nodes[id].collapsed),
        many: ids.length > 1,
      };
    }),
  );
  const toggleCollapsed = useTreeStore((s) => s.toggleCollapsed);
  const toggleCollapsedNodes = useTreeStore((s) => s.toggleCollapsedNodes);
  if (foldable === 0) return null;
  const noun = many ? "branches" : "branch";

  return (
    <>
      <ContextMenuItem
        onSelect={() => (many ? toggleCollapsedNodes(selectionOf(useTreeStore.getState())) : toggleCollapsed(nodeId))}
      >
        {folded ? <ChevronsUpDown aria-hidden /> : <ChevronsDownUp aria-hidden />}
        {folded ? `Expand ${noun}` : `Collapse ${noun}`}
        <ContextMenuShortcut>Space</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}

/** Keep / maybe / cut as radio items, with a separator under them. Shows
    this node's status; sets it on the whole selection (one undo step). */
function StatusItems({ nodeId }: { readonly nodeId: NodeId }) {
  const status = useTreeStore((s) => s.tree.nodes[nodeId]?.status ?? null);
  const setNodesStatus = useTreeStore((s) => s.setNodesStatus);

  return (
    <>
      <ContextMenuLabel>Status</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={status ?? NONE}
        onValueChange={(value) =>
          setNodesStatus(selectionOf(useTreeStore.getState()), value === NONE ? null : (value as NodeStatus))
        }
      >
        <ContextMenuRadioItem value={NONE}>None</ContextMenuRadioItem>
        {NODE_STATUSES.map((option) => {
          const { label, icon: Icon } = STATUS_META[option];
          return (
            <ContextMenuRadioItem key={option} value={option}>
              <Icon aria-hidden />
              {label}
              {option === "cut" && <ContextMenuShortcut>X</ContextMenuShortcut>}
            </ContextMenuRadioItem>
          );
        })}
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
    </>
  );
}

/** The palette as radio items. Shows this node's colour; sets it on the
    whole selection (one undo step), like the 1-8 keys. */
function ColorItems({ nodeId }: { readonly nodeId: NodeId }) {
  const color = useTreeStore((s) => s.tree.nodes[nodeId]?.color ?? null);
  const setNodesColor = useTreeStore((s) => s.setNodesColor);

  return (
    <>
      <ContextMenuLabel>Colour</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={color ?? NONE}
        onValueChange={(value) =>
          setNodesColor(selectionOf(useTreeStore.getState()), value === NONE ? null : (value as PaletteColor))
        }
      >
        <ContextMenuRadioItem value={NONE}>
          <span className="size-3 rounded-full border border-border" aria-hidden />
          None
          <ContextMenuShortcut>0</ContextMenuShortcut>
        </ContextMenuRadioItem>
        {PALETTE_COLORS.map((swatch, index) => (
          <ContextMenuRadioItem key={swatch} value={swatch}>
            <span
              className="size-3 rounded-full"
              style={{ background: `var(--palette-${swatch})` }}
              aria-hidden
            />
            {capitalise(swatch)}
            <ContextMenuShortcut>{index + 1}</ContextMenuShortcut>
          </ContextMenuRadioItem>
        ))}
      </ContextMenuRadioGroup>
    </>
  );
}

/** "Delete N branches", at the bottom, only for a marquee group: one node
    is deleted from its hover toolbar or with Del, but a group has no
    toolbar of its own on the node. */
function DeleteGroupItem() {
  const count = useTreeStore((s) => selectionOf(s).length);
  const deleteBranches = useTreeStore((s) => s.deleteBranches);
  if (count < 2) return null;

  return (
    <>
      <ContextMenuSeparator />
      <ContextMenuItem variant="destructive" onSelect={() => deleteBranches(selectionOf(useTreeStore.getState()))}>
        <Trash2 aria-hidden />
        Delete {count} branches
        <ContextMenuShortcut>Del</ContextMenuShortcut>
      </ContextMenuItem>
    </>
  );
}
