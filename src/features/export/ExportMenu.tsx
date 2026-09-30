import { Download } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { toMermaid } from "../../domain/mermaid";
import { useTreeStore } from "../../store/treeStore";
import { downloadHref, downloadText, fileStem } from "./download";
import { ImportMermaidDialog } from "./ImportMermaidDialog";
import { renderTreeImage, type ImageFormat } from "./renderTreeImage";
import styles from "./ExportMenu.module.css";

/**
 * Header menu: save the tree as an image or Mermaid text, or import Mermaid.
 * Everything is read from the store at click time (`getState`), not
 * subscribed to, so the menu never re-renders while you edit.
 */
export function ExportMenu() {
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function flash(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => (current === message ? null : current)), 2500);
  }

  async function saveImage(format: ImageFormat) {
    const { tree, name } = useTreeStore.getState();
    try {
      downloadHref(await renderTreeImage(tree, format), `${fileStem(name)}.${format}`);
    } catch (error) {
      console.error("Image export failed", error);
      flash("Couldn't create the image");
    }
  }

  async function copyMermaid() {
    try {
      await navigator.clipboard.writeText(toMermaid(useTreeStore.getState().tree));
      flash("Mermaid copied");
    } catch {
      flash("Couldn't copy; use “Download Mermaid” instead");
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={styles.trigger} aria-label="Export and import" title="Export and import">
            <Download size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuItem onSelect={() => void saveImage("png")}>Export PNG image</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void saveImage("svg")}>Export SVG image</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void copyMermaid()}>Copy as Mermaid</DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              const { tree, name } = useTreeStore.getState();
              downloadText(toMermaid(tree), `${fileStem(name)}.mmd`);
            }}
          >
            Download Mermaid (.mmd)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setImporting(true)}>Import Mermaid…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {notice && (
        <span className={styles.notice} role="status">
          {notice}
        </span>
      )}
      <ImportMermaidDialog open={importing} onOpenChange={setImporting} />
    </>
  );
}
