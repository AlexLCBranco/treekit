/** A filename-safe version of a tree's name; never empty. */
export function fileStem(name: string): string {
  const stem = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .replace(/^[-\s]+|[-\s]+$/g, "");
  return stem || "tree";
}

/** Saves `href` (a data: or blob: URL) as a file, via a temporary link. */
export function downloadHref(href: string, filename: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
}

export function downloadText(text: string, filename: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  downloadHref(url, filename);
  URL.revokeObjectURL(url);
}
