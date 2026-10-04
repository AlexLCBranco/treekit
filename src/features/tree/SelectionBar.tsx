import { ChevronDown, ChevronsDownUp, ChevronsUpDown, Trash2, X } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { NODE_STATUSES, PALETTE_COLORS, type NodeStatus, type PaletteColor } from "../../domain/types";
import { selectionOf, useTreeStore } from "../../store/treeStore";
import styles from "./SelectionBar.module.css";
import { STATUS_META } from "./statusMeta";

const NONE = "none";
/** Shown when the picked nodes differ, so no radio item is ticked. */
const MIXED = "mixed";

/** The value shared by every item, `MIXED` if they differ. */
function common<T>(values: readonly T[]): T | typeof MIXED {
  return values.every((v) => v === values[0]) ? values[0] : MIXED;
}

/**
 * Actions for a marquee group, floating above the cursor tools while two or
 * more nodes are picked (like Figma's or Excalidraw's selection toolbar):
 * colour, status, fold / unfold and delete, each one undo step for the whole
 * group. The same things the keys (1–8, X, Space, Del) and the right-click
 * menu already do, made visible so they can be found without knowing them.
 *
 * Subscribes with `useShallow` to a small summary of the group (count,
 * shared colour and status, what can fold), so it re-renders only when that
 * summary changes, not on every edit elsewhere in the tree.
 */
export function SelectionBar() {
  const summary = useTreeStore(
    useShallow((s) => {
      const ids = selectionOf(s);
      const nodes = ids.map((id) => s.tree.nodes[id]);
      const foldable = nodes.filter((n) => (s.tree.childEdges[n.id]?.length ?? 0) > 0);
      return {
        count: ids.length,
        color: common(nodes.map((n) => n.color ?? NONE)),
        status: common(nodes.map((n) => n.status ?? NONE)),
        canFold: foldable.length > 0,
        allFolded: foldable.length > 0 && foldable.every((n) => n.collapsed),
      };
    }),
  );
  const { setNodesColor, setNodesStatus, toggleCollapsedNodes, deleteBranches, select } = useTreeStore(
    useShallow((s) => ({
      setNodesColor: s.setNodesColor,
      setNodesStatus: s.setNodesStatus,
      toggleCollapsedNodes: s.toggleCollapsedNodes,
      deleteBranches: s.deleteBranches,
      select: s.select,
    })),
  );
  if (summary.count < 2) return null;

  // Read at click time, so an action always gets the group as it is now.
  const group = () => selectionOf(useTreeStore.getState());

  return (
    <div className={styles.bar} role="toolbar" aria-label="Selected nodes">
      <span className={styles.count}>{summary.count} selected</span>
      <span className={styles.divider} aria-hidden />

      <DropdownMenu>
        <DropdownMenuTrigger className={styles.colorTrigger} aria-label="Colour" title="Colour — 1–8, 0 clears">
          <span
            className={styles.swatch}
            data-none={summary.color === NONE || undefined}
            data-mixed={summary.color === MIXED || undefined}
            style={
              summary.color !== NONE && summary.color !== MIXED
                ? { background: `var(--palette-${summary.color})` }
                : undefined
            }
            aria-hidden
          />
          <ChevronDown size={12} aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" sideOffset={8} className="w-44">
          <DropdownMenuRadioGroup
            value={summary.color}
            onValueChange={(value) => setNodesColor(group(), value === NONE ? null : (value as PaletteColor))}
          >
            <DropdownMenuRadioItem value={NONE}>
              <span className="size-3 rounded-full border border-border" aria-hidden />
              None
              <DropdownMenuShortcut>0</DropdownMenuShortcut>
            </DropdownMenuRadioItem>
            {PALETTE_COLORS.map((swatch, index) => (
              <DropdownMenuRadioItem key={swatch} value={swatch}>
                <span className="size-3 rounded-full" style={{ background: `var(--palette-${swatch})` }} aria-hidden />
                {swatch.charAt(0).toUpperCase() + swatch.slice(1)}
                <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className={styles.divider} aria-hidden />

      {/* Toggles: pressed when every picked node has that status; pressing
          it again clears the status from all of them. */}
      {NODE_STATUSES.map((option) => {
        const { label, icon: Icon } = STATUS_META[option];
        const on = summary.status === option;
        return (
          <button
            key={option}
            type="button"
            className={styles.button}
            aria-pressed={on}
            title={on ? `Clear ${label.toLowerCase()}` : `Mark all ${label.toLowerCase()}${option === "cut" ? " — X" : ""}`}
            onClick={() => setNodesStatus(group(), on ? null : (option as NodeStatus))}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        );
      })}
      <span className={styles.divider} aria-hidden />

      <button
        type="button"
        className={styles.iconButton}
        disabled={!summary.canFold}
        aria-label={summary.allFolded ? "Expand branches" : "Collapse branches"}
        title={`${summary.allFolded ? "Expand" : "Collapse"} branches — Space`}
        onClick={() => toggleCollapsedNodes(group())}
      >
        {summary.allFolded ? <ChevronsUpDown size={16} aria-hidden /> : <ChevronsDownUp size={16} aria-hidden />}
      </button>
      <button
        type="button"
        className={styles.iconButton}
        data-danger
        aria-label={`Delete ${summary.count} branches`}
        title={`Delete ${summary.count} branches — Del`}
        onClick={() => deleteBranches(group())}
      >
        <Trash2 size={16} aria-hidden />
      </button>
      <span className={styles.divider} aria-hidden />

      <button
        type="button"
        className={styles.iconButton}
        aria-label="Clear selection"
        title="Clear selection — Esc"
        onClick={() => select(null)}
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
