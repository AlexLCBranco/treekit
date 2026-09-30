import { readTree, serializeTree, type TreeRead } from "../domain/persistence";
import {
  readRegistry,
  removeTree,
  serializeRegistry,
  upsertTree,
  type Registry,
} from "../domain/registry";
import type { TreeDoc, TreeId } from "../domain/types";

/**
 * The only module that touches localStorage for trees. `domain/` owns the
 * data shapes and their validation; this owns where they live:
 *
 *   treekit:tree:<id>   one tree
 *   treekit:registry    the list of trees (ids and names, creation order)
 *   treekit:active      the id of the tree that was open last
 *
 * Every write is wrapped: storage can fail (quota, private browsing)
 * without that being fatal -- the app keeps working in memory.
 */
const TREE_KEY_PREFIX = "treekit:tree:";
const REGISTRY_KEY = "treekit:registry";
const ACTIVE_KEY = "treekit:active";
const DAMAGED_KEY_PREFIX = "treekit:damaged:";

function tryWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // See the module comment: failing to save is not fatal.
  }
}

function parse(raw: string): TreeRead {
  try {
    return readTree(JSON.parse(raw));
  } catch {
    return { status: "unreadable" };
  }
}

function storedTreeIds(): TreeId[] {
  const ids: TreeId[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(TREE_KEY_PREFIX)) ids.push(key.slice(TREE_KEY_PREFIX.length) as TreeId);
  }
  return ids;
}

function writeRegistry(registry: Registry): void {
  tryWrite(REGISTRY_KEY, JSON.stringify(serializeRegistry(registry)));
}

/**
 * The list of saved trees, reconciled with what is actually stored: an
 * entry whose tree is gone is dropped, and a stored tree the list does not
 * know is added. That also covers trees saved before the registry existed
 * (v0.0.2), and a registry lost or damaged on its own.
 */
export function loadRegistry(): Registry {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    let registry: Registry = [];
    if (raw !== null) {
      try {
        registry = readRegistry(JSON.parse(raw)) ?? [];
      } catch {
        registry = [];
      }
    }
    const stored = new Set(storedTreeIds());
    let reconciled: Registry = registry.filter((t) => stored.has(t.id));
    for (const id of stored) {
      if (reconciled.some((t) => t.id === id)) continue;
      const read = parse(localStorage.getItem(TREE_KEY_PREFIX + id) ?? "");
      reconciled = upsertTree(reconciled, {
        id,
        name: read.status === "unreadable" ? "Damaged tree" : read.doc.name,
      });
    }
    if (reconciled.length !== registry.length || reconciled.some((t, i) => t !== registry[i])) {
      writeRegistry(reconciled);
    }
    return reconciled;
  } catch {
    return [];
  }
}

/** Writes a tree and keeps its registry entry (name) in step. */
export function saveTree(doc: TreeDoc): void {
  tryWrite(TREE_KEY_PREFIX + doc.id, JSON.stringify(serializeTree(doc)));
  writeRegistry(upsertTree(loadRegistry(), { id: doc.id, name: doc.name }));
}

export function deleteStoredTree(id: TreeId): void {
  try {
    localStorage.removeItem(TREE_KEY_PREFIX + id);
  } catch {
    // Nothing to do: the registry below still forgets it.
  }
  writeRegistry(removeTree(loadRegistry(), id));
}

export function loadActiveTreeId(): TreeId | null {
  try {
    return localStorage.getItem(ACTIVE_KEY) as TreeId | null;
  } catch {
    return null;
  }
}

export function saveActiveTreeId(id: TreeId): void {
  tryWrite(ACTIVE_KEY, id);
}

/**
 * Reads one tree, or `null` if it is missing or nothing could be salvaged.
 *
 * A damaged tree still opens, repaired as far as possible -- but first its
 * saved text is copied, untouched, to a `treekit:damaged:` key, because the
 * next auto-save overwrites the tree's own key. Without that copy,
 * "repaired" would quietly mean "whatever the repair kept".
 */
export function loadTree(id: TreeId): TreeDoc | null {
  try {
    const raw = localStorage.getItem(TREE_KEY_PREFIX + id);
    if (raw === null) return null;
    const read = parse(raw);
    if (read.status === "ok") return read.doc;

    const asideKey = `${DAMAGED_KEY_PREFIX}${id}:${Date.now()}`;
    tryWrite(asideKey, raw);
    console.warn(
      read.status === "repaired"
        ? `Treekit: a saved tree was damaged and has been repaired (${read.fixes} fixes). The original is kept in localStorage under "${asideKey}".`
        : `Treekit: a saved tree could not be read. It is kept in localStorage under "${asideKey}".`,
    );
    return read.status === "repaired" ? read.doc : null;
  } catch {
    return null;
  }
}
