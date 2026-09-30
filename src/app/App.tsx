import { DirectionToggle } from "../features/tree/DirectionToggle";
import { HistoryButtons } from "../features/tree/HistoryButtons";
import { ShortcutsDialog } from "../features/tree/ShortcutsDialog";
import { TreeCanvas } from "../features/tree/TreeCanvas";
import { TreeSwitcher } from "../features/trees/TreeSwitcher";
import { useTreeStore } from "../store/treeStore";
import styles from "./App.module.css";
import { VersionBadge } from "./VersionBadge";

/**
 * Page chrome only: a header and the area the canvas fills. It knows nothing
 * about nodes or edges, so the canvas can later be embedded elsewhere (the
 * gauntlet) without changes here.
 */
export function App() {
  const treeId = useTreeStore((s) => s.treeId);
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <TreeSwitcher />
        <HistoryButtons />
        <DirectionToggle />
        <div className={styles.spacer} />
        <ShortcutsDialog />
      </header>
      <main className={styles.main}>
        {/* Keyed by tree: switching trees remounts the canvas, so measured
            sizes, the glide animation and the camera all start fresh
            instead of animating one tree into another. */}
        <TreeCanvas key={treeId} />
      </main>
      <VersionBadge />
    </div>
  );
}
