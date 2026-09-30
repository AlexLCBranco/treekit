import { createEdgeId, createNodeId } from "./ids";
import type { EdgeId, LayoutDirection, NodeId, PaletteColor, TreeEdge, TreeNode, TreeState } from "./types";

/**
 * Pure tree operations. Each takes a `TreeState` and returns a new one,
 * copying only the slices it touches and leaving every other slice at its
 * existing reference -- so a component subscribed to an untouched slice
 * never re-renders, and (later) undo can store just the touched slices.
 */

function makeNode(title: string): TreeNode {
  return { id: createNodeId(), title, color: null, collapsed: false };
}

/** A fresh tree with just a root node, at the board's origin. */
export function createTree(rootTitle = "Decision", direction: LayoutDirection = "TB"): TreeState {
  const root = makeNode(rootTitle);
  return {
    roots: [{ id: root.id, x: 0, y: 0 }],
    nodes: { [root.id]: root },
    edges: {},
    childEdges: { [root.id]: [] },
    direction,
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
 * Starts another tree on the same board, with its root at (`x`, `y`).
 * Returns the new root's id (the UI selects it and opens it for naming).
 */
export function addRoot(state: TreeState, x: number, y: number, title = ""): { state: TreeState; nodeId: NodeId } {
  const root = makeNode(title);
  return {
    nodeId: root.id,
    state: {
      ...state,
      roots: [...state.roots, { id: root.id, x, y }],
      nodes: { ...state.nodes, [root.id]: root },
      childEdges: { ...state.childEdges, [root.id]: [] },
    },
  };
}

/** Whether `nodeId` starts one of the board's trees. */
export function isRoot(state: TreeState, nodeId: NodeId): boolean {
  return state.roots.some((root) => root.id === nodeId);
}

export function renameNode(state: TreeState, nodeId: NodeId, title: string): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.title === title) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, title } } };
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

/** How many nodes a collapsed node hides: everything below it. */
export function hiddenCount(state: TreeState, nodeId: NodeId): number {
  return state.nodes[nodeId] ? subtreeIds(state, nodeId).length - 1 : 0;
}

/**
 * The node itself if it is on screen, else the collapsed ancestor that
 * hides it (the one nearest the root), or `null` if it does not exist.
 * Keeps the selection on something visible after a collapse or an undo.
 */
export function visibleAncestor(state: TreeState, nodeId: NodeId): NodeId | null {
  if (!state.nodes[nodeId]) return null;
  let visible = nodeId;
  for (let edge = parentEdgeOf(state, nodeId); edge; edge = parentEdgeOf(state, edge.source)) {
    if (state.nodes[edge.source].collapsed) visible = edge.source;
  }
  return visible;
}

export function setDirection(state: TreeState, direction: LayoutDirection): TreeState {
  return state.direction === direction ? state : { ...state, direction };
}

/** The edge leading into `nodeId` from its parent; `null` for the root. */
export function parentEdgeOf(state: TreeState, nodeId: NodeId): TreeEdge | null {
  for (const edge of Object.values(state.edges)) if (edge.target === nodeId) return edge;
  return null;
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
 * Deletes a node and its whole branch. Deleting a root removes that whole
 * tree from the board -- except the last one: a board always keeps one root
 * (deleting everything else is "delete each child").
 */
export function deleteBranch(state: TreeState, nodeId: NodeId): TreeState {
  if (!state.nodes[nodeId]) return state;
  const removedNodes = subtreeIds(state, nodeId);
  const incoming = parentEdgeOf(state, nodeId);

  if (!incoming) {
    if (!isRoot(state, nodeId) || state.roots.length === 1) return state;
    const removedEdges = removedNodes.flatMap((id) => state.childEdges[id] ?? []);
    return {
      ...state,
      roots: state.roots.filter((root) => root.id !== nodeId),
      nodes: omit(state.nodes, removedNodes),
      edges: omit(state.edges, removedEdges),
      childEdges: omit(state.childEdges, removedNodes),
    };
  }

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
 * Which node to select after `nodeId` is deleted: the next sibling, else
 * the previous one, else the parent -- so pressing Delete repeatedly clears
 * a row of siblings before climbing up the tree.
 */
export function neighbourAfterDelete(state: TreeState, nodeId: NodeId): NodeId | null {
  const incoming = parentEdgeOf(state, nodeId);
  if (!incoming) {
    // A root: the next root along the board, else the previous one.
    const index = state.roots.findIndex((root) => root.id === nodeId);
    return (state.roots[index + 1] ?? state.roots[index - 1])?.id ?? null;
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
  const roots = state.roots.map((root) => ({ ...root, id: nodeIds.get(root.id)! }));
  return { roots, nodes, edges, childEdges, direction: state.direction };
}

/** Child node ids of `nodeId`, in sibling order. */
export function childrenOf(state: TreeState, nodeId: NodeId): NodeId[] {
  return (state.childEdges[nodeId] ?? []).map((edgeId) => state.edges[edgeId].target);
}

/**
 * Everything drawn on the canvas: nodes reachable from any root without
 * passing through a collapsed node, and the edges between them, both in
 * depth-first sibling order, one root after the other (the layout relies on
 * that order to keep siblings where they were created).
 */
export function visibleSubtree(state: TreeState): { nodeIds: NodeId[]; edgeIds: EdgeId[] } {
  const nodeIds: NodeId[] = [];
  const edgeIds: EdgeId[] = [];
  const stack: NodeId[] = state.roots.map((root) => root.id).reverse();
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    const node = state.nodes[id];
    if (!node) continue;
    nodeIds.push(id);
    if (node.collapsed) continue;
    const edges = state.childEdges[id] ?? [];
    edgeIds.push(...edges);
    // Pushed in reverse so the first child is popped (visited) first.
    for (let i = edges.length - 1; i >= 0; i--) stack.push(state.edges[edges[i]].target);
  }
  return { nodeIds, edgeIds };
}

/** Deletes several branches as one edit. A node already gone with an
    ancestor's branch is skipped; the last root still stays. */
export function deleteBranches(state: TreeState, nodeIds: readonly NodeId[]): TreeState {
  return nodeIds.reduce(deleteBranch, state);
}

/** Sets the same colour on several nodes; `null` clears it. */
export function setNodesColor(
  state: TreeState,
  nodeIds: readonly NodeId[],
  color: PaletteColor | null,
): TreeState {
  return nodeIds.reduce((s, id) => setNodeColor(s, id, color), state);
}
