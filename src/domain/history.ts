import type { TreeState } from "./types";

/**
 * Undo/redo over a stack of patches, not full snapshots (the same design as
 * Boardkit's `domain/history.ts`).
 *
 * Every tree operation copies only the slices it touches (`nodes`, `edges`,
 * `childEdges`, ...) and leaves the rest at their old reference. So the
 * difference between two states is simply "which top-level slices changed
 * identity", and storing those slices' old and new values is a complete
 * undo record -- no per-action undo code, and no copying of the untouched
 * parts of the tree on every step.
 */
export type TreePatch = Partial<TreeState>;

export interface HistoryEntry {
  readonly before: TreePatch;
  readonly after: TreePatch;
}

export interface History {
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
}

export const EMPTY_HISTORY: History = { past: [], future: [] };

/** Bounded so a long session's undo stack cannot grow without limit. */
const HISTORY_LIMIT = 200;

/** The slices that changed between two states, old and new. */
function diff(prev: TreeState, next: TreeState): HistoryEntry {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(next) as (keyof TreeState)[]) {
    if (prev[key] !== next[key]) {
      before[key] = prev[key];
      after[key] = next[key];
    }
  }
  return { before: before as TreePatch, after: after as TreePatch };
}

const isEmpty = (patch: TreePatch) => Object.keys(patch).length === 0;

/**
 * Records `prev -> next` as one step. A step that changed nothing (renaming
 * a node to its own title) is dropped. Any real step clears `future`: redo
 * only replays what undo just walked back through.
 */
export function record(history: History, prev: TreeState, next: TreeState): History {
  const entry = diff(prev, next);
  if (isEmpty(entry.after)) return history;
  return { past: [...history.past, entry].slice(-HISTORY_LIMIT), future: [] };
}

/**
 * Folds `prev -> next` into the most recent step instead of adding a new
 * one. Used so "add a child, type its name" undoes in one go rather than
 * first un-naming an empty node. The older step's `before` wins for any
 * slice both touched, since that is the value from before either change.
 */
export function amendLast(history: History, prev: TreeState, next: TreeState): History {
  const last = history.past.at(-1);
  if (!last) return record(history, prev, next);
  const entry = diff(prev, next);
  if (isEmpty(entry.after)) return history;
  const merged: HistoryEntry = {
    before: { ...entry.before, ...last.before },
    after: { ...last.after, ...entry.after },
  };
  return { past: [...history.past.slice(0, -1), merged], future: [] };
}

export function undo(history: History, state: TreeState): { history: History; state: TreeState } | null {
  const entry = history.past.at(-1);
  if (!entry) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [...history.future, entry] },
    state: { ...state, ...entry.before },
  };
}

export function redo(history: History, state: TreeState): { history: History; state: TreeState } | null {
  const entry = history.future.at(-1);
  if (!entry) return null;
  return {
    history: { past: [...history.past, entry], future: history.future.slice(0, -1) },
    state: { ...state, ...entry.after },
  };
}
