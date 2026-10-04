import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  ViewportPortal,
  type NodeChange,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";

import { dropPlacement, dropSpotAt, type DropSpot } from "../../domain/drop";
import { layoutTree, type Point, type Size } from "../../domain/layout";
import { contains, labelRect, marqueeGroup } from "../../domain/marquee";
import { placeOnPage, scrollToReveal, type Rect } from "../../domain/navigation";
import { ZOOM_MAX, ZOOM_MIN } from "../../domain/zoom";
import { isRoot, parentEdgeOf, subtreeIds, visibleSubtree } from "../../domain/tree";
import type { EdgeId, NodeId } from "../../domain/types";
import { selectionOf, useTreeStore } from "../../store/treeStore";
import { useViewStore } from "../../store/viewStore";
import { FRAME_MARGIN, FRAME_MARGINS, FRAME_PAN_MS, LAYOUT_TWEEN_MS, TREE_LAYOUT } from "./layoutConfig";
import { NodeContextMenu } from "./NodeContextMenu";
import { SelectionBar } from "./SelectionBar";
import styles from "./TreeCanvas.module.css";
import { TreeEdgeView, type TreeFlowEdge } from "./TreeEdgeView";
import { TreeNodeView, type TreeFlowNode } from "./TreeNodeView";
import { useAnimatedPositions } from "./useAnimatedPositions";
import { useTreeShortcuts } from "./useTreeShortcuts";
import { LaserTrail } from "./LaserTrail";
import { ToolPicker } from "./ToolPicker";
import { ZoomControls } from "./ZoomControls";

// Defined once at module level: React Flow warns (and re-mounts every
// node) if this object changes identity between renders.
const nodeTypes = { tree: TreeNodeView };
const edgeTypes = { tree: TreeEdgeView };

