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

import type { Align } from "../../domain/navigation";
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
 * Excalidraw-style Align panel for the whole tree against the page. Top row:
 * flush left / centred / flush right; bottom row: top / middle / bottom.
 * The camera glides to the chosen spot.
 */
export function AlignPanel() {
  const alignment = useViewStore((s) => s.alignment);
  const setAlign = useViewStore((s) => s.setAlign);
  const current = alignment;

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
