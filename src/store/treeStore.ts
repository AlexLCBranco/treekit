import { create } from "zustand";

import * as tree from "../domain/tree";
import type { LayoutDirection, NodeId, TreeState } from "../domain/types";

/**
 * The active tree. The store is a thin wrapper: every action delegates to a
 * pure function in `domain/tree.ts` and just stores the result. Undo/redo,
 * persistence and multiple trees will wrap this same `set` later (Boardkit's
 * patch-based history fits as-is, since domain functions keep untouched
 * slices at their old reference).
 *
 * `selectedId` / `editingId` are UI state, but shared across components
 * (the keyboard handler selects, the node renders the selection, "add
 * child" opens the new node for renaming), so they live here rather than in
 * one component's local state.
 */
interface TreeStore {
  readonly tree: TreeState;
  readonly selectedId: NodeId | null;
  /** The node whose title is open for inline renaming, if any. */
  readonly editingId: NodeId | null;

  addChild: (parentId: NodeId) => void;
  renameNode: (nodeId: NodeId, title: string) => void;
  setDirection: (direction: LayoutDirection) => void;
  select: (nodeId: NodeId | null) => void;
  startEditing: (nodeId: NodeId) => void;
  stopEditing: () => void;
}

export const useTreeStore = create<TreeStore>()((set) => ({
  tree: tree.createTree(),
  selectedId: null,
  editingId: null,

  addChild: (parentId) =>
    set((s) => {
      const { state, nodeId } = tree.addChild(s.tree, parentId);
      if (!nodeId) return s;
      // The new node is selected and opened for renaming straight away, so
      // "add, type, Enter" is one fluid motion.
      return { tree: state, selectedId: nodeId, editingId: nodeId };
    }),

  renameNode: (nodeId, title) => set((s) => ({ tree: tree.renameNode(s.tree, nodeId, title) })),

  setDirection: (direction) => set((s) => ({ tree: tree.setDirection(s.tree, direction) })),

  select: (nodeId) =>
    set((s) => (s.selectedId === nodeId ? s : { selectedId: nodeId, editingId: null })),

  startEditing: (nodeId) => set({ selectedId: nodeId, editingId: nodeId }),

  stopEditing: () => set({ editingId: null }),
}));
