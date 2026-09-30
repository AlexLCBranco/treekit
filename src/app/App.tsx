import { DirectionToggle } from "../features/tree/DirectionToggle";
import { TreeCanvas } from "../features/tree/TreeCanvas";
import styles from "./App.module.css";
import { VersionBadge } from "./VersionBadge";

/**
 * Page chrome only: a header and the area the canvas fills. It knows nothing
 * about nodes or edges, so the canvas can later be embedded elsewhere (the
 * gauntlet) without changes here.
 */
export function App() {
  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Treekit</h1>
        <DirectionToggle />
      </header>
      <main className={styles.main}>
        <TreeCanvas />
      </main>
      <VersionBadge />
    </div>
  );
}
