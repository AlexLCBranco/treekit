import { Keyboard } from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Kbd, KbdGroup } from "../../components/ui/kbd";
import styles from "./ShortcutsDialog.module.css";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = isMac ? "⌘" : "Ctrl";

/** One row: what it does, and one or more alternative key combos for it. */
type Row = {
  readonly description: string;
  readonly combos: readonly (readonly string[])[];
};

type Group = {
  readonly title: string;
  readonly rows: readonly Row[];
};

// Keep in step with useTreeShortcuts.ts, which is what actually runs them.
const GROUPS: readonly Group[] = [
  {
    title: "Anywhere",
    rows: [
      { description: "Undo", combos: [[mod, "Z"]] },
      { description: "Redo", combos: [[mod, "Shift", "Z"], [mod, "Y"]] },
      { description: "Show these shortcuts", combos: [["?"]] },
    ],
  },
  {
    title: "With a node selected",
    rows: [
      { description: "Add a child", combos: [["Tab"]] },
      { description: "Rename", combos: [["Enter"], ["F2"]] },
      { description: "Label the line leading into it", combos: [["L"]] },
      { description: "Colour it (in the palette's order)", combos: [["1–8"]] },
      { description: "Clear its colour", combos: [["0"]] },
      { description: "Delete it and its branch", combos: [["Del"], ["Backspace"]] },
      { description: "Delete only it; its children move up", combos: [["Shift", "Del"]] },
      { description: "Clear the selection", combos: [["Esc"]] },
    ],
  },
  {
    title: "While typing",
    rows: [
      { description: "Save the name or label", combos: [["Enter"]] },
      { description: "Cancel the edit", combos: [["Esc"]] },
    ],
  },
  {
    title: "Mouse",
    rows: [
      { description: "Select a node", combos: [["Click"]] },
      { description: "Rename a node, or label a line", combos: [["Double-click"]] },
      { description: "Colour a node", combos: [["Right-click"]] },
      { description: "Pan the canvas", combos: [["Drag"]] },
      { description: "Zoom", combos: [["Scroll"]] },
    ],
  },
];

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
  );
}

/**
 * A keyboard button in the header that opens a read-only list of every
 * shortcut, like Boardkit's. Also opens with `?`. The open state is local:
 * only this component flips it, so it needs no store (Boardkit keeps one
 * because its `?` lives in a separate shortcut registry).
 */
export function ShortcutsDialog() {
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "?" && !event.ctrlKey && !event.metaKey && !isTyping(event.target)) {
        event.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={styles.trigger}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <Keyboard size={16} />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {GROUPS.map((group) => (
            <ShortcutList key={group.title} group={group} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutList({ group }: { readonly group: Group }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{group.title}</h3>
      <ul className="flex flex-col gap-1.5">
        {group.rows.map((row) => (
          <li key={row.description} className="flex items-center justify-between gap-4">
            <span className="text-foreground">{row.description}</span>
            <span className="flex shrink-0 items-center gap-1.5">
              {row.combos.map((combo, index) => (
                <Fragment key={combo.join("+")}>
                  {index > 0 && <span className="text-xs text-muted-foreground">or</span>}
                  <KbdGroup>
                    {combo.map((cap) => (
                      <Kbd key={cap}>{cap}</Kbd>
                    ))}
                  </KbdGroup>
                </Fragment>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
