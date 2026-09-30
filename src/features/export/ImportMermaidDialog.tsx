import { useState } from "react";

import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { fromMermaid } from "../../domain/mermaid";
import { useTreeStore } from "../../store/treeStore";

const PLACEHOLDER = `flowchart TD
    A[Start] --> B{Choice}
    B -->|yes| C[Do it]
    B -->|no| D[Skip it]`;

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * Paste Mermaid flowchart text; it becomes a new tree (the open one is never
 * touched). Text that can't be a tree stays in the box with the reason shown
 * underneath, so it can be fixed and retried.
 */
export function ImportMermaidDialog({ open, onOpenChange }: Props) {
  const importTree = useTreeStore((s) => s.importTree);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setText("");
      setError(null);
    }
  }

  function submit() {
    const result = fromMermaid(text);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const rootTitle = result.state.nodes[result.state.rootId].title.split("\n")[0].slice(0, 40);
    importTree(rootTitle || "Imported tree", result.state);
    close(false);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Mermaid</DialogTitle>
          <DialogDescription>
            Paste a flowchart. It opens as a new tree; your current one is left alone.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          placeholder={PLACEHOLDER}
          spellCheck={false}
          aria-label="Mermaid flowchart"
          aria-invalid={error !== null}
          className="h-56 w-full resize-none rounded-lg border border-input bg-transparent p-2.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!text.trim()}>
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