/**
 * The trees on a page like Boardkit's: no panning; zoomed only by the zoom pill.
 * The page is the size of the screen and scrolls natively where it is bigger.
 *
 * Data flow, one direction only:
 *   store tree -> tidy-tree layout (+ measured node sizes) -> glide animation
 *   -> React Flow nodes/edges.
 * React Flow is used as a renderer, not as the source of truth: the
 * auto-layout decides where nodes go. Dragging a node does not place it;
 * it moves the node's branch in the tree (see the drag section below).
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
  const moveBranch = useTreeStore((s) => s.moveBranch);
  const { setViewport, screenToFlowPosition } = useReactFlow();

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
  const { positions: settled, glideFrom } = useAnimatedPositions(targets, parentOf, LAYOUT_TWEEN_MS, hasSettled);

  // Dragging a node, like a card in Boardkit: its branch follows the
  // pointer, and the drop moves the branch in the tree. React Flow does the
  // pointer tracking and reports where the node would be; the branch is
  // drawn shifted by that much, and `spot` is where it would land (only
  // set where dropping changes something). Dropping elsewhere puts it back.
  const [drag, setDrag] = useState<{
    readonly id: NodeId;
    readonly branch: ReadonlySet<NodeId>;
    readonly start: Point;
    readonly offset: Point;
    readonly spot: DropSpot | null;
  } | null>(null);
  const positions = useMemo(() => {
    if (!drag) return settled;
    const shifted = new Map(settled);
    for (const id of drag.branch) {
      const p = settled.get(id);
      if (p) shifted.set(id, { x: p.x + drag.offset.x, y: p.y + drag.offset.y });
    }
    return shifted;
  }, [settled, drag]);

  // Where the layout puts every node: what a drop is aimed at.
  const rects = useMemo(() => {
    const map = new Map<NodeId, Rect>();
    for (const [id, p] of targets) map.set(id, { ...p, ...(sizes.get(id) ?? TREE_LAYOUT.fallbackSize) });
    return map;
  }, [targets, sizes]);

  const onNodeDragStart: OnNodeDrag<TreeFlowNode> = (_, node) => {
    const id = node.id as NodeId;
    const start = settled.get(id);
    if (!start || isRoot(tree, id)) return;
    setDrag({ id, branch: new Set(subtreeIds(tree, id)), start, offset: { x: 0, y: 0 }, spot: null });
  };

  const onNodeDrag: OnNodeDrag<TreeFlowNode> = (event, node) => {
    if (!drag || node.id !== drag.id) return;
    const pointer = "touches" in event ? event.touches[0] : event;
    if (!pointer) return;
    const at = screenToFlowPosition({ x: pointer.clientX, y: pointer.clientY });
    const spot = dropSpotAt(tree, drag.id, at, rects, DROP_REACH);
    const target = spot && dropPlacement(tree, drag.id, spot) ? spot : null;
    setDrag((d) => d && { ...d, offset: { x: node.position.x - d.start.x, y: node.position.y - d.start.y }, spot: target });
  };

  const onNodeDragStop: OnNodeDrag<TreeFlowNode> = () => {
    if (!drag) return;
    // Everything glides on from where it was let go: to its new place, or
    // back to the old one.
    const dropped = new Map<NodeId, Point>();
    for (const id of drag.branch) {
      const p = positions.get(id);
      if (p) dropped.set(id, p);
    }
    glideFrom(dropped);
    const placement = drag.spot && dropPlacement(tree, drag.id, drag.spot);
    if (placement) moveBranch(drag.id, placement.parentId, placement.index);
    setDrag(null);
  };

  // The visible part of the page (the scroll container minus its
  // scrollbars), measured by hand: React Flow now measures the whole page.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<Size | null>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const observer = new ResizeObserver(() =>
      setScreen((prev) =>
        prev && prev.width === scroller.clientWidth && prev.height === scroller.clientHeight
          ? prev
          : { width: scroller.clientWidth, height: scroller.clientHeight },
      ),
    );
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // The page, as in Boardkit: the tree at 100%, placed as the Align panel
  // says. The page is the screen's size, and grows (scrollbars appear) only
  // where the tree does not fit. Recomputed after every change (edit,
  // direction, alignment, window size).
  const alignment = useViewStore((s) => s.alignment);
  const zoom = useViewStore((s) => s.zoom);
  const page = useMemo(() => {
    if (!hasSettled || !screen || screen.width === 0 || screen.height === 0) return null;
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
    if (minX === Infinity) return null;
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    return placeOnPage(bounds, screen, alignment, FRAME_MARGINS, zoom);
  }, [hasSettled, screen, targets, sizes, alignment, zoom]);

  // Move the tree onto the page. The first placement snaps (after a frame,
  // so React Flow has its size); the rest glide together with the nodes.
  const didPlace = useRef(false);
  useEffect(() => {
    if (!page) return;
    const view = { x: page.x, y: page.y, zoom };
    const first = !didPlace.current;
    didPlace.current = true;
    if (first) requestAnimationFrame(() => void setViewport(view, { duration: 0 }));
    else void setViewport(view, { duration: FRAME_PAN_MS });
  }, [page, zoom, setViewport]);

  // Keep the selected node on screen when the page scrolls: arrow keys, a
  // new child or a rename can land it past the edge. Not while a marquee
  // picks a group (scrolling mid-drag would shift the box under the mouse).
  const groupSize = selectedIds.length;
  useEffect(() => {
    const scroller = scrollerRef.current;
    const p = selectedId ? targets.get(selectedId) : undefined;
    if (!scroller || !page || !selectedId || !p || groupSize > 1) return;
    const size = sizes.get(selectedId) ?? TREE_LAYOUT.fallbackSize;
    const view = {
      left: scroller.scrollLeft,
      top: scroller.scrollTop,
      width: scroller.clientWidth,
      height: scroller.clientHeight,
    };
    const target = {
      x: p.x * zoom + page.x,
      y: p.y * zoom + page.y,
      width: size.width * zoom,
      height: size.height * zoom,
    };
    const to = scrollToReveal(target, view, FRAME_MARGIN / 2);
    if (to.left !== view.left || to.top !== view.top) scroller.scrollTo({ ...to, behavior: "smooth" });
  }, [selectedId, groupSize, targets, sizes, page, zoom]);

  const nodes = useMemo<TreeFlowNode[]>(
    () =>
      nodeIds.map((id) => ({
        id,
        type: "tree",
        position: positions.get(id) ?? targets.get(id) ?? { x: 0, y: 0 },
        data: drag?.branch.has(id)
          ? LIFTED
          : drag?.spot?.kind === "child" && drag.spot.nodeId === id
            ? DROP_TARGET
            : NO_DATA,
        selected: selectedSet.has(id),
        // Roots stay put: a tree can't become a branch of another.
        draggable: tool === "select" && !tree.roots.includes(id),
        // The dragged branch floats above everything else.
        zIndex: drag?.branch.has(id) ? 1 : 0,
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
    [nodeIds, positions, targets, selectedSet, sizes, drag, tool, tree.roots],
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

  // The marquee. React Flow only checks nodes against its box, so the group
  // is worked out here instead, from the box itself: every node it holds,
  // plus the node of every label it holds (a label belongs to its node).
  const marquee = useStore((s) => (s.userSelectionActive ? s.userSelectionRect : null));
  const transform = useStore((s) => s.transform);
  useEffect(() => {
    if (!marquee) return;
    const [tx, ty, scale] = transform;
    const box = {
      x: (marquee.x - tx) / scale,
      y: (marquee.y - ty) / scale,
      width: marquee.width / scale,
      height: marquee.height / scale,
    };
    const rectOf = (id: NodeId) => {
      const p = positions.get(id);
      return p ? { ...p, ...(sizes.get(id) ?? TREE_LAYOUT.fallbackSize) } : null;
    };
    const picked = new Set<NodeId>();
    for (const id of nodeIds) {
      const rect = rectOf(id);
      if (rect && contains(box, rect)) picked.add(id);
    }
    for (const edgeId of edgeIds) {
      const target = tree.edges[edgeId].target;
      const size = labelSizes.get(edgeId);
      const route = routes.get(edgeId);
      const rect = rectOf(target);
      if (!size || !route || !rect) continue;
      if (contains(box, labelRect(rect, size, route.labelBeforeTarget, tree.direction))) picked.add(target);
    }
    const store = useTreeStore.getState();
    store.selectMany(marqueeGroup(selectionOf(store), picked));
  }, [marquee, transform, nodeIds, edgeIds, positions, sizes, labelSizes, routes, tree]);

  const onNodesChange = useCallback((changes: NodeChange<TreeFlowNode>[]) => {
    // Only measured sizes are read back. React Flow's "select" changes are
    // ignored: the marquee is handled above, clicks by onNodeClick.
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
        <div ref={scrollerRef} className={styles.scroller}>
          <div className={styles.page} style={page ? { width: page.width, height: page.height } : undefined}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onNodeDragStart={onNodeDragStart}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              // A click that wobbles a few pixels is still a click.
              nodeDragThreshold={4}
              // Picking a node up doesn't select it; dropping it does.
              selectNodesOnDrag={false}
              autoPanOnNodeDrag={false}
              onNodeClick={(_, node) => select(node.id as NodeId)}
              onEdgeClick={(_, edge) => select(edge.target as NodeId)}
              onEdgeDoubleClick={(_, edge) => startEditingLabel(edge.id as EdgeId)}
              onPaneClick={() => select(null)}
              onDoubleClick={onCanvasDoubleClick}
              // Drag means: draw a marquee (select) or laser. Nothing pans.
              panOnDrag={false}
              selectionOnDrag={tool === "select"}
              // React Flow would slide the camera when a marquee nears the
              // edge; here the camera never moves, the page scrolls instead.
              autoPanOnSelection={false}
              nodesConnectable={false}
              // Double-click renames a node; zooming on it would fight that.
              zoomOnDoubleClick={false}
              // The camera is locked; the wheel scrolls the page natively.
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
              minZoom={ZOOM_MIN}
              maxZoom={ZOOM_MAX}
              // Bottom-right belongs to the version badge.
              attributionPosition="top-right"
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--canvas-dots)" />
              {drag?.spot && drag.spot.kind !== "child" && (
                <SiblingDropLine spot={drag.spot} rect={rects.get(drag.spot.nodeId)} vertical={tree.direction === "TB"} />
              )}
            </ReactFlow>
          </div>
        </div>
        {/* Outside the scrolling page, so they stay put on the screen. */}
        <div className={styles.dock}>
          <SelectionBar />
          <ToolPicker />
        </div>
        <ZoomControls />
        {tool === "laser" && <LaserTrail />}
      </div>
    </NodeContextMenu>
  );
}

