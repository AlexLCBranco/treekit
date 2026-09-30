import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { layoutTree, type Size } from "../../domain/layout";
import { alignViewport } from "../../domain/navigation";
import { parentEdgeOf, visibleSubtree } from "../../domain/tree";
import type { EdgeId, NodeId } from "../../domain/types";
import { selectionOf, useTreeStore } from "../../store/treeStore";
import { useViewStore } from "../../store/viewStore";
import { FRAME_MARGIN, FRAME_PAN_MS, LAYOUT_TWEEN_MS, TREE_LAYOUT } from "./layoutConfig";
import { NodeContextMenu } from "./NodeContextMenu";
import styles from "./TreeCanvas.module.css";
import { TreeEdgeView, type TreeFlowEdge } from "./TreeEdgeView";
import { TreeNodeView, type TreeFlowNode } from "./TreeNodeView";
import { useAnimatedPositions } from "./useAnimatedPositions";
import { useTreeShortcuts } from "./useTreeShortcuts";
import { LaserTrail } from "./LaserTrail";
import { ToolPicker } from "./ToolPicker";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if this object changes identity between renders.
const nodeTypes = { tree: TreeNodeView };
const edgeTypes = { tree: TreeEdgeView };

/**
 * The tree on a fixed, one-screen page: no panning or zooming. The camera
 * is locked and refits the whole tree to the screen after every change.
 *
 * Data flow, one direction only:
 *   store tree -> tidy-tree layout (+ measured node sizes) -> glide animation
 *   -> React Flow nodes/edges.
 * React Flow is used as a renderer, not as the source of truth:
 * nodes are not draggable, because the auto-layout decides where they go.
 * The only thing read back from React Flow is each node's measured size,
 * which the layout needs (a long title makes a taller node).
 */
function TreeCanvasInner() {
  const tree = useTreeStore((s) => s.tree);
  const selectedId = useTreeStore((s) => s.selectedId);
  const selectedIds = useTreeStore((s) => s.selectedIds);
  // The whole group, for highlighting (`selectedId` alone drives the camera).
  const selectedSet = useMemo(
    () => new Set(selectedId && selectedIds.includes(selectedId) ? selectedIds : selectedId ? [selectedId] : []),
    [selectedId, selectedIds],
  );
  const select = useTreeStore((s) => s.select);
  const addRoot = useTreeStore((s) => s.addRoot);
  const startEditingLabel = useTreeStore((s) => s.startEditingLabel);
  const tool = useViewStore((s) => s.tool);
  const { setViewport, screenToFlowPosition } = useReactFlow();
  // The pane's size, so the tree refits when the window is resized.
  const paneWidth = useStore((s) => s.width);
  const paneHeight = useStore((s) => s.height);

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

  // Put the whole tree on the page as the Align panel says, never zoomed in
  // past 100%, shrunk only as far as needed to fit. Runs after every change
  // (edit, direction, alignment, window size), so the page never scrolls.
  const alignment = useViewStore((s) => s.alignment);
  const applied = useViewStore((s) => s.applied);
  const didFit = useRef(false);
  useEffect(() => {
    if (!hasSettled || paneWidth === 0 || paneHeight === 0) return;
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
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const view = alignViewport(bounds, { width: paneWidth, height: paneHeight }, alignment, FRAME_MARGIN, 1);
    // The first fit snaps (after a frame, so React Flow has its size); the
    // rest glide together with the nodes.
    const first = !didFit.current;
    didFit.current = true;
    if (first) requestAnimationFrame(() => void setViewport(view, { duration: 0 }));
    else void setViewport(view, { duration: FRAME_PAN_MS });
  }, [hasSettled, targets, sizes, alignment, applied, paneWidth, paneHeight, setViewport]);

  const nodes = useMemo<TreeFlowNode[]>(
    () =>
      nodeIds.map((id) => ({
        id,
        type: "tree",
        position: positions.get(id) ?? targets.get(id) ?? { x: 0, y: 0 },
        data: {},
        selected: selectedSet.has(id),
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
    [nodeIds, positions, targets, selectedSet, sizes],
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
    // The marquee: React Flow reports which nodes its box now covers as
    // "select" changes; turn them into the store's group selection.
    const picks = changes.filter((c) => c.type === "select");
    if (picks.length > 0) {
      const store = useTreeStore.getState();
      const group = new Set(selectionOf(store));
      for (const change of picks) {
        if (change.type !== "select") continue;
        if (change.selected) group.add(change.id as NodeId);
        else group.delete(change.id as NodeId);
      }
      store.selectMany([...group]);
    }
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

  // Double-clicking empty canvas starts another tree. Trees always sit side
  // by side, so the click does not place it: it only decides where in the
  // row it goes -- after every tree whose middle is before the click. Clicks
  // on a node, a line, a button or the zoom pill are not on the pane, so
  // they keep their own meaning.
  const onCanvasDoubleClick = (event: MouseEvent) => {
    if (!(event.target as HTMLElement).classList.contains("react-flow__pane")) return;
    const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const click = tree.direction === "TB" ? point.x : point.y;
    const before = tree.roots.filter((id) => {
      const p = targets.get(id);
      if (!p) return false;
      const size = sizes.get(id) ?? TREE_LAYOUT.fallbackSize;
      const middle = tree.direction === "TB" ? p.x + size.width / 2 : p.y + size.height / 2;
      return middle < click;
    });
    addRoot(before.length);
  };

  return (
    <NodeContextMenu>
      <div className={styles.canvas} data-tool={tool}>
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
          // Drag means: draw a marquee (select) or laser. Nothing pans.
          panOnDrag={false}
          selectionOnDrag={tool === "select"}
          nodesConnectable={false}
          nodesDraggable={false}
          // Double-click renames a node; zooming on it would fight that.
          zoomOnDoubleClick={false}
          // The camera is locked: the tree is fitted to the screen instead.
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          preventScrolling={false}
          // Tab is "add child" here, not React Flow's focus-cycling.
          disableKeyboardA11y
          // Space is "collapse/expand" here. React Flow would otherwise use
          // holding Space as "drag to pan", which plain drag already does.
          panActivationKeyCode={null}
          deleteKeyCode={null}
          minZoom={0.01}
          maxZoom={1}
          // Bottom-right belongs to the version badge.
          attributionPosition="top-right"
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dots)" />
          <ToolPicker />
          {tool === "laser" && <LaserTrail />}
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
