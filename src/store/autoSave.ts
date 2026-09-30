import { flushSave, scheduleSave } from "./saveQueue";
import { useTreeStore } from "./treeStore";

/**
 * Saves the open tree shortly after every change. Called once from
 * `main.tsx`.
 *
 * Only content changes trigger a save: selection, editing state and undo
 * history live in the same store but are session-only. A tree switch also
 * changes `tree`, but the switch has already flushed and the new tree is
 * as saved, so that is skipped too (it would only rewrite the same data).
 */
export function initAutoSave(): void {
  useTreeStore.subscribe((state, prev) => {
    if (state.treeId !== prev.treeId) return;
    if (state.tree === prev.tree && state.name === prev.name) return;
    // The doc is read when the save runs, not now, so one write covers a
    // whole burst of edits.
    scheduleSave(() => {
      const { treeId, name, tree } = useTreeStore.getState();
      return { id: treeId, name, state: tree };
    });
  });

  // A pending save must not be lost when the tab closes or is hidden (on
  // mobile, hidden is often the last event a page ever gets).
  window.addEventListener("pagehide", flushSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}