/** Node `data` while dragging: the dragged branch is lifted, and the node
    it would drop into (as a child) is the drop target. Shared objects, so a
    node's data only changes identity when its role does. */
const LIFTED = { lifted: true };
/** A pointer in the gap beside a node aims at it as a sibling; in the
    space where its children go (a rank gap plus a node), as their parent. */
const DROP_REACH = {
  sibling: TREE_LAYOUT.nodeGap,
  child: TREE_LAYOUT.rankGap + TREE_LAYOUT.fallbackSize.width,
};
const DROP_TARGET = { dropTarget: true };
const NO_DATA = {};

/**
 * Where a dragged branch would slot in as a sibling: a line in the gap
 * before or after the node, as long as the node is deep.
 */
function SiblingDropLine({ spot, rect, vertical }: { spot: DropSpot; rect: Rect | undefined; vertical: boolean }) {
  if (!rect) return null;
  const half = TREE_LAYOUT.nodeGap / 2;
  const before = spot.kind === "before";
  const style = vertical
    ? { left: before ? rect.x - half : rect.x + rect.width + half, top: rect.y, height: rect.height }
    : { left: rect.x, top: before ? rect.y - half : rect.y + rect.height + half, width: rect.width };
  return (
    <ViewportPortal>
      <div className={styles.dropLine} data-direction={vertical ? "TB" : "LR"} style={style} />
    </ViewportPortal>
  );
}

export function TreeCanvas() {
  return (
    <ReactFlowProvider>
      <TreeCanvasInner />
    </ReactFlowProvider>
  );
}
