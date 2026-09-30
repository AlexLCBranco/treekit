import type { LayoutDirection } from "../../domain/types";
import { useTreeStore } from "../../store/treeStore";
import styles from "./DirectionToggle.module.css";

const OPTIONS: { value: LayoutDirection; label: string }[] = [
  { value: "TB", label: "Top-down" },
  { value: "LR", label: "Left-right" },
];

/** Switches which way the tree grows. The layout re-runs and nodes glide. */
export function DirectionToggle() {
  const direction = useTreeStore((s) => s.tree.direction);
  const setDirection = useTreeStore((s) => s.setDirection);

  return (
    <div className={styles.group} role="radiogroup" aria-label="Layout direction">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={direction === option.value}
          className={styles.option}
          onClick={() => setDirection(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
