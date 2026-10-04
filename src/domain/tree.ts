import { createEdgeId, createNodeId } from "./ids";
import type {
  EdgeId,
  LayoutDirection,
  NodeId,
  NodeStatus,
  PaletteColor,
  TreeEdge,
  TreeNode,
  TreeState,
} from "./types";

/**
 * Pure tree operations. Each takes a `TreeState` and returns a new one,
 * copying only the slices it touches and leaving every other slice at its
 * existing reference -- so a component subscribed to an untouched slice
 * never re-renders, and (later) undo can store just the touched slices.
 */

function makeNode(title: string): TreeNode {
  return { id: createNodeId(), title, color: null, collapsed: false, notes: "", status: null };
}

/** A fresh tree with just a root node, at the board's origin. */
export function createTree(rootTitle = "Decision", direction: LayoutDirection = "TB"): TreeState {
  const root = makeNode(rootTitle);
  return {
    roots: [root.id],
    trash: [],
    nodes: { [root.id]: root },
    edges: {},
    childEdges: { [root.id]: [] },
    direction,
    hideCut: false,
  };
}

/**
 * Adds a new child at the end of `parentId`'s children. Returns the new
 * state and the new node's id (the UI selects it and opens it for renaming).
 * Adding to a collapsed node expands it, so the new child is never hidden.
 */
export function addChild(
  state: TreeState,
  parentId: NodeId,
  title = "",
): { state: TreeState; nodeId: NodeId | null } {
  const parent = state.nodes[parentId];
  if (!parent) return { state, nodeId: null };

  const child = makeNode(title);
  const edge: TreeEdge = { id: createEdgeId(), source: parentId, target: child.id, label: "" };

  return {
    nodeId: child.id,
    state: {
      ...state,
      nodes: {
        ...state.nodes,
        [child.id]: child,
        ...(parent.collapsed ? { [parentId]: { ...parent, collapsed: false } } : {}),
      },
      edges: { ...state.edges, [edge.id]: edge },
      childEdges: {
        ...state.childEdges,
        [parentId]: [...(state.childEdges[parentId] ?? []), edge.id],
        [child.id]: [],
      },
    },
  };
}

/**
 * Starts another tree on the same board, at position `index` among the
 * roots (clamped to the ends). Returns the new root's id (the UI selects it
 * and opens it for naming).
 */
export function addRoot(state: TreeState, index: number, title = ""): { state: TreeState; nodeId: NodeId } {
  const root = makeNode(title);
  const at = Math.max(0, Math.min(index, state.roots.length));
  return {
    nodeId: root.id,
    state: {
      ...state,
      roots: [...state.roots.slice(0, at), root.id, ...state.roots.slice(at)],
      nodes: { ...state.nodes, [root.id]: root },
      childEdges: { ...state.childEdges, [root.id]: [] },
    },
  };
}

/** Whether `nodeId` starts one of the board's trees. */
export function isRoot(state: TreeState, nodeId: NodeId): boolean {
  return state.roots.includes(nodeId);
}

export function renameNode(state: TreeState, nodeId: NodeId, title: string): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.title === title) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, title } } };
}

/** Replaces a node's notes; an empty string removes them. */
export function setNotes(state: TreeState, nodeId: NodeId, notes: string): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.notes === notes) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, notes } } };
}

/** Sets a node's palette colour; `null` returns it to the default style. */
export function setNodeColor(state: TreeState, nodeId: NodeId, color: PaletteColor | null): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.color === color) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, color } } };
}

/** Sets the text on an edge; an empty string removes the label. */
export function setEdgeLabel(state: TreeState, edgeId: EdgeId, label: string): TreeState {
  const edge = state.edges[edgeId];
  if (!edge || edge.label === label) return state;
  return { ...state, edges: { ...state.edges, [edgeId]: { ...edge, label } } };
}

/**
 * Folds (`collapsed: true`) or unfolds a node's branch. Its children are
 * hidden, never deleted. A leaf has nothing to fold, so collapsing one is a
 * no-op (and records no undo step).
 */
