import { useEffect } from "react";

import { arrowToMove, moveFrom, type ArrowKey } from "../../domain/navigation";
import { parentEdgeOf } from "../../domain/tree";
import { PALETTE_COLORS, type NodeId } from "../../domain/types";
import { selectionOf, useTreeStore } from "../../store/treeStore";
import { useViewStore, type Tool } from "../../store/viewStore";

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
 *   V, K                       select / laser cursor
 * On the selected node:
 *   Arrows                    move to the parent, a child, or along the
 *                              row (any arrow selects the first root if nothing is)
 *   Tab                       add a child (and start naming it)
 *   Enter, F2                  rename
 *   L                          label the line leading into it
 *   N                          open its notes
 *   F                          fork its branch into a new tree
 *   X                          cut it (non-destructive), or un-cut it
 *   Space                      collapse or expand its branch
 *   1-8, 0                     set a palette colour; 0 clears it
 *   Delete, Backspace          delete it and its branch
 *   Shift+Delete/Backspace     delete only it; its children move up
 *   Esc                        close the notes panel, else clear the selection
 *
 * All ignored while typing in a field, so the field's own undo and
 * Backspace keep working. Reads the store with `getState()` inside the
 * handler rather than subscribing, so the listener is attached once and
 * never re-renders the canvas.
 */
export function useTreeShortcuts() {
  useEffect(() => {
    // The child last selected under each parent, so ↓ after ↑ returns to
    // where you were. Session-only view state; stale entries are harmless
    // (`moveFrom` ignores a remembered node that is no longer a child).
    const lastChild = new Map<NodeId, NodeId>();
    const unsubscribe = useTreeStore.subscribe((s, prev) => {
      if (!s.selectedId || s.selectedId === prev.selectedId) return;
      const parent = parentEdgeOf(s.tree, s.selectedId)?.source;
      if (parent) lastChild.set(parent, s.selectedId);
    });

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

      if (!onCanvas(event.target)) return;
      const { selectedId } = store;

      if (event.key.startsWith("Arrow") && !event.shiftKey) {
        // Also stops the page scrolling.
        event.preventDefault();
        if (!selectedId) return store.select(store.tree.roots[0]);
        const move = arrowToMove(event.key as ArrowKey, store.tree.direction);
        const target = moveFrom(store.tree, selectedId, move, lastChild.get(selectedId));
        if (target) store.select(target);
        return;
      }

      if (!event.shiftKey) {
        const tools: Record<string, Tool> = { v: "select", k: "laser" };
        const tool = tools[key];
        if (tool) return useViewStore.getState().setTool(tool);
      }

      if (!selectedId) return;

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
      } else if (key === "n" && !event.shiftKey) {
        // Otherwise the "n" would be typed into the notes as they open.
        event.preventDefault();
        store.openNotes(selectedId);
      } else if (key === "f" && !event.shiftKey) {
        // Otherwise the "f" would be typed into the new tree's name.
        event.preventDefault();
        store.forkBranch(selectedId);
      } else if (key === "x" && !event.shiftKey) {
        // A marquee group is cut (or un-cut) together, like colours.
        store.toggleCut(selectionOf(store));
      } else if (key === " ") {
        // Also stops the page scrolling.
        event.preventDefault();
        store.toggleCollapsed(selectedId);
      } else if (key === "delete" || key === "backspace") {
        event.preventDefault();
        // A marquee group deletes together (whole branches, one undo step).
        const group = selectionOf(store);
        if (group.length > 1) store.deleteBranches(group);
        else if (event.shiftKey) store.deleteNode(selectedId);
        else store.deleteBranch(selectedId);
      } else if (/^[0-9]$/.test(key)) {
        // 1-8 pick a palette colour in its listed order; 0 clears it.
        const index = Number(key);
        if (index === 0) store.setNodesColor(selectionOf(store), null);
        else if (index <= PALETTE_COLORS.length) {
          store.setNodesColor(selectionOf(store), PALETTE_COLORS[index - 1]);
        }
      } else if (key === "escape") {
        if (store.notesOpen) store.closeNotes();
        else store.select(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unsubscribe();
    };
  }, []);
}
