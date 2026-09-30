import { RotateCcw, Trash2, X } from "lucide-react";
import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/ui/dialog";
import { subtreeIds } from "../../domain/tree";
import type { NodeId } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import styles from "./TrashPanel.module.css";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "2 minutes ago", "yesterday": the largest unit that is at least one. */
function ago(timestamp: number): string {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return relative.format(0, "second");
}

/**
 * Where a deleted tree goes instead of vanishing (like Boardkit's trash):
 * a small header button that opens a list to restore from, delete for good,
 * or empty. Chrome around the canvas, so Tailwind + shadcn/ui dialog; the
 * button itself is a CSS Module like the other header buttons.
 *
 * Reads only the trash list; each row reads its own tree's title and size.
 */
export function TrashPanel() {
  const trash = useTreeStore((s) => s.tree.trash);
  const emptyTrash = useTreeStore((s) => s.emptyTrash);
  // Closing the dialog before restoring puts focus back on the canvas.
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label="Recently deleted trees"
          title="Recently deleted"
        >
          <Trash2 size={16} />
          {trash.length > 0 && <span className={styles.count}>{trash.length}</span>}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recently deleted</DialogTitle>
          <DialogDescription>
            Deleted trees wait here until you restore them or delete them for good.
          </DialogDescription>
        </DialogHeader>
        {trash.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">Nothing here.</p>
        ) : (
          <>
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
              {[...trash].reverse().map((entry) => (
                <TrashRow
                  key={entry.rootId}
                  rootId={entry.rootId}
                  deletedAt={entry.deletedAt}
                  onRestored={() => setOpen(false)}
                />
              ))}
            </ul>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={emptyTrash}>
                Empty trash
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TrashRow({
  rootId,
  deletedAt,
  onRestored,
}: {
  readonly rootId: NodeId;
  readonly deletedAt: number;
  readonly onRestored: () => void;
}) {
  const title = useTreeStore((s) => s.tree.nodes[rootId]?.title ?? "");
  // A number, so the selector only "changes" when the size does.
  const size = useTreeStore((s) => subtreeIds(s.tree, rootId).length);
  const restoreTree = useTreeStore((s) => s.restoreTree);
  const purgeTrashedTree = useTreeStore((s) => s.purgeTrashedTree);

  return (
    <li className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{title.split("\n")[0] || "Untitled"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {size} node{size === 1 ? "" : "s"} · {ago(deletedAt)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Restore tree"
        title="Restore"
        onClick={() => {
          restoreTree(rootId);
          onRestored();
        }}
      >
        <RotateCcw />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete tree for good"
        title="Delete for good"
        onClick={() => purgeTrashedTree(rootId)}
      >
        <X />
      </Button>
    </li>
  );
}
