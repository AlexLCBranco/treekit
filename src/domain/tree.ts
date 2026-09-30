import { createEdgeId, createNodeId } from "./ids";
import type { EdgeId, LayoutDirection, NodeId, TreeEdge, TreeNode, TreeState } from "./types";

/**
 * Pure tree operations. Each takes a `TreeState` and returns a new one,
 * copying only the slices it touches and leaving every other slice at its
 * existing reference -- so a component subscribed to an untouched slice
 * never re-renders, and (later) undo can store just the touched slices.
 */

function makeNode(title: string): TreeNode {
  return { id: createNodeId(), title, color: null, collapsed: false };
}

/** A fresh tree with just a root node. */
export function createTree(rootTitle = "Decision", direction: LayoutDirection = "TB"): TreeState {
  const root = makeNode(rootTitle);
  return {
    rootId: root.id,
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

export function renameNode(state: TreeState, nodeId: NodeId, title: string): TreeState {
  const node = state.nodes[nodeId];
  if (!node || node.title === title) return state;
  return { ...state, nodes: { ...state.nodes, [nodeId]: { ...node, title } } };
}

export function setDirection(state: TreeState, direction: LayoutDirection): TreeState {
  return state.direction === direction ? state : { ...state, direction };
}

/** Child node ids of `nodeId`, in sibling order. */
export function childrenOf(state: TreeState, nodeId: NodeId): NodeId[] {
  return (state.childEdges[nodeId] ?? []).map((edgeId) => state.edges[edgeId].target);
}

/**
 * Everything drawn on the canvas: nodes reachable from the root without
 * passing through a collapsed node, and the edges between them, both in
 * depth-first sibling order (the layout relies on that order to keep
 * siblings where they were created).
 */
export function visibleSubtree(state: TreeState): { nodeIds: NodeId[]; edgeIds: EdgeId[] } {
  const nodeIds: NodeId[] = [];
  const edgeIds: EdgeId[] = [];
  const stack: NodeId[] = [state.rootId];
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
