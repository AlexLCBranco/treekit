import { create } from "zustand";

import type { Align } from "../domain/navigation";

/** Where the whole tree sits on the page. */
export interface PageAlignment {
  readonly x: Align;
  readonly y: Align;
}

/** The active cursor tool, as in Excalidraw's presentation mode. */
export type Tool = "select" | "laser";

const KEY = "treekit:align";

const isAlign = (v: unknown): v is Align => v === "start" || v === "center" || v === "end";

function load(): PageAlignment {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    return { x: isAlign(raw.x) ? raw.x : "center", y: isAlign(raw.y) ? raw.y : "center" };
  } catch {
    return { x: "center", y: "center" };
  }
}

/**
 * View preferences: how the tree sits on the page, not part of any tree, so
 * not saved with a tree or put on the undo stack. \`applied\` counts button
 * presses, so pressing the already-active icon frames the tree again.
 */
export const useViewStore = create<{
  alignment: PageAlignment;
  applied: number;
  /** Session-only: a tool left on by accident should not survive a reload. */
  tool: Tool;
  setTool: (tool: Tool) => void;
  setAlign: (axis: "x" | "y", value: Align) => void;
}>()((set, get) => ({
  alignment: load(),
  applied: 0,
  tool: "select",
  setTool: (tool) => set({ tool }),
  setAlign: (axis, value) => {
    const alignment = { ...get().alignment, [axis]: value };
    try {
      localStorage.setItem(KEY, JSON.stringify(alignment));
    } catch {
      // Storage full or blocked: the choice still applies for this visit.
    }
    set({ alignment, applied: get().applied + 1 });
  },
}));
