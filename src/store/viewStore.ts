import { create } from "zustand";

import type { Align, Alignment } from "../domain/layout";

const KEY = "treekit:align";

const isAlign = (v: unknown): v is Align => v === "start" || v === "center" || v === "end";

function load(): Alignment {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return { x: isAlign(raw.x) ? raw.x : null, y: isAlign(raw.y) ? raw.y : null };
  } catch {
    return { x: null, y: null };
  }
}

/**
 * View preferences: how trees are laid out on the page, not part of any
 * tree, so they are not saved with a tree or put on the undo stack.
 */
export const useViewStore = create<{
  alignment: Alignment;
  setAlign: (axis: "x" | "y", value: Align) => void;
}>()((set, get) => ({
  alignment: load(),
  setAlign: (axis, value) => {
    const alignment = { ...get().alignment, [axis]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(alignment));
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment });
  },
}));
