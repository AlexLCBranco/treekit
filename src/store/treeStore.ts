import { create } from "zustand";

import * as history from "../domain/history";
import { createTreeId } from "../domain/ids";
import { removeTree, upsertTree, type Registry } from "../domain/registry";
import * as tree from "../domain/tree";
import type {
  EdgeId,
  LayoutDirection,
  NodeId,
  PaletteColor,
  TreeDoc,
  TreeId,
  TreeState,
} from "../domain/types";
import {
  deleteStoredTree,
  loadActiveTreeId,
  loadRegistry,
  loadTree,
  saveActiveTreeId,
  saveTree,
} from "./persistTree";
import { cancelSave, flushSave } from "./saveQueue";

/**
 * The open tree, plus the list of all saved trees. The store is a thin
 * wrapper: every edit delegates to a pure function in `domain/tree.ts`, and
 * `commit` records the change for undo in the same `set`, so no edit can
 * forget to be undoable.
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
  /** Every saved tree, oldest first. */
  readonly trees: Registry;
  readonly history: history.History;
  /** Undo history of the other trees opened this session, so switching
      away and back keeps it. Session-only, like `history`. */
  readonly histories: Readonly<Record<TreeId, history.History>>;
  /** A node just created by "add child" and not yet named. Naming it is
      folded into the same undo step as creating it. */
  readonly newNodeId: NodeId | null;
  readonly selectedId: NodeId | null;
  /** The node whose title is open for inline renaming, if any. */
  readonly editingId: NodeId | null;
  /** The edge whose label is open for editing, if any. At most one of
      `editingId` / `editingEdgeId` is set: one text field is open at a time. */
  readonly editingEdgeId: EdgeId | null;

  addChild: (parentId: NodeId) => void;
  renameNode: (nodeId: NodeId, title: string) => void;
  /** Sets a node's palette colour; `null` clears it. */
  setNodeColor: (nodeId: NodeId, color: PaletteColor | null) => void;
  /** Sets an edge's label; an empty string removes it. */
  setEdgeLabel: (edgeId: EdgeId, label: string) => void;
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
  /** Opens an edge's label for editing and selects the node it leads to,
      so a label and "its" node read as one thing. */
  startEditingLabel: (edgeId: EdgeId) => void;

  /** Creates an empty tree and opens it. */
  newTree: (name: string) => void;
  /** Copies the open tree into a new one and opens the copy. */
  duplicateTree: (name: string) => void;
  switchTree: (id: TreeId) => void;
  renameTree: (name: string) => void;
  /** Deletes a saved tree for good. Deleting the open one opens the newest
      remaining tree, or a fresh one if it was the last. */
  deleteTree: (id: TreeId) => void;
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

function blankDoc(name: string): TreeDoc {
  return { id: createTreeId(), name, state: tree.createTree() };
}

/**
 * The store fields that change when a different tree goes on screen. The
 * outgoing tree's undo history is parked in `histories`, and the incoming
 * one's picked back up. Selection and editing never carry across trees.
 */
function open(s: TreeStore, doc: TreeDoc, trees: Registry): Partial<TreeStore> {
  saveActiveTreeId(doc.id);
  const { [doc.id]: incoming, ...others } = s.histories;
  return {
    treeId: doc.id,
    name: doc.name,
    tree: doc.state,
    trees,
    history: incoming ?? history.EMPTY_HISTORY,
    histories: trees.some((t) => t.id === s.treeId) ? { ...others, [s.treeId]: s.history } : others,
    newNodeId: null,
    selectedId: null,
    editingId: null,
    editingEdgeId: null,
  };
}

/** Creates a tree in storage right away, so it is listed even before its
    first edit. */
function createStored(doc: TreeDoc, trees: Registry): Registry {
  saveTree(doc);
  return upsertTree(trees, { id: doc.id, name: doc.name });
}

/** What opens on load: the tree open last time, else the newest one, else
    a brand-new tree. */
function initialState(): { doc: TreeDoc; trees: Registry } {
  let trees = loadRegistry();
  const activeId = loadActiveTreeId();
  const doc =
    (activeId && trees.some((t) => t.id === activeId) ? loadTree(activeId) : null) ??
    (trees.length > 0 ? loadTree(trees[trees.length - 1].id) : null);
  if (doc) {
    saveActiveTreeId(doc.id);
    return { doc, trees };
  }
  const fresh = blankDoc("Untitled tree");
  trees = createStored(fresh, trees);
  saveActiveTreeId(fresh.id);
  return { doc: fresh, trees };
}