export function setCollapsed(state: TreeState, nodeId: NodeId, collapsed: boolean): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.collapsed === collapsed) return state;
  if (collapsed && (state.childEdges[nodeId] ?? []).length === 0) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, collapsed } } };
}

/** Folds every given node that has children, or, if all of those already
    are folded, unfolds them (Space on a marquee group). Leaves are ignored. */
export function toggleCollapsedNodes(state: TreeState, nodeIds: readonly NodeId[]): TreeState {
  const foldable = nodeIds.filter((id) => state.nodes[id] && (state.childEdges[id] ?? []).length > 0);
  if (foldable.length === 0) return state;
  const allFolded = foldable.every((id) => state.nodes[id].collapsed);
  return foldable.reduce((s, id) => setCollapsed(s, id, !allFolded), state);
}

/**
 * The same tree with every branch unfolded. Not an edit: used to draw or
 * export the whole tree without touching what is saved.
 */
export function expandAll(state: TreeState): TreeState {
  if (Object.values(state.nodes).every((node) => !node.collapsed)) return state;
  const nodes: Record<NodeId, TreeNode> = {};
  for (const node of Object.values(state.nodes)) nodes[node.id] = node.collapsed ? { ...node, collapsed: false } : node;
  return { ...state, nodes };
}

/** How many nodes a collapsed node hides: everything below it that would
    show if it were unfolded (a hidden cut branch stays hidden either way). */
export function hiddenCount(state: TreeState, nodeId: NodeId): number {
  if (!state.nodes[nodeId]) return 0;
  let count = 0;
  const stack = visibleChildren(state, nodeId);
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    count++;
    stack.push(...visibleChildren(state, id));
  }
  return count;
}

/** Children, minus any hidden cut ones; folding is not considered. */
export function visibleChildren(state: TreeState, nodeId: NodeId): NodeId[] {
  const children = childrenOf(state, nodeId);
  return state.hideCut ? children.filter((id) => !isHiddenCut(state, id)) : children;
}

/** Whether this node (and so its branch) is off the page because it is cut
    and cut branches are hidden. */
export function isHiddenCut(state: TreeState, nodeId: NodeId): boolean {
  return state.hideCut && state.nodes[nodeId]?.status === "cut";
}

/**
 * The node itself if it is on screen, else the nearest thing on screen
 * that stands for it: the collapsed ancestor that hides it (the one
 * nearest the root), or the parent of a hidden cut branch it is in.
 * `null` if it does not exist or its whole tree is a hidden cut. Keeps the
 * selection on something visible after a collapse, a cut or an undo.
 */
export function visibleAncestor(state: TreeState, nodeId: NodeId): NodeId | null {
  if (!state.nodes[nodeId]) return null;
  // The path from the root down to the node.
  const path = [nodeId];
  for (let edge = parentEdgeOf(state, nodeId); edge; edge = parentEdgeOf(state, edge.source)) {
    path.unshift(edge.source);
  }
  for (let i = 0; i < path.length; i++) {
    if (isHiddenCut(state, path[i])) return i > 0 ? path[i - 1] : null;
    if (i < path.length - 1 && state.nodes[path[i]].collapsed) return path[i];
  }
  return nodeId;
}

export function setDirection(state: TreeState, direction: LayoutDirection): TreeState {
  return state.direction === direction ? state : { ...state, direction };
}

/** The edge leading into `nodeId` from its parent; `null` for the root. */
export function parentEdgeOf(state: TreeState, nodeId: NodeId): TreeEdge | null {
  for (const edge of Object.values(state.edges)) if (edge.target === nodeId) return edge;
  return null;
}

/** The nodes from the root down to `nodeId`, both included: the trail that
    led to it. Empty if `nodeId` does not exist. */
