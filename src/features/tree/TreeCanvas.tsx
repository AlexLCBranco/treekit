import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { layoutTree, type Size } from "../../domain/layout";
import { alignViewport, revealViewport } from "../../domain/navigation";
import { parentEdgeOf, visibleSubtree } from "../../domain/tree";
import type { EdgeId, NodeId } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import { useViewStore } from "../../store/viewStore";
import { FRAME_MARGIN, LAYOUT_TWEEN_MS, REVEAL_MARGIN, REVEAL_PAN_MS, TREE_LAYOUT } from "./layoutConfig";
import { NodeContextMenu } from "./NodeContextMenu";
import styles from "./TreeCanvas.module.css";
import { TreeEdgeView, type TreeFlowEdge } from "./TreeEdgeView";
import { TreeNodeView, type TreeFlowNode } from "./TreeNodeView";
import { useAnimatedPositions } from "./useAnimatedPositions";
import { useTreeShortcuts } from "./useTreeShortcuts";
import { ZoomControls } from "./ZoomControls";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if this object changes identity between renders.
const nodeTypes = { tree: TreeNodeView };
const edgeTypes = { tree: TreeEdgeView };

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
  const addRoot = useTreeStore((s) => s.addRoot);
  const startEditingLabel = useTreeStore((s) => s.startEditingLabel);
  const { getViewport, setViewport, screenToFlowPosition } = useReactFlow();
  // React Flow's own store, read (not subscribed to) for the pane's size.
  const flowStore = useStoreApi();

  useTreeShortcuts();

  // Measured sizes are view state, not tree data: they depend on fonts and
  // zoom-independent CSS, so they live here, never in the saved tree.
  const [sizes, setSizes] = useState<ReadonlyMap<NodeId, Size>>(() => new Map());
  // Same for edge labels, which React Flow does not measure: each label
  // reports its own size (see TreeEdgeView).
  const [labelSizes, setLabelSizes] = useState<ReadonlyMap<EdgeId, Size>>(() => new Map());
  const onLabelSize = useCallback((edgeId: EdgeId, size: Size | null) => {
    setLabelSizes((prev) => {
      const old = prev.get(edgeId);
      if (size ? old && old.width === size.width && old.height === size.height : !old) return prev;
      const next = new Map(prev);
      if (size) next.set(edgeId, size);
      else next.delete(edgeId);
      return next;
    });
  }, []);

  const { nodeIds, edgeIds } = useMemo(() => visibleSubtree(tree), [tree]);
  const allMeasured = nodeIds.every((id) => sizes.has(id));

  const { positions: targets, routes } = useMemo(
    () => layoutTree(tree, sizes, TREE_LAYOUT, labelSizes),
    [tree, sizes, labelSizes],
  );

  // The first layout snaps into place; from then on, every change glides.
  // (Set during render, React's pattern for state derived from earlier
  // renders: it re-renders immediately, without an extra effect pass.)
  const [hasSettled, setHasSettled] = useState(false);
  if (allMeasured && !hasSettled) setHasSettled(true);

  const parentOf = useCallback((id: NodeId) => parentEdgeOf(tree, id)?.source ?? null, [tree]);
  const positions = useAnimatedPositions(targets, parentOf, LAYOUT_TWEEN_MS, hasSettled);

  // Put the whole tree against the page as the Align panel says, never
  // zoomed in past 100%. Reads the alignment at call time so it always
  // follows the latest choice.
  const frame = useCallback(
    (duration: number) => {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [id, p] of targets) {
        const size = sizes.get(id) ?? TREE_LAYOUT.fallbackSize;
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x + size.width);
        maxY = Math.max(maxY, p.y + size.height);
      }
      if (minX === Infinity) return;
      const { width, height } = flowStore.getState();
      const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      const { alignment } = useViewStore.getState();
      void setViewport(alignViewport(bounds, { width, height }, alignment, FRAME_MARGIN, 1), { duration });
    },
    [setViewport, flowStore, targets, sizes],
  );

  // Frame the tree once it first has real sizes, capped at 100% so a lone
  // root is not blown up to fill the screen.
  const didFit = useRef(false);
  // The selected node the camera last brought into view (see below).
  const revealedId = useRef<NodeId | null>(null);
  useEffect(() => {
    if (!hasSettled || didFit.current) return;
    didFit.current = true;
    // The fit shows the whole tree, selection included; revealing it too
    // would pan from the not-yet-fitted camera and fight the fit.
    revealedId.current = useTreeStore.getState().selectedId;
    requestAnimationFrame(() => frame(0));
  }, [hasSettled, frame]);

  // Pressing an Align icon re-frames the tree with a glide (the first
  // frame above handles page load).
  const applied = useViewStore((s) => s.applied);
  const lastApplied = useRef(applied);
  useEffect(() => {
    if (lastApplied.current === applied) return;
    lastApplied.current = applied;
    if (hasSettled) frame(REVEAL_PAN_MS);
  }, [applied, hasSettled, frame]);

  // Keep the selection in view: when a different node gets selected (arrow
  // keys, a new child, the selection moving after a delete or undo), pan
  // just far enough to show it. Only on a *change* of selection, so panning
  // away from a selected node by hand is not undone by the next re-layout.
  // Uses the node's target position, not its gliding one, so the camera
  // heads straight for where the node will end up.
  useEffect(() => {
    if (!selectedId) revealedId.current = null;
    if (!hasSettled || !selectedId || selectedId === revealedId.current) return;
    revealedId.current = selectedId;
    const position = targets.get(selectedId);
    if (!position) return;
    const { width, height } = flowStore.getState();
    const size = sizes.get(selectedId) ?? TREE_LAYOUT.fallbackSize;
    const next = revealViewport(getViewport(), { width, height }, position, size, REVEAL_MARGIN);
    if (next) void setViewport(next, { duration: REVEAL_PAN_MS });
  }, [selectedId, hasSettled, targets, sizes, flowStore, getViewport, setViewport]);

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

  const edges = useMemo<TreeFlowEdge[]>(
    () =>
      edgeIds.map((edgeId) => {
        const edge = tree.edges[edgeId];
        return {
          id: edgeId,
          source: edge.source,
          target: edge.target,
          type: "tree",
          data: { route: routes.get(edgeId)!, onLabelSize },
          // Not selectable on its own: clicking a line selects the node it
          // leads to (see onEdgeClick), since a label belongs to that node.
          selectable: false,
        };
      }),
    [edgeIds, tree.edges, routes, onLabelSize],
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

  // Double-clicking empty canvas starts another tree there, its first node
  // centred under the pointer. Clicks that land on a node, a line, a button
  // or the zoom pill are not on the pane, so they keep their own meaning.
  const onCanvasDoubleClick = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).classList.contains("react-flow__pane")) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const { width, height } = TREE_LAYOUT.fallbackSize;
    // A root's position is where its tree grows from: top-centre top-down,
    // left-middle left-right. Nudge so the new node's middle is the click.
    addRoot(...(tree.direction === "TB" ? [point.x, point.y - height / 2] : [point.x - width / 2, point.y]) as [number, number]);
  };

  return (
    <NodeContextMenu>
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => select(node.id as NodeId)}
          onEdgeClick={(_, edge) => select(edge.target as NodeId)}
          onEdgeDoubleClick={(_, edge) => startEditingLabel(edge.id as EdgeId)}
          onPaneClick={() => select(null)}
          onDoubleClick={onCanvasDoubleClick}
          nodesConnectable={false}
          nodesDraggable={false}
          // Double-click renames a node; zooming on it would fight that.
          zoomOnDoubleClick={false}
          // The wheel scrolls the canvas up/down (Shift = sideways); zoom
          // lives on the zoom controls and Ctrl/Cmd + wheel or pinch.
          panOnScroll
          zoomOnScroll={false}
          // Tab is "add child" here, not React Flow's focus-cycling.
          disableKeyboardA11y
          // Space is "collapse/expand" here. React Flow would otherwise use
          // holding Space as "drag to pan", which plain drag already does.
          panActivationKeyCode={null}
          deleteKeyCode={null}
          minZoom={0.2}
          maxZoom={2}
          // Bottom-right belongs to the version badge.
          attributionPosition="top-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dots)" />
          <ZoomControls />
        </ReactFlow>
      </div>
    </NodeContextMenu>
  );
}

export function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner />
    </ReactFlowProvider>
  );
}
