import { useRef, useState } from "react";

import styles from "./InlineEditable.module.css";

interface InlineEditableProps {
  readonly value: string;
  /** Controlled by the parent: on a canvas, what opens an edit (double-click,
      Enter, "add child") is decided outside this field. */
  readonly editing: boolean;
  readonly onCommit: (value: string) => void;
  /** Called when editing ends, committed or cancelled. */
  readonly onDone: () => void;
  readonly ariaLabel: string;
  readonly placeholder?: string;
  readonly className?: string;
}

/**
 * Click-to-edit text, adapted from Boardkit's `InlineEditable`. Generic: it
 * knows nothing about trees. Enter commits, Shift+Enter adds a line break,
 * Esc cancels, clicking away commits.
 *
 * The edit field is its own component, mounted only while editing. Its
 * draft starts from `value` on mount, so every edit begins fresh with no
 * effect needed to reset it.
 */
export function InlineEditable({ value, editing, className, placeholder, ...rest }: InlineEditableProps) {
  if (editing) {
    return <EditField value={value} className={className} placeholder={placeholder} {...rest} />;
  }
  return (
    <span className={[styles.display, !value && styles.placeholder, className].filter(Boolean).join(" ")}>
      {value || placeholder}
    </span>
  );
}

/**
 * The textarea. Draft is local state, not store state: it is transient and
 * belongs to one field, and writing every keystroke to Zustand would
 * re-render every subscriber.
 *
 * Autosizing uses Boardkit's pure-CSS trick: an invisible `::after` in the
 * same grid cell mirrors the text via `attr(data-value)`, so the field grows
 * with no measuring code.
 *
 * `nodrag nopan nowheel` are React Flow's opt-out classes: inside the field,
 * a press places the caret instead of panning the canvas.
 */
function EditField({
  value,
  onCommit,
  onDone,
  ariaLabel,
  placeholder,
  className,
}: Omit<InlineEditableProps, "editing">) {
  const [draft, setDraft] = useState(value);
  // Set once the edit has ended, so the blur that follows Enter/Esc (as the
  // textarea unmounts) does not commit a second time.
  const finishedRef = useRef(false);

  function finish(commit: boolean) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const trimmed = draft.trim();
    if (commit && trimmed !== value) onCommit(trimmed);
    onDone();
  }

  return (
    <span
      className={[styles.autosize, className].filter(Boolean).join(" ")}
      data-value={draft || placeholder || " "}
    >
      <textarea
        // Focus and select-all on mount, so typing replaces the old title.
        ref={(el) => {
          if (el && !finishedRef.current && document.activeElement !== el) {
            el.focus();
            el.select();
          }
        }}
        className={`${styles.textarea} nodrag nopan nowheel`}
        value={draft}
        rows={1}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          // Keep every key local: canvas shortcuts (Tab = add child, ...)
          // must not fire while typing.
          event.stopPropagation();
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            finish(true);
          } else if (event.key === "Escape") {
            event.preventDefault();
            finish(false);
          }
        }}
        aria-label={ariaLabel}
      />
    </span>
  );
}
