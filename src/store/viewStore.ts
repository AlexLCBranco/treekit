import { create } from "zustand";

/** Where the camera puts the tree: centred on the page, or its top-left
    corner in the page's top-left. */
export type Alignment = "center" | "start";

const KEY = "treekit:alignment";

function load(): Alignment {
  try {
    return localStorage.getItem(KEY) === "start" ? "start" : "center";
  } catch {
    return "center";
  }
}

/**
 * View preferences: how you look at trees, not part of any tree, so they
 * are not saved with a tree or put on the undo stack.
 */
export const useViewStore = create<{
  alignment: Alignment;
  setAlignment: (alignment: Alignment) => void;
}>()((set) => ({
  alignment: load(),
  setAlignment: (alignment) => {
    try {
      localStorage.setItem(KEY, alignment);
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment });
  },
}));
