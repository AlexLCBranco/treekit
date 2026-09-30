import { Redo2, Undo2 } from "lucide-react";

import { useTreeStore } from "../../store/treeStore";
import styles from "./HistoryButtons.module.css";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl+";

/** Undo / redo, for mouse users; the keyboard shortcuts do the same. */
export function HistoryButtons() {
  // Booleans, not the history itself, so these buttons re-render only when
  // one flips between enabled and disabled.
  const canUndo = useTreeStore((s) => s.history.past.length > 0);
  const canRedo = useTreeStore((s) => s.history.future.length > 0);
  const undo = useTreeStore((s) => s.undo);
  const redo = useTreeStore((s) => s.redo);

  return (
    <div className={styles.group}>
      <button
        type="button"
        className={styles.button}
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        title={`Undo (${mod}Z)`}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className={styles.button}
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        title={`Redo (${mod}Shift+Z)`}
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}
