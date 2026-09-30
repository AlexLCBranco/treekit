import { getSmoothStepPath, Position } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";

import inlineStyles from "../../components/InlineEditable.module.css";
import { layoutTree, type Size } from "../../domain/layout";
import { expandAll, visibleSubtree } from "../../domain/tree";
import type { EdgeId, NodeId, TreeState } from "../../domain/types";
import { TREE_LAYOUT } from "../tree/layoutConfig";
import edgeStyles from "../tree/TreeEdgeView.module.css";
import nodeStyles from "../tree/TreeNodeView.module.css";

/** Empty space around the tree, in CSS pixels. */
const MARGIN = 40;
const SVG_NS = "http://www.w3.org/2000/svg";

export type ImageFormat = "png" | "svg";

/**
 * Draws the whole tree (folded branches unfolded) as a PNG or SVG data URL.
 *
 * The canvas can't be snapshotted directly: it shows only what is on screen
 * and folded branches are not in the page at all. So this builds a clean
 * copy off-screen -- no buttons, no selection, no dot grid -- out of plain DOM
 * elements that reuse the canvas's own CSS classes, so it looks the same.
 * Plain DOM rather than React because the steps must run in order and
 * synchronously: put the boxes on the page, measure them, lay them out, then
 * move them. (The measure-then-layout dance is the same one the canvas does
 * through React Flow.)
 */
export async function renderTreeImage(tree: TreeState, format: ImageFormat): Promise<string> {
  const full = expandAll(tree);
  const { nodeIds, edgeIds } = visibleSubtree(full);
  const vertical = full.direction === "TB";

  const stage = document.createElement("div");
  // Off-screen but still laid out (display:none would measure as zero).
  stage.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  document.body.append(stage);

  try {
    // 1. Boxes, unpositioned, so they can be measured at their natural size.
    const nodeEls = new Map<NodeId, HTMLElement>();
    for (const id of nodeIds) {
      const node = full.nodes[id];
      const el = document.createElement("div");
      el.className = nodeStyles.node;
      el.dataset.direction = full.direction;
      if (id === full.rootId) el.dataset.root = "";
      if (node.color) {
        el.dataset.colored = "true";
        el.style.setProperty("--node-accent", `var(--palette-${node.color})`);
      }
      el.style.position = "absolute";
      const title = document.createElement("span");
      title.className = `${inlineStyles.display} ${nodeStyles.title}`;
      title.textContent = node.title || "Untitled";
      el.append(title);
      stage.append(el);
      nodeEls.set(id, el);
    }
    const labelEls = new Map<EdgeId, HTMLElement>();
    for (const edgeId of edgeIds) {
      const label = full.edges[edgeId].label;
      if (!label) continue;
      const el = document.createElement("div");
      el.className = edgeStyles.label;
      el.textContent = label;
      stage.append(el);
      labelEls.set(edgeId, el);
    }

    const sizes = new Map<NodeId, Size>();
    for (const [id, el] of nodeEls) sizes.set(id, { width: el.offsetWidth, height: el.offsetHeight });
    const labelSizes = new Map<EdgeId, Size>();
    for (const [id, el] of labelEls) labelSizes.set(id, { width: el.offsetWidth, height: el.offsetHeight });

    // 2. The same layout the canvas uses, then the bounding box of the result.
    const { positions, routes } = layoutTree(full, sizes, TREE_LAYOUT, labelSizes);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, p] of positions) {
      const s = sizes.get(id)!;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + s.width);
      maxY = Math.max(maxY, p.y + s.height);
    }
    // A label wider than its node can stick out past the edge of the tree.
    for (const edgeId of labelEls.keys()) {
      const target = full.edges[edgeId].target;
      const p = positions.get(target)!;
      const s = sizes.get(target)!;
      const l = labelSizes.get(edgeId)!;
      if (vertical) {
        minX = Math.min(minX, p.x + s.width / 2 - l.width / 2);
        maxX = Math.max(maxX, p.x + s.width / 2 + l.width / 2);
      } else {
        minY = Math.min(minY, p.y + s.height / 2 - l.height / 2);
        maxY = Math.max(maxY, p.y + s.height / 2 + l.height / 2);
      }
    }
    const shiftX = MARGIN - minX;
    const shiftY = MARGIN - minY;
    const at = (id: NodeId) => {
      const p = positions.get(id)!;
      return { x: p.x + shiftX, y: p.y + shiftY };
    };

    // 3. Scene: a positioned box holding an SVG for lines, then the nodes and labels.
    const scene = document.createElement("div");
    const width = maxX - minX + MARGIN * 2;
    const height = maxY - minY + MARGIN * 2;
    scene.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden;`;
    scene.style.background = "var(--surface-app)";
    scene.style.fontFamily = getComputedStyle(document.body).fontFamily;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.cssText = "position:absolute;left:0;top:0;overflow:visible;";
    scene.append(svg);

    const labelPositions: { el: HTMLElement; x: number; y: number }[] = [];
    for (const edgeId of edgeIds) {
      const { source, target } = full.edges[edgeId];
      const route = routes.get(edgeId)!;
      const s = at(source);
      const sSize = sizes.get(source)!;
      const t = at(target);
      const tSize = sizes.get(target)!;
      const sourceX = vertical ? s.x + sSize.width / 2 : s.x + sSize.width;
      const sourceY = vertical ? s.y + sSize.height : s.y + sSize.height / 2;
      const targetX = vertical ? t.x + tSize.width / 2 : t.x;
      const targetY = vertical ? t.y : t.y + tSize.height / 2;
      const [d] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition: vertical ? Position.Bottom : Position.Right,
        targetX,
        targetY,
        targetPosition: vertical ? Position.Top : Position.Left,
        borderRadius: 10,
        ...(vertical
          ? { centerY: sourceY + route.bendAfterSource }
          : { centerX: sourceX + route.bendAfterSource }),
      });
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.style.stroke = "var(--edge-stroke)";
      path.style.strokeWidth = "1";
      svg.append(path);

      const labelEl = labelEls.get(edgeId);
      if (labelEl) {
        labelPositions.push({
          el: labelEl,
          x: vertical ? targetX : targetX - route.labelBeforeTarget,
          y: vertical ? targetY - route.labelBeforeTarget : targetY,
        });
      }
    }

    for (const [id, el] of nodeEls) {
      const p = at(id);
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      scene.append(el);
    }
    for (const { el, x, y } of labelPositions) {
      el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      scene.append(el);
    }
    stage.append(scene);

    const options = {
      width,
      height,
      backgroundColor: getComputedStyle(scene).backgroundColor,
      // Twice the pixels, so text stays sharp when zoomed or printed.
      pixelRatio: 2,
    };
    return format === "png" ? await toPng(scene, options) : await toSvg(scene, options);
  } finally {
    stage.remove();
  }
}
