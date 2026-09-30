import type { TreeId } from "./types";

/**
 * The index of saved trees: what the tree switcher lists. Kept apart from
 * the trees themselves (like Boardkit's board registry), so listing trees
 * never means reading and parsing every tree in storage.
 *
 * Stored oldest-first (creation order); the switcher shows it newest-first.
 */
export interface TreeSummary {
  readonly id: TreeId;
  readonly name: string;
}

export type Registry = readonly TreeSummary[];

export const REGISTRY_VERSION = 1;

export interface PersistedRegistryV1 {
  readonly version: 1;
  readonly trees: Registry;
}

export function serializeRegistry(registry: Registry): PersistedRegistryV1 {
  return { version: REGISTRY_VERSION, trees: registry.map(({ id, name }) => ({ id, name })) };
}

/** `null` when the data is not a registry at all; bad entries are skipped. */
export function readRegistry(data: unknown): Registry | null {
  if (typeof data !== "object" || data === null) return null;
  const candidate = data as Record<string, unknown>;
  if (candidate.version !== 1 || !Array.isArray(candidate.trees)) return null;
  const seen = new Set<string>();
  const trees: TreeSummary[] = [];
  for (const entry of candidate.trees as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { id, name } = entry as Record<string, unknown>;
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    trees.push({ id: id as TreeId, name: typeof name === "string" && name ? name : "Untitled tree" });
  }
  return trees;
}

/** Adds a tree at the end, or updates its name in place if listed. */
export function upsertTree(registry: Registry, summary: TreeSummary): Registry {
  const index = registry.findIndex((t) => t.id === summary.id);
  if (index === -1) return [...registry, summary];
  if (registry[index].name === summary.name) return registry;
  return registry.map((t, i) => (i === index ? summary : t));
}

export function removeTree(registry: Registry, id: TreeId): Registry {
  return registry.filter((t) => t.id !== id);
}
