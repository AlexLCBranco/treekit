import { Panel, useReactFlow, useStore } from "@xyflow/react";
import { Minus, Plus } from "lucide-react";

import styles from "./ZoomControls.module.css";

/**
 * Zoom pill: "−  100%  +". Clicking the percentage resets to 100%.
 * Reads only the zoom factor from React Flow's store, so it re-renders on
 * zoom changes and nothing else.
 */
export function ZoomControls() {
  const zoom = useStore((s) => s.transform[2]);
  const minZoom = useStore((s) => s.minZoom);
  const maxZoom = useStore((s) => s.maxZoom);
  const { zoomIn, zoomOut, zoomTo } = useReactFlow();

  return (
    <Panel position="bottom-left" className={styles.panel}>
      <button
        type="button"
        className={styles.button}
        onClick={() => void zoomOut({ duration: 150 })}
        disabled={zoom <= minZoom}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className={styles.value}
        onClick={() => void zoomTo(1, { duration: 150 })}
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={() => void zoomIn({ duration: 150 })}
        disabled={zoom >= maxZoom}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={14} />
      </button>
    </Panel>
  );
}
