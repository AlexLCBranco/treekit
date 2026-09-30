import { Panel } from "@xyflow/react";
import { Crosshair, Hand, MousePointer2, type LucideIcon } from "lucide-react";

import { useViewStore, type Tool } from "../../store/viewStore";
import styles from "./ToolPicker.module.css";

const TOOLS: { value: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { value: "hand", label: "Hand (pan only)", key: "H", Icon: Hand },
  { value: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { value: "laser", label: "Laser pointer", key: "K", Icon: Crosshair },
];

/** Cursor tools like Excalidraw's presentation mode: hand, select, laser. */
export function ToolPicker() {
  const tool = useViewStore((s) => s.tool);
  const setTool = useViewStore((s) => s.setTool);

  return (
    <Panel position="bottom-center" className={styles.panel} role="radiogroup" aria-label="Cursor tool">
      {TOOLS.map(({ value, label, key, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={tool === value}
          aria-label={label}
          title={`${label} — ${key}`}
          className={styles.tool}
          onClick={() => setTool(value)}
        >
          <Icon size={16} />
        </button>
      ))}
    </Panel>
  );
}