export function pathToNode(state: TreeState, nodeId: NodeId): NodeId[] {
  if (!state.nodes[nodeId]) return [];
  const path = [nodeId];
  for (let edge = parentEdgeOf(state, nodeId); edge; edge = parentEdgeOf(state, edge.source)) {
    path.unshift(edge.source);
  }
  return path;
}

/** `nodeId` and everything below it, collapsed or not. */
export function subtreeIds(state: TreeState, nodeId: NodeId): NodeId[] {
  const ids: NodeId[] = [];
  const stack = [nodeId];
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    ids.push(id);
    stack.push(...childrenOf(state, id));
  }
  return ids;
}

function omit<K extends string, V>(record: Readonly<Record<K, V>>, keys: Iterable<K>): Record<K, V> {
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}

/**
 * Deletes a node and its whole branch. A root cannot be deleted this way:
 * a whole tree goes to the trash instead (`trashTree`).
 */
export function deleteBranch(state: TreeState, nodeId: NodeId): TreeState {
  const incoming = parentEdgeOf(state, nodeId);
  if (!incoming || !state.nodes[nodeId]) return state;

  const removedNodes = subtreeIds(state, nodeId);
  const removedEdges = [incoming.id, ...removedNodes.flatMap((id) => state.childEdges[id] ?? [])];
  return {
    ...state,
    nodes: omit(state.nodes, removedNodes),
    edges: omit(state.edges, removedEdges),
    childEdges: {
      ...omit(state.childEdges, removedNodes),
      [incoming.source]: state.childEdges[incoming.source].filter((e) => e !== incoming.id),
    },
  };
}

/**
 * Deletes just one node (never a root: its children would have no place to
 * go; delete its branch instead): its children move up to take its place among its
 * parent's children, in the same order. Their own edge labels are kept; the
 * deleted node's incoming label goes with it.
 */
export function deleteNode(state: TreeState, nodeId: NodeId): TreeState {
  const incoming = parentEdgeOf(state, nodeId);
  if (!incoming || !state.nodes[nodeId]) return state;

  const parentId = incoming.source;
  const childEdges = state.childEdges[nodeId] ?? [];
  const edges = omit(state.edges, [incoming.id]);
  for (const edgeId of childEdges) edges[edgeId] = { ...edges[edgeId], source: parentId };

  const siblings = [...state.childEdges[parentId]];
  siblings.splice(siblings.indexOf(incoming.id), 1, ...childEdges);

  return {
    ...state,
    nodes: omit(state.nodes, [nodeId]),
    edges,
    childEdges: { ...omit(state.childEdges, [nodeId]), [parentId]: siblings },
  };
}

/**
 * Moves a node and its whole branch under `parentId`, at position `index`
 * among the parent's other children (counted without the moved node, and
 * clamped to the ends). The incoming edge moves with it, label and all.
 * Refused for a root, or a parent inside the moved branch (that would make
 * a loop). Moving into a folded node unfolds it, so the branch stays in
 * sight. Putting it back where it was returns the same state.
 */
export function moveBranch(state: TreeState, nodeId: NodeId, parentId: NodeId, index: number): TreeState {
  const incoming = parentEdgeOf(state, nodeId);
  const parent = state.nodes[parentId];
  if (!incoming || !parent || subtreeIds(state, nodeId).includes(parentId)) return state;

  const others = state.childEdges[parentId].filter((e) => e !== incoming.id);
  const at = Math.max(0, Math.min(index, others.length));
  const siblings = [...others.slice(0, at), incoming.id, ...others.slice(at)];
  const oldSiblings = state.childEdges[incoming.source];
  if (incoming.source === parentId && siblings.every((e, i) => e === oldSiblings[i])) return state;

  return {
    ...state,
    nodes: parent.collapsed ? { ...state.nodes, [parentId]: { ...parent, collapsed: false } } : state.nodes,
    edges: { ...state.edges, [incoming.id]: { ...incoming, source: parentId } },
    childEdges: {
      ...state.childEdges,
      [incoming.source]: oldSiblings.filter((e) => e !== incoming.id),
      [parentId]: siblings,
    },
  };
}

