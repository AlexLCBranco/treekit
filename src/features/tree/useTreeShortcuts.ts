import { useEffect } from "react";

import { parentEdgeOf } from "../../domain/tree";
import { useTreeStore } from "../../store/treeStore";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/** Focus is in a menu or dialog, which owns the keyboard (arrows, Enter,
    Esc) -- Delete there must never delete a node behind it. */
function inOverlay(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('[role="menu"], [role="dialog"], [role="alertdialog"]') !== null
  );
}

/** Node shortcuts only apply with focus on the canvas (or nowhere). With
    focus on a header button, Tab must move focus and Enter press it. */
function onCanvas(target: EventTarget | null): boolean {
  return (
    target === document.body ||
    (target instanceof HTMLElement && target.closest(".react-flow") !== null)
  );
}

/**
 * Canvas keyboard shortcuts. Mind-map tools (XMind, MindNode) use the same
 * Tab/Enter convention.
 *
 *   Ctrl/Cmd+Z                 undo
 *   Ctrl/Cmd+Shift+Z, Ctrl+Y   redo
 * On the selected node:
 *   Tab                        add a child (and start naming it)
 *   Enter, F2                  rename
 *   L                          label the line leading into it
 *   Delete, Backspace          delete it and its branch
 *   Shift+Delete/Backspace     delete only it; its children move up
 *   Esc                        clear the selection
 *
 * All ignored while typing in a field, so the field's own undo and
 * Backspace keep working. Reads the store with `getState()` inside the
 * handler rather than subscribing, so the listener is attached once and
 * never re-renders the canvas.
 */
export function useTreeShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || inOverlay(event.target) || event.altKey) return;
      const store = useTreeStore.getState();
      const key = event.key.toLowerCase();

      if (event.ctrlKey || event.metaKey) {
        if (key === "z" && !event.shiftKey) {
          event.preventDefault();
          store.undo();
        } else if ((key === "z" && event.shiftKey) || key === "y") {
          event.preventDefault();
          store.redo();
        }
        return;
      }

      const { selectedId } = store;
      if (!selectedId || !onCanvas(event.target)) return;

      if (key === "tab") {
        event.preventDefault();
        store.addChild(selectedId);
      } else if (key === "enter" || key === "f2") {
        event.preventDefault();
        store.startEditing(selectedId);
      } else if (key === "l" && !event.shiftKey) {
        const edge = parentEdgeOf(store.tree, selectedId);
        if (edge) {
          // Otherwise the "l" would be typed into the field as it opens.
          event.preventDefault();
          store.startEditingLabel(edge.id);
        }
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        if (event.shiftKey) store.deleteNode(selectedId);
        else store.deleteBranch(selectedId);
      } else if (key === "escape") {
        store.select(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
