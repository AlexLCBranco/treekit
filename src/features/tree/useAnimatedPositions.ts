import { useCallback, useEffect, useRef, useState } from "react";

import type { Point } from "../../domain/layout";
import type { NodeId } from "../../domain/types";

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * Glides nodes from where they were to where the layout now puts them.
 *
 * Why in JS instead of a CSS `transition` on the node: React Flow draws each
 * edge from its nodes' positions. A CSS transition would move the node box
 * smoothly but leave its edges jumping straight to the end. Feeding
 * interpolated positions through React Flow keeps edges attached for the
 * whole glide.
 *
 * A node with no previous position starts from its nearest ancestor that
 * has one (`parentOf`), so a new child grows out of its parent, and a whole
 * re-expanded branch grows out of the node that was expanded.
 *
 * `glideFrom` puts some nodes somewhere else first (where a dragged branch
 * was dropped) and glides everything to the layout from there, whether or
 * not the layout changed.
 */
export function useAnimatedPositions(
  targets: ReadonlyMap<NodeId, Point>,
  parentOf: (id: NodeId) => NodeId | null,
  durationMs: number,
  /** False snaps straight to the targets (e.g. the very first layout). */
  enabled: boolean,
): { positions: ReadonlyMap<NodeId, Point>; glideFrom: (from: ReadonlyMap<NodeId, Point>) => void } {
  const [current, setCurrent] = useState<ReadonlyMap<NodeId, Point>>(targets);
  // Mirrors `current` for the effect below, which must start each glide
  // from wherever nodes are right now without re-running on every frame.
  const currentRef = useRef(current);
  // Bumped by `glideFrom` to start a glide when the targets stay the same.
  const [kick, setKick] = useState(0);

  const glideFrom = useCallback((from: ReadonlyMap<NodeId, Point>) => {
    const next = new Map(currentRef.current);
    for (const [id, p] of from) next.set(id, p);
    currentRef.current = next;
    setCurrent(next);
    setKick((k) => k + 1);
  }, []);

  useEffect(() => {
    const show = (next: ReadonlyMap<NodeId, Point>) => {
      currentRef.current = next;
      setCurrent(next);
    };

    const from = new Map<NodeId, Point>();
    for (const [id, target] of targets) {
      let ancestor = parentOf(id);
      while (ancestor && !currentRef.current.has(ancestor)) ancestor = parentOf(ancestor);
      from.set(
        id,
        currentRef.current.get(id) ?? (ancestor && currentRef.current.get(ancestor)) ?? target,
      );
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = !enabled || reduceMotion ? 0 : durationMs;

    let frame = 0;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - startTime) / duration);
      if (t >= 1) {
        show(targets);
        return;
      }
      const k = easeOut(t);
      const next = new Map<NodeId, Point>();
      for (const [id, to] of targets) {
        const f = from.get(id)!;
        next.set(id, { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k });
      }
      show(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    // A new layout mid-glide cancels this one; the next glide starts from
    // wherever the nodes are right now, so nothing ever jumps.
    return () => cancelAnimationFrame(frame);
    // `parentOf` is only consulted when `targets` changes, which is always
    // the same render in which it changes.
  }, [targets, durationMs, enabled, kick]); // eslint-disable-line react-hooks/exhaustive-deps

  return { positions: current, glideFrom };
}