/**
 * Which node to select after `nodeId` is deleted: the next sibling, else
 * the previous one, else the parent -- so pressing Delete repeatedly clears
 * a row of siblings before climbing up the tree.
 */
export function neighbourAfterDelete(state: TreeState, nodeId: NodeId): NodeId | null {
  const incoming = parentEdgeOf(state, nodeId);
  if (!incoming) {
    // A root: the next root along the board, else the previous one.
    const index = state.roots.indexOf(nodeId);
    return state.roots[index + 1] ?? state.roots[index - 1] ?? null;
  }
  const siblings = state.childEdges[incoming.source];
  const index = siblings.indexOf(incoming.id);
  const neighbour = siblings[index + 1] ?? siblings[index - 1];
  return neighbour ? state.edges[neighbour].target : incoming.source;
}

/**
 * A copy of a whole tree with fresh node and edge ids, for "Duplicate
 * tree". Fresh ids keep every node unique across all trees, which matters
 * once nodes can be linked from other stones.
 */
export function cloneTree(state: TreeState): TreeState {
  const nodeIds = new Map<NodeId, NodeId>();
  const edgeIds = new Map<EdgeId, EdgeId>();
  for (const id of Object.keys(state.nodes) as NodeId[]) nodeIds.set(id, createNodeId());
  for (const id of Object.keys(state.edges) as EdgeId[]) edgeIds.set(id, createEdgeId());

  const nodes: Record<NodeId, TreeNode> = {};
  for (const node of Object.values(state.nodes)) {
    const id = nodeIds.get(node.id)!;
    nodes[id] = { ...node, id };
  }
  const edges: Record<EdgeId, TreeEdge> = {};
  for (const edge of Object.values(state.edges)) {
    const id = edgeIds.get(edge.id)!;
    edges[id] = { ...edge, id, source: nodeIds.get(edge.source)!, target: nodeIds.get(edge.target)! };
  }
  const childEdges: Record<NodeId, EdgeId[]> = {};
  for (const [id, list] of Object.entries(state.childEdges) as [NodeId, readonly EdgeId[]][]) {
    childEdges[nodeIds.get(id)!] = list.map((e) => edgeIds.get(e)!);
  }
  const roots = state.roots.map((id) => nodeIds.get(id)!);
  const trash = state.trash.map((entry) => ({ ...entry, rootId: nodeIds.get(entry.rootId)! }));
  return { roots, trash, nodes, edges, childEdges, direction: state.direction, hideCut: state.hideCut };
}

/** The root of the tree `nodeId` belongs to (itself for a root). */
export function rootOf(state: TreeState, nodeId: NodeId): NodeId {
  let id = nodeId;
  for (let edge = parentEdgeOf(state, id); edge; edge = parentEdgeOf(state, id)) id = edge.source;
  return id;
}

/**
 * "Fork branch to new tree": copies `nodeId` and everything below it
 * (titles, notes, colours, fold state, the labels inside the branch) into a
 * new tree placed right after the tree it came from. The copy gets fresh
 * ids and shares nothing with the original, which is left untouched. The
 * copied node becomes the new root, titled `title`; its incoming label is
 * not copied, since a root has no incoming line. Returns the new root's id.
 */
