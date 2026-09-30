import { useEffect } from "react";

import { useTreeStore } from "../../store/treeStore";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/**
 * Canvas keyboard shortcuts, acting on the selected node:
 *   Tab        add a child (and start naming it)
 *   Enter, F2  rename
 *   Esc        clear the selection
 * Mind-map tools (XMind, MindNode) use the same Tab/Enter convention.
 *
 * Reads the store with `getState()` inside the handler rather than
 * subscribing, so the listener is attached once and never re-renders the
 * canvas.
 */
export function useTreeShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      const { selectedId, addChild, startEditing, select } = useTreeStore.getState();
      if (!selectedId) return;

      if (event.key === "Tab") {
        event.preventDefault();
        addChild(selectedId);
      } else if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        startEditing(selectedId);
      } else if (event.key === "Escape") {
        select(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
