import { readTree, serializeTree } from "../domain/persistence";
import type { TreeDoc, TreeId } from "../domain/types";

/**
 * The only module that touches localStorage for trees. `domain/persistence`
 * owns the data shape and its validation; this owns where it lives.
 *
 * One key per tree (`treekit:tree:<id>`) plus a pointer to the one last
 * open, so multiple trees slot in without changing the format: a tree
 * switcher just lists the keys and moves the pointer.
 */
const TREE_KEY_PREFIX = "treekit:tree:";
const ACTIVE_KEY = "treekit:active";
const DAMAGED_KEY_PREFIX = "treekit:damaged:";

export function saveTree(doc: TreeDoc): void {
  try {
    localStorage.setItem(TREE_KEY_PREFIX + doc.id, JSON.stringify(serializeTree(doc)));
    localStorage.setItem(ACTIVE_KEY, doc.id);
  } catch {
    // Storage can fail (quota, private browsing) without that being fatal:
    // the tree keeps working in memory for the rest of the session.
  }
}

/**
 * The tree that was open last time, or `null` if there is none (first
 * visit) or nothing could be salvaged.
 *
 * A damaged tree still opens, repaired as far as possible -- but first its
 * saved text is copied, untouched, to a `treekit:damaged:` key, because the
 * next auto-save overwrites the tree's own key. Without that copy,
 * "repaired" would quietly mean "whatever the repair kept".
 */
export function loadActiveTree(): TreeDoc | null {
  try {
    const id = localStorage.getItem(ACTIVE_KEY) as TreeId | null;
    if (!id) return null;
    const raw = localStorage.getItem(TREE_KEY_PREFIX + id);
    if (raw === null) return null;

    let read: ReturnType<typeof readTree>;
    try {
      read = readTree(JSON.parse(raw));
    } catch {
      read = { status: "unreadable" };
    }
    if (read.status === "ok") return read.doc;

    localStorage.setItem(`${DAMAGED_KEY_PREFIX}${id}:${Date.now()}`, raw);
    console.warn(
      read.status === "repaired"
        ? `Treekit: the saved tree was damaged and has been repaired (${read.fixes} fixes). The original is kept in localStorage under "${DAMAGED_KEY_PREFIX}${id}:…".`
        : `Treekit: the saved tree could not be read. It is kept in localStorage under "${DAMAGED_KEY_PREFIX}${id}:…"; a new tree was started.`,
    );
    return read.status === "repaired" ? read.doc : null;
  } catch {
    return null;
  }
}
