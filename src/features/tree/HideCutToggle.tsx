import { EyeOff } from "lucide-react";

import { cutIdsOf, useTreeStore } from "../../store/treeStore";
import styles from "./HideCutToggle.module.css";

/**
 * "Hide cut branches": takes cut branches off the page the way folding
 * does (the layout closes the gap) instead of showing them greyed out.
 * Saved with the board, and an undo step like the direction toggle. While
 * on, it is the way back to a hidden branch, so it shows how many cut
 * branches there are.
 */
export function HideCutToggle() {
  const hideCut = useTreeStore((s) => s.tree.hideCut);
  // Branches cut on the board: nodes cut themselves, not their descendants.
  const cutCount = useTreeStore((s) => {
    let count = 0;
    for (const id of cutIdsOf(s.tree)) if (s.tree.nodes[id].status === "cut") count++;
    return count;
  });
  const setHideCut = useTreeStore((s) => s.setHideCut);

  return (
    <button
      type="button"
      className={styles.toggle}
      aria-pressed={hideCut}
      aria-label="Hide cut branches"
      onClick={() => setHideCut(!hideCut)}
      title={hideCut ? "Show cut branches (greyed out)" : "Hide cut branches"}
    >
      <EyeOff size={14} aria-hidden />
      {/* Short, so the header still fits the tree name on narrow screens. */}
      Hide cut
      {cutCount > 0 && <span className={styles.count}>{cutCount}</span>}
    </button>
  );
}