export function forkBranch(
  state: TreeState,
  nodeId: NodeId,
  title: string,
): { state: TreeState; nodeId: NodeId | null } {
  if (!state.nodes[nodeId]) return { state, nodeId: null };
  const at = state.roots.indexOf(rootOf(state, nodeId));
  // A branch of a trashed tree has nowhere on the board to go after.
  if (at === -1) return { state, nodeId: null };

  const ids = new Map<NodeId, NodeId>();
  for (const id of subtreeIds(state, nodeId)) ids.set(id, createNodeId());
  const nodes: Record<NodeId, TreeNode> = { ...state.nodes };
  const edges: Record<EdgeId, TreeEdge> = { ...state.edges };
  const childEdges: Record<NodeId, readonly EdgeId[]> = { ...state.childEdges };
  for (const [oldId, id] of ids) {
    nodes[id] = { ...state.nodes[oldId], id };
    childEdges[id] = (state.childEdges[oldId] ?? []).map((edgeId) => {
      const edge = state.edges[edgeId];
      const copy: TreeEdge = { ...edge, id: createEdgeId(), source: id, target: ids.get(edge.target)! };
      edges[copy.id] = copy;
      return copy.id;
    });
  }
  const root = ids.get(nodeId)!;
  nodes[root] = { ...nodes[root], title };

  return {
    nodeId: root,
    state: {
      ...state,
      roots: [...state.roots.slice(0, at + 1), root, ...state.roots.slice(at + 1)],
      nodes,
      edges,
      childEdges,
    },
  };
}

/** The name a forked tree starts with: "<tree name> — <node title>". A
    forked root is a copy of its whole tree, so it is "<tree name> (copy)",
    like Duplicate tree. */
export function forkTitle(state: TreeState, nodeId: NodeId): string {
  const root = rootOf(state, nodeId);
  const treeName = state.nodes[root]?.title || "Untitled";
  if (root === nodeId) return `${treeName} (copy)`;
  return `${treeName} — ${state.nodes[nodeId]?.title || "Untitled"}`;
}

/** Child node ids of `nodeId`, in sibling order. */
export function childrenOf(state: TreeState, nodeId: NodeId): NodeId[] {
  return (state.childEdges[nodeId] ?? []).map((edgeId) => state.edges[edgeId].target);
}

/**
 * Everything drawn on the canvas: nodes reachable from any root without
 * passing through a collapsed node or (with `hideCut`) a cut one, and the
 * edges between them, both in
 * depth-first sibling order, one root after the other (the layout relies on
 * that order to keep siblings where they were created).
 */
export function visibleSubtree(state: TreeState): { nodeIds: NodeId[]; edgeIds: EdgeId[] } {
  const nodeIds: NodeId[] = [];
  const edgeIds: EdgeId[] = [];
  const stack: NodeId[] = [...state.roots].reverse();
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    const node = state.nodes[id];
    if (!node || isHiddenCut(state, id)) continue;
    nodeIds.push(id);
    if (node.collapsed) continue;
    const edges = (state.childEdges[id] ?? []).filter((e) => !isHiddenCut(state, state.edges[e].target));
    edgeIds.push(...edges);
    // Pushed in reverse so the first child is popped (visited) first.
    for (let i = edges.length - 1; i >= 0; i--) stack.push(state.edges[edges[i]].target);
  }
  return { nodeIds, edgeIds };
}

/** Deletes several branches as one edit. A node already gone with an
    ancestor's branch is skipped. A root sends its tree to the trash (stamped
    `deletedAt`; without one, roots are left alone); the last tree stays. */
export function deleteBranches(state: TreeState, nodeIds: readonly NodeId[], deletedAt?: number): TreeState {
  return nodeIds.reduce((acc, id) => {
    if (!isRoot(acc, id)) return deleteBranch(acc, id);
    return deletedAt === undefined ? acc : trashTree(acc, id, deletedAt);
  }, state);
}

/** Sets a node's status; `null` clears it. */
export function setNodeStatus(state: TreeState, nodeId: NodeId, status: NodeStatus | null): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.status === status) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, status } } };
}

/** Sets the same status on several nodes; `null` clears it. */
export function setNodesStatus(
  state: TreeState,
  nodeIds: readonly NodeId[],
  status: NodeStatus | null,
): TreeState {
  return nodeIds.reduce((s, id) => setNodeStatus(s, id, status), state);
}

/** The X key: cuts every node given, or, if all of them already are,
    un-cuts them (back to no status). */
