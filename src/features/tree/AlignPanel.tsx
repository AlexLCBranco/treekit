import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  type LucideIcon,
} from "lucide-react";
import { Popover } from "radix-ui";

import { resolveAlignment, type Align } from "../../domain/layout";
import { useTreeStore } from "../../store/treeStore";
import { useViewStore } from "../../store/viewStore";
import styles from "./AlignPanel.module.css";

const ROWS: { axis: "x" | "y"; options: { value: Align; label: string; Icon: LucideIcon }[] }[] = [
  {
    axis: "x",
    options: [
      { value: "start", label: "Align left", Icon: AlignHorizontalJustifyStart },
      { value: "center", label: "Align centre horizontally", Icon: AlignHorizontalJustifyCenter },
      { value: "end", label: "Align right", Icon: AlignHorizontalJustifyEnd },
    ],
  },
  {
    axis: "y",
    options: [
      { value: "start", label: "Align top", Icon: AlignVerticalJustifyStart },
      { value: "center", label: "Align middle", Icon: AlignVerticalJustifyCenter },
      { value: "end", label: "Align bottom", Icon: AlignVerticalJustifyEnd },
    ],
  },
];

/**
 * Excalidraw-style Align panel. Top row: how parents sit over their
 * children (top-down) or how columns line up (left-right) horizontally;
 * bottom row: the same vertically. The layout re-runs and nodes glide.
 */
export function AlignPanel() {
  const direction = useTreeStore((s) => s.tree.direction);
  const alignment = useViewStore((s) => s.alignment);
  const setAlign = useViewStore((s) => s.setAlign);
  const current = resolveAlignment(direction, alignment);

  return (
    <Popover.Root>
      <Popover.Trigger className={styles.trigger}>Align</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={styles.panel} align="start" sideOffset={6}>
          <div className={styles.title}>Align</div>
          {ROWS.map(({ axis, options }) => (
            <div key={axis} className={styles.row} role="radiogroup" aria-label={axis === "x" ? "Horizontal" : "Vertical"}>
              {options.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={current[axis] === value}
                  aria-label={label}
                  title={label}
                  className={styles.option}
                  onClick={() => setAlign(axis, value)}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
