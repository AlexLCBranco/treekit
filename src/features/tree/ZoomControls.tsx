import { Minus, Plus } from "lucide-react";

import { ZOOM_MAX, ZOOM_MIN, zoomedIn, zoomedOut } from "../../domain/zoom";
import { useViewStore } from "../../store/viewStore";
import styles from "./ZoomControls.module.css";

/**
 * Zoom pill, like Boardkit's: "−  100%  +"; clicking the percentage resets
 * to 100%. It only sets the zoom in the view store; TreeCanvas applies it,
 * and the page grows or shrinks (scrollbars come and go) to match.
 */
export function ZoomControls() {
  const zoom = useViewStore((s) => s.zoom);
  const setZoom = useViewStore((s) => s.setZoom);

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setZoom(zoomedOut(zoom))}
        disabled={zoom <= ZOOM_MIN}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className={styles.value}
        onClick={() => setZoom(1)}
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => setZoom(zoomedIn(zoom))}
        disabled={zoom >= ZOOM_MAX}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
