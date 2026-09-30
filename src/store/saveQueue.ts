import type { TreeDoc } from "../domain/types";
import { saveTree } from "./persistTree";

/**
 * The pending auto-save, if any. Its own module so both the auto-saver
 * (which schedules) and the store can reach it without importing each
 * other. The store must flush before switching trees: a pending save reads
 * the store when it runs, so after a switch it would read the *new* tree,
 * and the old tree's last edits would never be written.
 */
const SAVE_DELAY_MS = 400;

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => TreeDoc) | null = null;

/** Saves `read()` after a short quiet period; a newer call replaces it. */
export function scheduleSave(read: () => TreeDoc): void {
  if (timer !== null) clearTimeout(timer);
  pending = read;
  timer = setTimeout(flushSave, SAVE_DELAY_MS);
}

/** Writes the pending save now, if there is one. */
export function flushSave(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  const read = pending;
  pending = null;
  if (read) saveTree(read());
}

/** Drops the pending save (the tree it belongs to was just deleted). */
export function cancelSave(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  pending = null;
}
