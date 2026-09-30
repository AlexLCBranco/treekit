import { ChevronDown } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { InlineEditable } from "../../components/InlineEditable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useTreeStore } from "../../store/treeStore";
import styles from "./TreeSwitcher.module.css";

/**
 * The open tree's name (click to rename) plus a menu to switch to another
 * saved tree, start a new one, duplicate or delete this one. Modelled on
 * Boardkit's `BoardSwitcher`.
 *
 * The menu and the confirm dialog are shadcn/ui: supporting chrome, not the
 * canvas, which is where CLAUDE.md draws the line. Their colours still come
 * from tokens.css through the bridge in global.css.
 */
export function TreeSwitcher() {
  const treeId = useTreeStore((s) => s.treeId);
  const name = useTreeStore((s) => s.name);
  const trees = useTreeStore((s) => s.trees);
  const renameTree = useTreeStore((s) => s.renameTree);
  const switchTree = useTreeStore((s) => s.switchTree);
  const newTree = useTreeStore((s) => s.newTree);
  const duplicateTree = useTreeStore((s) => s.duplicateTree);
  const deleteTree = useTreeStore((s) => s.deleteTree);

  const [renaming, setRenaming] = useState(false);
  // Set by "New tree", read as the menu closes (see `onCloseAutoFocus`).
  const focusNameAfterClose = useRef(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Stored oldest-first; listed newest-first, so the latest experiment is
  // always at the top however many have piled up.
  const newestFirst = useMemo(() => [...trees].reverse(), [trees]);

  return (
    <div className={styles.switcher}>
      {renaming ? (
        <InlineEditable
          value={name}
          editing
          // A tree always needs a name for the list; an emptied field keeps
          // the old one.
          onCommit={(value) => value && renameTree(value)}
          onDone={() => setRenaming(false)}
          ariaLabel="Tree name"
          className={styles.name}
        />
      ) : (
        <button
          type="button"
          className={styles.name}
          onClick={() => setRenaming(true)}
          title="Rename tree"
        >
          {name}
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.trigger} aria-label="Switch tree">
            <ChevronDown size={14} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-56"
          // After "New tree", the name field opens only once the menu has
          // fully closed. Opened any earlier, the menu (which keeps focus
          // inside itself while open) pulls focus straight back, and the
          // typed name goes to the menu instead. Focus would also normally
          // return to the trigger here, so that is skipped.
          onCloseAutoFocus={(event) => {
            if (!focusNameAfterClose.current) return;
            focusNameAfterClose.current = false;
            event.preventDefault();
            setRenaming(true);
          }}
        >
          {newestFirst.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => switchTree(t.id)}>
              <span className={styles.check}>{t.id === treeId ? "✓" : ""}</span>
              {t.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              newTree("Untitled tree");
              // Straight into naming it, like a new node.
              focusNameAfterClose.current = true;
            }}
          >
            + New tree
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicateTree(`${name} (copy)`)}>
            Duplicate this tree
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={trees.length <= 1}
            onSelect={() => setConfirmingDelete(true)}
          >
            Delete this tree…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The whole tree is deleted for good. This can’t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => deleteTree(treeId)}>
              Delete tree
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
