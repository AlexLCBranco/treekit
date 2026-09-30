import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../components/ui/sheet";
import { useTreeStore } from "../../store/treeStore";
import styles from "./NotesPanel.module.css";

/**
 * The notes side panel: the selected node's title and a textarea with its
 * notes. Every keystroke saves; the store folds one panel session into one
 * undo step (see `setNotes`).
 *
 * Non-modal (no overlay, page stays usable) because the panel follows the
 * selection: clicking another node, or walking to it with the arrows,
 * switches the panel to that node. Clicking anywhere else outside it, or
 * Esc, closes it. It sits in a layer over the canvas only, so the header
 * stays reachable while it is open.
 */
export function NotesPanel() {
  const isOpen = useTreeStore((s) => s.notesOpen && s.selectedId !== null);
  const nodeId = useTreeStore((s) => s.selectedId);
  const title = useTreeStore((s) => (s.selectedId ? s.tree.nodes[s.selectedId]?.title : undefined));
  const notes = useTreeStore((s) => (s.selectedId ? (s.tree.nodes[s.selectedId]?.notes ?? "") : ""));
  const setNotes = useTreeStore((s) => s.setNotes);
  const closeNotes = useTreeStore((s) => s.closeNotes);
  // The layer the sheet portals into; a state (not a ref) so the sheet
  // renders again once it exists.
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);

  return (
    <div ref={setLayer} className={styles.layer}>
      {layer && (
        <Sheet open={isOpen} onOpenChange={(open) => !open && closeNotes()} modal={false}>
          <SheetContent
            container={layer}
            overlay={false}
            className="absolute pointer-events-auto gap-0"
            // Clicking a node is not "outside": it selects that node, and
            // the panel switches to it.
            onInteractOutside={(event) => {
              const target = event.target as HTMLElement | null;
              if (target?.closest(".react-flow__node")) event.preventDefault();
            }}
            // Esc only closes the panel: stopped here so the canvas does not
            // also treat it as "clear the selection".
            onEscapeKeyDown={(event) => event.stopPropagation()}
            // Back to the page, so canvas shortcuts work straight away.
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader className="pr-10">
              <SheetTitle className="break-words">{title || "Untitled"}</SheetTitle>
              <SheetDescription>Notes save as you type.</SheetDescription>
            </SheetHeader>
            {nodeId && (
              <textarea
                // Remounts per node, so the caret and the textarea's own
                // undo never carry over from another node's notes.
                key={nodeId}
                className={styles.textarea}
                value={notes}
                onChange={(event) => setNotes(nodeId, event.target.value)}
                placeholder="Write notes for this node…"
                aria-label="Notes"
                spellCheck
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
