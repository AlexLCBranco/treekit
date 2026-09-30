import { ChevronsDownUp, ChevronsUpDown, NotebookPen } from "lucide-react";
import { useState, type MouseEvent, type ReactElement } from "react";

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
import { PALETTE_COLORS, type NodeId, type PaletteColor } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";

const NONE = "none";

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * The right-click menu for nodes: notes, collapse/expand (for nodes with
 * children) and the colour palette.
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
    // Selected too, so it is obvious which node the menu is about.
    select(id);
    setTargetId(id);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={isTyping} onContextMenu={onContextMenu}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        className="w-52"
        // Let focus fall back to the page, not the canvas wrapper, so the
        // canvas keyboard shortcuts keep working after the menu closes.
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {targetId && <NotesItem nodeId={targetId} />}
        {targetId && <CollapseItem nodeId={targetId} />}
        {targetId && <ColorItems nodeId={targetId} />}
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** "Notes…": opens the notes panel on this node. */
function NotesItem({ nodeId }: { readonly nodeId: NodeId }) {
  const openNotes = useTreeStore((s) => s.openNotes);
  return (
    <ContextMenuItem onSelect={() => openNotes(nodeId)}>
      <NotebookPen aria-hidden />
      Notes…
      <ContextMenuShortcut>N</ContextMenuShortcut>
    </ContextMenuItem>
  );
}

/** "Collapse/Expand branch", with a separator under it. Absent for a leaf,
    which has nothing to fold. */
function CollapseItem({ nodeId }: { readonly nodeId: NodeId }) {
  const hasChildren = useTreeStore((s) => (s.tree.childEdges[nodeId]?.length ?? 0) > 0);
  const collapsed = useTreeStore((s) => s.tree.nodes[nodeId]?.collapsed ?? false);
  const toggleCollapsed = useTreeStore((s) => s.toggleCollapsed);
  if (!hasChildren) return null;

  return (
    <>
      <ContextMenuItem onSelect={() => toggleCollapsed(nodeId)}>
        {collapsed ? <ChevronsUpDown aria-hidden /> : <ChevronsDownUp aria-hidden />}
        {collapsed ? "Expand branch" : "Collapse branch"}
        <ContextMenuShortcut>Space</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuSeparator />
    </>
  );
}

/** The palette as radio items. Reads only this node's colour. */
function ColorItems({ nodeId }: { readonly nodeId: NodeId }) {
  const color = useTreeStore((s) => s.tree.nodes[nodeId]?.color ?? null);
  const setNodeColor = useTreeStore((s) => s.setNodeColor);

  return (
    <>
      <ContextMenuLabel>Colour</ContextMenuLabel>
      <ContextMenuRadioGroup
        value={color ?? NONE}
        onValueChange={(value) =>
          setNodeColor(nodeId, value === NONE ? null : (value as PaletteColor))
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
