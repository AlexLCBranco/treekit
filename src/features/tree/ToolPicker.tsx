import { Crosshair, MousePointer2, type LucideIcon } from "lucide-react";

import { useViewStore, type Tool } from "../../store/viewStore";
import styles from "./ToolPicker.module.css";

const TOOLS: { value: Tool; label: string; key: string; Icon: LucideIcon }[] = [
  { value: "select", label: "Select", key: "V", Icon: MousePointer2 },
  { value: "laser", label: "Laser pointer", key: "K", Icon: Crosshair },
];

/** Cursor tools like Excalidraw's presentation mode: select, laser. */
export function ToolPicker() {
  const tool = useViewStore((s) => s.tool);
  const setTool = useViewStore((s) => s.setTool);

  return (
    <div className={styles.panel} role="radiogroup" aria-label="Cursor tool">
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
    </div>
  );
}