export function toggleCut(state: TreeState, nodeIds: readonly NodeId[]): TreeState {
  const present = nodeIds.filter((id) => state.nodes[id]);
  if (present.length === 0) return state;
  const allCut = present.every((id) => state.nodes[id].status === "cut");
  return setNodesStatus(state, present, allCut ? null : "cut");
}

/**
 * Every node on the board that looks cut: cut itself, or anywhere under a
 * cut node. (Trashed trees are not on the board, so not included.)
 * Worked out from the roots down in one pass, so it costs the same however
 * deep the tree is.
 */
export function cutNodeIds(state: TreeState): Set<NodeId> {
  const cut = new Set<NodeId>();
  const stack: [NodeId, boolean][] = state.roots.map((id) => [id, false]);
  let entry: [NodeId, boolean] | undefined;
  while ((entry = stack.pop()) !== undefined) {
    const [id, underCut] = entry;
    const node = state.nodes[id];
    if (!node) continue;
    const isCut = underCut || node.status === "cut";
    if (isCut) cut.add(id);
    for (const child of childrenOf(state, id)) stack.push([child, isCut]);
  }
  return cut;
}

/** Shows or hides the cut branches. */
export function setHideCut(state: TreeState, hideCut: boolean): TreeState {
  return state.hideCut === hideCut ? state : { ...state, hideCut };
}

/** Sets the same colour on several nodes; `null` clears it. */
export function setNodesColor(
  state: TreeState,
  nodeIds: readonly NodeId[],
  color: PaletteColor | null,
): TreeState {
  return nodeIds.reduce((s, id) => setNodeColor(s, id, color), state);
}

// ------------------------------------------------------------------ trash

/** How many deleted trees the trash keeps; the oldest is forgotten first.
    A cap, not a timer: "recently deleted" needs a bound, no more. */
export const TRASH_LIMIT = 10;

/** Removes a tree's nodes and edges for good. */
function purgeTree(state: TreeState, rootId: NodeId): TreeState {
  const removedNodes = subtreeIds(state, rootId);
  const removedEdges = removedNodes.flatMap((id) => state.childEdges[id] ?? []);
  return {
    ...state,
    nodes: omit(state.nodes, removedNodes),
    edges: omit(state.edges, removedEdges),
    childEdges: omit(state.childEdges, removedNodes),
  };
}

/**
 * Takes a whole tree off the board and into the trash. Refused for the last
 * tree: a board always keeps one. Past `TRASH_LIMIT` the oldest trashed
 * tree is deleted for good.
 */
export function trashTree(state: TreeState, rootId: NodeId, deletedAt: number): TreeState {
  if (!isRoot(state, rootId) || state.roots.length === 1) return state;
  let next: TreeState = {
    ...state,
    roots: state.roots.filter((id) => id !== rootId),
    trash: [...state.trash, { rootId, deletedAt }],
  };
  while (next.trash.length > TRASH_LIMIT) {
    const [oldest, ...rest] = next.trash;
    next = purgeTree({ ...next, trash: rest }, oldest.rootId);
  }
  return next;
}

/** Puts a trashed tree back on the board, after the other trees. */
export function restoreTree(state: TreeState, rootId: NodeId): TreeState {
  if (!state.trash.some((entry) => entry.rootId === rootId)) return state;
  return {
    ...state,
    roots: [...state.roots, rootId],
    trash: state.trash.filter((entry) => entry.rootId !== rootId),
  };
}

/** Deletes one trashed tree for good. */
export function purgeTrashedTree(state: TreeState, rootId: NodeId): TreeState {
  if (!state.trash.some((entry) => entry.rootId === rootId)) return state;
  return purgeTree({ ...state, trash: state.trash.filter((entry) => entry.rootId !== rootId) }, rootId);
}

/** Deletes every trashed tree for good. */
export function emptyTrash(state: TreeState): TreeState {
  if (state.trash.length === 0) return state;
  let next: TreeState = { ...state, trash: [] };
  for (const entry of state.trash) next = purgeTree(next, entry.rootId);
  return next;
}
