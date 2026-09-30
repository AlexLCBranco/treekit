import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { layoutTree, type Size } from "../../domain/layout";
import { visibleSubtree } from "../../domain/tree";
import type { NodeId } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import { LAYOUT_TWEEN_MS, TREE_LAYOUT } from "./layoutConfig";
import styles from "./TreeCanvas.module.css";
import { TreeNodeView, type TreeFlowNode } from "./TreeNodeView";
import { useAnimatedPositions } from "./useAnimatedPositions";
import { useTreeShortcuts } from "./useTreeShortcuts";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if this object changes identity between renders.
const nodeTypes = { tree: TreeNodeView };

/**
 * The tree on a pan/zoom canvas.
 *
 * Data flow, one direction only:
 *   store tree -> tidy-tree layout (+ measured node sizes) -> glide animation
 *   -> React Flow nodes/edges.
 * React Flow is used as a renderer and camera, not as the source of truth:
 * nodes are not draggable, because the auto-layout decides where they go.
 * The only thing read back from React Flow is each node's measured size,
 * which the layout needs (a long title makes a taller node).
 */
function TreeCanvasInner() {
  const tree = useTreeStore((s) => s.tree);
  const selectedId = useTreeStore((s) => s.selectedId);
  const select = useTreeStore((s) => s.select);
  const { fitView } = useReactFlow();

  useTreeShortcuts();

  // Measured sizes are view state, not tree data: they depend on fonts and
  // zoom-independent CSS, so they live here, never in the saved tree.
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(() => new Map());

  const { nodeIds, edgeIds } = useMemo(() => visibleSubtree(tree), [tree]);
  const allMeasured = nodeIds.every((id) => sizes.has(id));

  const targets = useMemo(() => layoutTree(tree, sizes, TREE_LAYOUT), [tree, sizes]);

  // The first layout snaps into place; from then on, every change glides.
  // (Set during render, React's pattern for state derived from earlier
  // renders: it re-renders immediately, without an extra effect pass.)
  const [hasSettled, setHasSettled] = useState(false);
  if (allMeasured && !hasSettled) setHasSettled(true);

  const parentOf = useCallback(
    (id: NodeId) => {
      for (const edge of Object.values(tree.edges)) if (edge.target === id) return edge.source;
      return null;
    },
    [tree.edges],
  );
  const positions = useAnimatedPositions(targets, parentOf, LAYOUT_TWEEN_MS, hasSettled);

  // Frame the tree once it first has real sizes, capped at 100% so a lone
  // root is not blown up to fill the screen.
  const didFit = useRef(false);
  useEffect(() => {
    if (!hasSettled || didFit.current) return;
    didFit.current = true;
    requestAnimationFrame(() => void fitView({ maxZoom: 1, padding: 0.3 }));
  }, [hasSettled, fitView]);

  const nodes = useMemo<TreeFlowNode[]>(
    () =>
      nodeIds.map((id) => ({
        id,
        type: "tree",
        position: positions.get(id) ?? targets.get(id) ?? { x: 0, y: 0 },
        data: {},
        selected: id === selectedId,
        draggable: false,
        // Handing React Flow back the size it measured (normally done by
        // `applyNodeChanges`): these node objects are rebuilt every render,
        // and without it React Flow forgets the measurement -- and with it
        // where the handles are, so it can no longer draw the edges.
        measured: sizes.get(id),
        // Until measured, React Flow hides a node. An initial guess keeps a
        // new node visible, so its rename field can take focus at once.
        initialWidth: TREE_LAYOUT.fallbackSize.width,
        initialHeight: TREE_LAYOUT.fallbackSize.height,
      })),
    [nodeIds, positions, targets, selectedId, sizes],
  );



  const edges = useMemo<Edge[]>(
    () =>
      edgeIds.map((edgeId) => {
        const edge = tree.edges[edgeId];
        return {
          id: edgeId,
          source: edge.source,
          target: edge.target,
          type: "smoothstep",
          pathOptions: { borderRadius: 10 },
          selectable: false,
        };
      }),
    [edgeIds, tree.edges],
  );

  const onNodesChange = useCallback((changes: NodeChange<TreeFlowNode>[]) => {
    setSizes((prev) => {
      let next: Map<NodeId, Size> | null = null;
      for (const change of changes) {
        if (change.type !== "dimensions" || !change.dimensions) continue;
        const id = change.id as NodeId;
        const { width, height } = change.dimensions;
        const old = prev.get(id);
        if (old && old.width === width && old.height === height) continue;
        next ??= new Map(prev);
        next.set(id, { width, height });
      }
      return next ?? prev;
    });
  }, []);

  return (
    <div className={styles.canvas}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => select(node.id as NodeId)}
        onPaneClick={() => select(null)}
        nodesConnectable={false}
        nodesDraggable={false}
        // Double-click renames a node; zooming on it would fight that.
        zoomOnDoubleClick={false}
        // Tab is "add child" here, not React Flow's focus-cycling.
        disableKeyboardA11y
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        // Bottom-right belongs to the version badge.
        attributionPosition="top-right"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dots)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}

export function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner />
    </ReactFlowProvider>
  );
}
