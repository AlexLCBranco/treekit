import { useEffect, useRef } from "react";

/** How long a point of the trail stays visible, and how thick its head is. */
const TRAIL_MS = 900;
const HEAD_WIDTH = 5;

interface Point {
  x: number;
  y: number;
  t: number;
}

/**
 * The laser cursor: while the pointer is held down over the canvas, it leaves
 * a red trail that fades out. Drawn on a canvas laid over the pane (which
 * ignores the mouse), listening on the host element instead so the wheel
 * still scrolls and zooms underneath. Nothing here touches the tree.
 */
export function LaserTrail() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Read once from the design tokens (a canvas can't use var()).
    const color = getComputedStyle(host).getPropertyValue("--palette-red").trim() || "red";
    let points: Point[] = [];
    let drawing = false;
    let frame = 0;

    const local = (e: PointerEvent): Point => {
      const box = host.getBoundingClientRect();
      return { x: e.clientX - box.left, y: e.clientY - box.top, t: performance.now() };
    };

    const paint = () => {
      frame = 0;
      const dpr = window.devicePixelRatio || 1;
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const now = performance.now();
      points = points.filter((p) => now - p.t < TRAIL_MS);
      ctx.strokeStyle = color;
      ctx.lineCap = "round";
      for (let i = 1; i < points.length; i++) {
        const life = 1 - (now - points[i].t) / TRAIL_MS;
        ctx.globalAlpha = life;
        ctx.lineWidth = HEAD_WIDTH * life + 1;
        ctx.beginPath();
        ctx.moveTo(points[i - 1].x, points[i - 1].y);
        ctx.lineTo(points[i].x, points[i].y);
        ctx.stroke();
      }
      if (points.length || drawing) frame = requestAnimationFrame(paint);
    };
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drawing = true;
      points.push(local(e));
      kick();
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing) return;
      points.push(local(e));
      kick();
    };
    const onUp = () => {
      drawing = false;
    };

    host.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      cancelAnimationFrame(frame);
      host.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }} />;
}
