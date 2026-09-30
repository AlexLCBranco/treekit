import { ExportMenu } from "../features/export/ExportMenu";
import { NotesPanel } from "../features/notes/NotesPanel";
import { AlignPanel } from "../features/tree/AlignPanel";
import { DirectionToggle } from "../features/tree/DirectionToggle";
import { HistoryButtons } from "../features/tree/HistoryButtons";
import { ShortcutsDialog } from "../features/tree/ShortcutsDialog";
import { TreeCanvas } from "../features/tree/TreeCanvas";
import { TrashPanel } from "../features/trash/TrashPanel";
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
        <AlignPanel />
        <div className={styles.spacer} />
        <TrashPanel />
        <ExportMenu />
        <ShortcutsDialog />
      </header>
      <main className={styles.main}>
        {/* Keyed by tree: switching trees remounts the canvas, so measured
            sizes, the glide animation and the camera all start fresh
            instead of animating one tree into another. */}
        <TreeCanvas key={treeId} />
        <NotesPanel />
      </main>
      <VersionBadge />
    </div>
  );
}
