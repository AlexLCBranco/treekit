import { create } from "zustand";

import * as history from "../domain/history";
import { createTreeId } from "../domain/ids";
import * as tree from "../domain/tree";
import type { LayoutDirection, NodeId, TreeId, TreeState } from "../domain/types";
import { loadActiveTree } from "./persistTree";

/**
 * The active tree. The store is a thin wrapper: every edit delegates to a
 * pure function in `domain/tree.ts`, and `commit` records the change for
 * undo in the same `set`, so no edit can forget to be undoable.
 *
 * `selectedId` / `editingId` are UI state, but shared across components
 * (the keyboard handler selects, the node renders the selection, "add
 * child" opens the new node for renaming), so they live here rather than in
 * one component's local state. They are not part of undo or saving.
 */
interface TreeStore {
  readonly treeId: TreeId;
  readonly name: string;
  readonly tree: TreeState;
  readonly history: history.History;
  /** A node just created by "add child" and not yet named. Naming it is
      folded into the same undo step as creating it. */
  readonly newNodeId: NodeId | null;
  readonly selectedId: NodeId | null;
  /** The node whose title is open for inline renaming, if any. */
  readonly editingId: NodeId | null;

  addChild: (parentId: NodeId) => void;
  renameNode: (nodeId: NodeId, title: string) => void;
  /** Deletes the node and everything below it. */
  deleteBranch: (nodeId: NodeId) => void;
  /** Deletes only the node; its children move up to its parent. */
  deleteNode: (nodeId: NodeId) => void;
  setDirection: (direction: LayoutDirection) => void;
  undo: () => void;
  redo: () => void;
  select: (nodeId: NodeId | null) => void;
  startEditing: (nodeId: NodeId) => void;
  stopEditing: () => void;
}

type Snapshot = Pick<TreeStore, "tree" | "history" | "newNodeId">;

/** One undoable edit: the new tree plus its history entry. */
function commit(s: Snapshot, next: TreeState): Pick<TreeStore, "tree" | "history" | "newNodeId"> {
  return { tree: next, history: history.record(s.history, s.tree, next), newNodeId: null };
}

/** After undo/redo, drop a selection that points at a node that is gone. */
function keepIfPresent(state: TreeState, id: NodeId | null): NodeId | null {
  return id && state.nodes[id] ? id : null;
}

const saved = loadActiveTree();

export const useTreeStore = create<TreeStore>()((set) => ({
  treeId: saved?.id ?? createTreeId(),
  name: saved?.name ?? "Untitled tree",
  tree: saved?.state ?? tree.createTree(),
  history: history.EMPTY_HISTORY,
  newNodeId: null,
  selectedId: null,
  editingId: null,

  addChild: (parentId) =>
    set((s) => {
      const { state, nodeId } = tree.addChild(s.tree, parentId);
      if (!nodeId) return s;
      // The new node is selected and opened for renaming straight away, so
      // "add, type, Enter" is one fluid motion -- and one undo step.
      return { ...commit(s, state), newNodeId: nodeId, selectedId: nodeId, editingId: nodeId };
    }),

  renameNode: (nodeId, title) =>
    set((s) => {
      const next = tree.renameNode(s.tree, nodeId, title);
      if (next === s.tree) return s;
      if (nodeId === s.newNodeId) {
        return { tree: next, history: history.amendLast(s.history, s.tree, next), newNodeId: null };
      }
      return commit(s, next);
    }),

  deleteBranch: (nodeId) =>
    set((s) => {
      const next = tree.deleteBranch(s.tree, nodeId);
      if (next === s.tree) return s;
      return {
        ...commit(s, next),
        selectedId: tree.neighbourAfterDelete(s.tree, nodeId),
        editingId: null,
      };
    }),

  deleteNode: (nodeId) =>
    set((s) => {
      const next = tree.deleteNode(s.tree, nodeId);
      if (next === s.tree) return s;
      // Its first child took its place, so that is the natural next focus.
      const firstChild = tree.childrenOf(s.tree, nodeId)[0];
      return {
        ...commit(s, next),
        selectedId: firstChild ?? tree.neighbourAfterDelete(s.tree, nodeId),
        editingId: null,
      };
    }),

  setDirection: (direction) =>
    set((s) => {
      const next = tree.setDirection(s.tree, direction);
      return next === s.tree ? s : commit(s, next);
    }),

  // Undo and redo apply a recorded patch directly; they never go through
  // `commit`, or undoing would record an "undo the undo" step and the redo
  // stack could never be reached.
  undo: () =>
    set((s) => {
      const step = history.undo(s.history, s.tree);
      if (!step) return s;
      return {
        tree: step.state,
        history: step.history,
        newNodeId: null,
        selectedId: keepIfPresent(step.state, s.selectedId),
        editingId: null,
      };
    }),

  redo: () =>
    set((s) => {
      const step = history.redo(s.history, s.tree);
      if (!step) return s;
      return {
        tree: step.state,
        history: step.history,
        newNodeId: null,
        selectedId: keepIfPresent(step.state, s.selectedId),
        editingId: null,
      };
    }),

  select: (nodeId) =>
    set((s) => (s.selectedId === nodeId ? s : { selectedId: nodeId, editingId: null })),

  startEditing: (nodeId) => set({ selectedId: nodeId, editingId: nodeId }),

  // Runs right after a rename's commit, so the "name the new node" window
  // closes here: a later rename of that node is its own undo step.
  stopEditing: () => set({ editingId: null, newNodeId: null }),
}));
