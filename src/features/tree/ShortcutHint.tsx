import { useTreeStore } from "../../store/treeStore";
import styles from "./ShortcutHint.module.css";

/**
 * A one-line reminder of what the keyboard does, changing with context:
 * nothing selected, or a node selected. Keeps the shortcuts discoverable
 * without a help dialog.
 */
export function ShortcutHint() {
  const hasSelection = useTreeStore((s) => s.selectedId !== null);
  const isRoot = useTreeStore((s) => s.selectedId === s.tree.rootId);

  const hints = hasSelection
    ? [
        ["Tab", "add child"],
        ["Enter", "rename"],
        ...(isRoot
          ? []
          : [
              ["Del", "delete branch"],
              ["Shift+Del", "delete node only"],
            ]),
      ]
    : [
        ["Click", "select a node"],
        ["Double-click", "rename"],
      ];

  return (
    <p className={styles.hint}>
      {hints.map(([key, action]) => (
        <span key={key}>
          <kbd className={styles.key}>{key}</kbd> {action}
        </span>
      ))}
    </p>
  );
}
