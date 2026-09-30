import { useViewStore, type Alignment } from "../../store/viewStore";
import styles from "./DirectionToggle.module.css";

const OPTIONS: { value: Alignment; label: string }[] = [
  { value: "center", label: "Centre" },
  { value: "start", label: "Top-left" },
];

/** Where the tree sits on the page. Reuses the direction toggle's look. */
export function AlignmentToggle() {
  const alignment = useViewStore((s) => s.alignment);
  const setAlignment = useViewStore((s) => s.setAlignment);

  return (
    <div className={styles.group} role="radiogroup" aria-label="Tree alignment">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={alignment === option.value}
          className={styles.option}
          onClick={() => setAlignment(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
