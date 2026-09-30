import type {
  EdgeId,
  LayoutDirection,
  NodeId,
  PaletteColor,
  TreeDoc,
  TreeEdge,
  TreeId,
  TreeNode,
  TreeRoot,
  TreeState,
} from "./types";
import { PALETTE_COLORS } from "./types";

/**
 * The saved shape of a tree, and how to read it back safely. Pure: where it
 * is stored (localStorage) is `store/persistTree.ts`'s business.
 *
 * The version number is written from the first release, before there is
 * anything to migrate, because that is the only moment adding one is free
 * (same reasoning as Boardkit).
 */
export const SCHEMA_VERSION = 2;

/**
 * Version 1 had a single `rootId`; version 2 has `roots` (each with a board
 * position). `readTree` still reads version 1, turning its root into the
 * first entry of `roots` at the origin, so older saves open unchanged.
 */
export interface PersistedTree {
  readonly version: 2;
  readonly doc: TreeDoc;
}

export function serializeTree(doc: TreeDoc): PersistedTree {
  const { roots, nodes, edges, childEdges, direction } = doc.state;
  // Copies out exactly the content fields, so nothing else that happens to
  // ride along on the object can leak into storage.
  return {
    version: SCHEMA_VERSION,
    doc: { id: doc.id, name: doc.name, state: { roots, nodes, edges, childEdges, direction } },
  };
}

export type TreeRead =
  | { readonly status: "ok"; readonly doc: TreeDoc }
  /** Some of it was damaged; `doc` is what could be recovered. */
  | { readonly status: "repaired"; readonly doc: TreeDoc; readonly fixes: number }
  | { readonly status: "unreadable" };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Validates saved data and repairs what it can. Saved data can be damaged
 * by a bug in an older version, a hand edit, or a half-written save, and a
 * broken tree must never crash the app on load.
 *
 * Repairs: fields with the wrong type get defaults; edges pointing at
 * missing nodes, a second parent, or into a root are dropped; child order
 * is rebuilt from the edges that exist; nodes no longer reachable from a
 * root are dropped (they could never be shown). `unreadable` is kept for
 * data with nothing to salvage: no root, or an unknown version (possibly a
 * newer one -- "repairing" it would destroy what that version wrote).
 */
export function readTree(data: unknown): TreeRead {
  if (!isObject(data) || (data.version !== 1 && data.version !== 2) || !isObject(data.doc)) {
    return { status: "unreadable" };
  }
  const doc = data.doc;
  const state = isObject(doc.state) ? doc.state : null;
  if (typeof doc.id !== "string" || !state) return { status: "unreadable" };
  let fixes = 0;
  const fix = <T>(value: T): T => {
    fixes++;
    return value;
  };

  // Nodes.
  const rawNodes: Record<string, unknown> = isObject(state.nodes) ? state.nodes : fix({});
  const nodes: Record<NodeId, TreeNode> = {};
  for (const [key, raw] of Object.entries(rawNodes)) {
    if (!isObject(raw)) {
      fix(null);
      continue;
    }
    const id = key as NodeId;
    const title = typeof raw.title === "string" ? raw.title : fix("");
    const color =
      raw.color === null || PALETTE_COLORS.includes(raw.color as PaletteColor)
        ? (raw.color as PaletteColor | null)
        : fix(null);
    const collapsed = typeof raw.collapsed === "boolean" ? raw.collapsed : fix(false);
    if (raw.id !== key) fix(null);
    nodes[id] = { id, title, color, collapsed };
  }

  // Roots: the saved ones that exist (once each), or version 1's single one.
  const rawRoots: unknown[] =
    data.version === 1 ? [{ id: state.rootId, x: 0, y: 0 }] : Array.isArray(state.roots) ? state.roots : [];
  const roots: TreeRoot[] = [];
  for (const raw of rawRoots) {
    const entry = isObject(raw) ? raw : null;
    const id = entry?.id as NodeId | undefined;
    if (!entry || !id || !nodes[id] || roots.some((root) => root.id === id)) {
      fix(null);
      continue;
    }
    const x = typeof entry.x === "number" && Number.isFinite(entry.x) ? entry.x : fix(0);
    const y = typeof entry.y === "number" && Number.isFinite(entry.y) ? entry.y : fix(0);
    roots.push({ id, x, y });
  }
  if (roots.length === 0) return { status: "unreadable" };
  const rootIds = new Set(roots.map((root) => root.id));

  // Edges: both ends must exist, never into a root, one parent per node.
  const rawEdges: Record<string, unknown> = isObject(state.edges) ? state.edges : fix({});
  const edges: Record<EdgeId, TreeEdge> = {};
  const hasParent = new Set<NodeId>();
  for (const [key, raw] of Object.entries(rawEdges)) {
    const source = isObject(raw) ? (raw.source as NodeId) : undefined;
    const target = isObject(raw) ? (raw.target as NodeId) : undefined;
    if (
      !isObject(raw) ||
      !source ||
      !target ||
      !nodes[source] ||
      !nodes[target] ||
      rootIds.has(target) ||
      source === target ||
      hasParent.has(target)
    ) {
      fix(null);
      continue;
    }
    hasParent.add(target);
    const id = key as EdgeId;
    const label = typeof raw.label === "string" ? raw.label : fix("");
    edges[id] = { id, source, target, label };
  }

  // Child order: the saved order where it is valid, then any edge the saved
  // order forgot, so no child is ever lost.
  const rawChildEdges: Record<string, unknown> = isObject(state.childEdges) ? state.childEdges : fix({});
  const childEdges: Record<NodeId, EdgeId[]> = {};
  for (const id of Object.keys(nodes) as NodeId[]) childEdges[id] = [];
  const placed = new Set<EdgeId>();
  for (const id of Object.keys(nodes) as NodeId[]) {
    const saved = rawChildEdges[id];
    if (!Array.isArray(saved)) {
      fix(null);
      continue;
    }
    for (const edgeId of saved as EdgeId[]) {
      if (edges[edgeId]?.source === id && !placed.has(edgeId)) {
        childEdges[id].push(edgeId);
        placed.add(edgeId);
      } else {
        fix(null);
      }
    }
  }
  for (const edge of Object.values(edges)) {
    if (!placed.has(edge.id)) childEdges[fix(edge.source)].push(edge.id);
  }

  // Drop whatever no root can reach.
  const reachable = new Set<NodeId>();
  const stack = [...rootIds];
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const edgeId of childEdges[id]) stack.push(edges[edgeId].target);
  }
  for (const nodeId of Object.keys(nodes) as NodeId[]) {
    if (reachable.has(nodeId)) continue;
    fix(null);
    for (const edgeId of childEdges[nodeId]) delete edges[edgeId];
    delete nodes[nodeId];
    delete childEdges[nodeId];
  }

  const direction: LayoutDirection =
    state.direction === "TB" || state.direction === "LR" ? state.direction : fix("TB");
  const name = typeof doc.name === "string" && doc.name ? doc.name : fix("Untitled tree");

  const tree: TreeState = { roots, nodes, edges, childEdges, direction };
  const result: TreeDoc = { id: doc.id as TreeId, name, state: tree };
  return fixes === 0 ? { status: "ok", doc: result } : { status: "repaired", doc: result, fixes };
}
