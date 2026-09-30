import { saveTree } from "./persistTree";
import { useTreeStore } from "./treeStore";

/** Long enough to batch a burst of edits into one write, short enough that
    closing the tab right after an edit loses nothing (and `pagehide`
    flushes anyway). */
const SAVE_DELAY_MS = 400;

/**
 * Saves the tree shortly after every change. Called once from `main.tsx`.
 *
 * Only content changes trigger a save: selection, editing state and undo
 * history live in the same store but are session-only, and comparing the
 * `tree` reference (which only changes on a real edit) filters them out for
 * free.
 */
export function initAutoSave(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    const { treeId, name, tree } = useTreeStore.getState();
    saveTree({ id: treeId, name, state: tree });
  };

  useTreeStore.subscribe((state, prev) => {
    if (state.tree === prev.tree && state.name === prev.name) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });

  // A pending save must not be lost when the tab closes or is hidden (on
  // mobile, hidden is often the last event a page ever gets).
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