const initial = initialState();

export const useTreeStore = create<TreeStore>()((set, get) => ({
  treeId: initial.doc.id,
  name: initial.doc.name,
  tree: initial.doc.state,
  trees: initial.trees,
  history: history.EMPTY_HISTORY,
  histories: {},
  newNodeId: null,
  selectedId: null,
  editingId: null,
  editingEdgeId: null,

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

  setNodeColor: (nodeId, color) =>
    set((s) => {
      const next = tree.setNodeColor(s.tree, nodeId, color);
      return next === s.tree ? s : commit(s, next);
    }),

  setEdgeLabel: (edgeId, label) =>
    set((s) => {
      const next = tree.setEdgeLabel(s.tree, edgeId, label);
      return next === s.tree ? s : commit(s, next);
    }),

  deleteBranch: (nodeId) =>
    set((s) => {
      const next = tree.deleteBranch(s.tree, nodeId);
      if (next === s.tree) return s;
      return {
        ...commit(s, next),
        selectedId: tree.neighbourAfterDelete(s.tree, nodeId),
        editingId: null,
        editingEdgeId: null,
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
        editingEdgeId: null,
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
        editingEdgeId: null,
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
        editingEdgeId: null,
      };
    }),

  select: (nodeId) =>
    set((s) =>
      s.selectedId === nodeId ? s : { selectedId: nodeId, editingId: null, editingEdgeId: null },
    ),

  startEditing: (nodeId) => set({ selectedId: nodeId, editingId: nodeId, editingEdgeId: null }),

  startEditingLabel: (edgeId) =>
    set((s) => {
      const edge = s.tree.edges[edgeId];
      if (!edge) return s;
      return { selectedId: edge.target, editingId: null, editingEdgeId: edgeId };
    }),

  // Runs right after a rename's commit, so the "name the new node" window
  // closes here: a later rename of that node is its own undo step.
  stopEditing: () => set({ editingId: null, editingEdgeId: null, newNodeId: null }),

  // Tree management. Each one flushes the pending auto-save first, so the
  // outgoing tree's last edits are written before anything else happens.
  // Renaming a tree is not an undo step: undo is about the tree's content,
  // and the name is right there to click and change back.
  newTree: (name) => {
    flushSave();
    const doc = blankDoc(name);
    set((s) => open(s, doc, createStored(doc, s.trees)));
  },

  duplicateTree: (name) => {
    flushSave();
    const doc: TreeDoc = { id: createTreeId(), name, state: tree.cloneTree(get().tree) };
    set((s) => open(s, doc, createStored(doc, s.trees)));
  },

  switchTree: (id) => {
    if (id === get().treeId) return;
    flushSave();
    const doc = loadTree(id);
    if (!doc) {
      // Missing, or unreadable -- in which case `loadTree` has already
      // copied it aside. Either way there is nothing to open, so it leaves
      // the list rather than stay there as a dead entry.
      deleteStoredTree(id);
      set((s) => ({ trees: removeTree(s.trees, id) }));
      return;
    }
    set((s) => open(s, doc, s.trees));
  },

  renameTree: (name) =>
    set((s) =>
      s.name === name ? s : { name, trees: upsertTree(s.trees, { id: s.treeId, name }) },
    ),

  deleteTree: (id) => {
    const s = get();
    if (id !== s.treeId) {
      deleteStoredTree(id);
      const { [id]: _, ...histories } = s.histories;
      set({ trees: removeTree(s.trees, id), histories });
      return;
    }
    // The open tree: its pending save must not resurrect it.
    cancelSave();
    deleteStoredTree(id);
    const remaining = removeTree(s.trees, id);
    const next = remaining.length > 0 ? loadTree(remaining[remaining.length - 1].id) : null;
    const doc = next ?? blankDoc("Untitled tree");
    const trees = next ? remaining : createStored(doc, remaining);
    // `open` parks the outgoing history only for trees still listed, so the
    // deleted tree's history is dropped here rather than kept around.
    set((state) => open(state, doc, trees));
  },
}));
