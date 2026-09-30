/** Zoom steps, the same as Boardkit's: 50% to 200% in 10% steps. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

/** Keeps a zoom inside the range, rounded to whole percents so repeated
    steps never drift (in floating point, 0.1 + 0.2 is 0.30000000000000004). */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

export function zoomedIn(zoom: number): number {
  return clampZoom(zoom + ZOOM_STEP);
}

export function zoomedOut(zoom: number): number {
  return clampZoom(zoom - ZOOM_STEP);
}
