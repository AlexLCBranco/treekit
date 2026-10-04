# Treekit — project summary

_Last updated: 2026-10-04, v0.0.34_

## What it is

A browser app for building decision / consequence trees visually: click and
type instead of writing Mermaid. A sandbox for trying "what if" branches,
then keeping or discarding them. One "stone" of the future "gauntlet"
canvas; sibling of Boardkit (github.com/AlexLCBranco/boardkit), whose stack,
structure and look it mirrors. Repo: github.com/AlexLCBranco/treekit;
every push to main deploys on Vercel (treekit.vercel.app). Out of scope for
now: accounts, backend, cloud sync, collaboration, AI, mobile.

## Stack

Vite, React 19, TypeScript (strict), Zustand, React Flow (`@xyflow/react`)
as the renderer (camera locked, the page scrolls natively), a small hand-written tidy-tree layout (no layout
library), CSS Modules + design tokens (copied from Boardkit) for the
canvas, Tailwind v4 + shadcn/ui (Radix) for menus and dialogs, lucide
icons, html-to-image for PNG/SVG export. No backend: saved in the browser's localStorage. Layers:
`app -> features -> components -> store -> domain`; `domain/` is pure
TypeScript (tree model and operations, layout, keyboard navigation, page and zoom, undo history,
save format, Mermaid import/export, what the marquee picks, where a
dragged branch drops)
with Vitest tests.

## What works now

- One page, like Boardkit's board, no infinite canvas: no pan. The zoom
  pill (bottom-left, − 100% +, click the % to reset; 50–200%, not
  remembered across visits) is the only zoom, never automatic. The page is
  the size of the screen; when the trees need more room it grows and
  scrollbars appear (wheel or drag the handle). The selected node is scrolled into view (arrows, new child).
  A marquee dragged to the edge never moves the page
- Cursor tools at the bottom of the page: select (the default) and laser
  (drag leaves a fading red trail). Keys V, K; the tool is not remembered
  across visits
- Select tool: dragging empty page draws a marquee that picks every node
  wholly inside it. Edge labels count too: boxing a label picks the node it
  leads to (a label belongs to its node), and every picked node's label
  lights up with it. With two or more picked, a selection bar appears above the
  cursor tools: how many are picked, a colour dropdown (shows the shared
  colour, or a mixed dot), Keep / Maybe / Cut toggles (pressed when all
  have it; pressing again clears it), collapse / expand all their
  branches, delete all their branches, and clear the selection. Each is
  one undo step. The keys do the same (1–8 / 0, X, Space, Delete), and
  the right-click menu on a picked node acts on the whole group too
  (including "Collapse branches" and "Delete N branches"). The picked
  nodes hide their own hover toolbars while grouped. Other shortcuts
  (arrows, Tab, rename) work on the last one picked
- Align panel in the header (Excalidraw-style icons): put the whole tree against the page: left / centre / right and top / middle / bottom; remembered across visits. Aligned to the top, the tree sits just under the header (a small gap); the other edges keep a wider gap for the zoom pill and cursor tools
- Several trees on one board: double-click empty canvas to start another
  tree (open for naming). Trees always sit side by side (in a row top-down,
  a column left-right) from the same start line, and the Align panel places
  the whole row; the click only decides where in the row the new tree goes.
  Arrows walk within a tree, not between trees
- Trash, like Boardkit's: a root's trash button (or Delete on a root) sends
  its whole tree to the header's trash; there you can restore it (to the end
  of the row), delete it for good, or empty the trash. It keeps the last 10
  trees and is saved with the board and undoable. The last tree on a board
  can't be deleted. Other nodes are still deleted straight away (undo)
- Hovering or selecting a node shows a small toolbar floating above it:
  notes, fold/unfold the branch, and a trash button that deletes the node and its
  branch (on a root: sends the tree to the trash), just like Space and Delete.
  Only "+" stays on the node's edge, so nothing crowds the node
- A root node on a dot-grid page
- Nodes lift slightly and show an accent ring on hover, like Boardkit cards
- Notes: every node can hold free multi-line text behind its title. Open
  them with N, the notes button in the hover toolbar, or the right-click
  menu: a side panel (below the header) shows the node's title and a text
  box that saves as you type. While it is open, selecting another node
  (click or arrows) switches the panel to it; Esc or clicking elsewhere
  closes it. One editing session (open to close, or until another node is
  shown) is one undo step. A node with notes shows a small icon on its
  corner, and hovering it shows the first four lines. Notes never change a
  node's size or the layout
- Fork a branch into a new tree, to compare alternatives side by side:
  right-click a node > "Fork branch to new tree", or F. The node and
  everything under it (titles, notes, colours, labels inside the branch,
  fold state) are copied into a new tree right after the current one in
  the row; the copied node becomes its root. The copy shares nothing with
  the original, which is untouched. It is named "<tree name> — <node
  title>" (forking a root gives "<tree name> (copy)") and opens for
  renaming; the fork and its naming are one undo step
- Node status, a non-destructive alternative to deleting: right-click >
  Status: none, keep, maybe or cut; X cuts (or un-cuts) the selected
  node. With several nodes picked by marquee, the menu and X set them all
  as one undo step (right-clicking a node inside the group keeps the group,
  so the menu's colours now apply to all of it too). Keep and maybe are a
  small neutral badge on the node's top-left corner. Cut greys out the node
  and its whole branch (a veil over the node, dashed border and dashed
  lines into it, a scissors badge on the node that was cut); everything
  stays selectable, editable and foldable, and nodes under a cut one keep
  their own status, so un-cutting brings back exactly what was there.
  "Hide cut" in the header (with a count of cut branches) hides them the
  way folding does, closing the gap; it is saved with the board and is an
  undo step. Delete still deletes
- Drag and drop, like a Boardkit card: pick up any node (not a root) and
  it follows the pointer with its whole branch (lifted, a little
  see-through). Drop it on a node to make it that node's last child (the
  node lights up), or on the edge of a node or in the gap beside it to
  slot it in as a sibling there (an accent line shows where). It works
  across trees on the board too. The edge label goes with it, a folded
  node it lands in unfolds, and the branch glides from where you let go
  into place; it ends up selected. Dropping anywhere else, or back where it
  was, glides it home with no change. One undo step. Roots don't drag (a
  tree can't become a branch)
- Add a child: the "+" on a node, or select it and press Tab
- Rename inline: double-click, or Enter/F2 on the selected node; a new
  child opens for naming straight away
- Edge labels ("yes", "if he dies"): select a node and press L, or
  double-click a line or its label, to label the line leading into it;
  clearing the text removes the label. Labels sit just before the child
  they describe (or in the middle of the line for an only child), the
  layout makes room for them, and they light up with the selected node
- Colours: right-click a node for a menu of 8 fixed colours (or none), or
  select it and press 1–8 (0 clears). The node gets a tint and border in
  that colour; lines stay neutral, and new children start uncoloured
- Collapse/expand a branch: the fold button in the hover toolbar, Space on the
  selected node, or the right-click menu. A folded node shows a badge with
  how many nodes it hides (click it to expand); the branch is hidden, not
  deleted, is saved that way, and folding is an undo step. If the selected
  node gets folded away, the selection moves to the folded node; expanding
  grows the branch back out of its node
- Keyboard navigation: arrows move the selection up to the parent, down
  into a child, or along the whole row (crossing to cousins); in a
  left-right tree the arrows turn with it. Going down returns to the child
  you last had selected. With nothing selected, any arrow picks the root
- Delete: Delete/Backspace removes a node and its branch; Shift+Delete
  removes just the node and moves its children up
- Undo/redo: header buttons or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y);
  adding a child and naming it undo as one step
- Auto-save: the tree is saved as you go and comes back on reload; a
  damaged save opens repaired, with the original kept aside. The save
  format is versioned (now v4: v3 added notes, v4 status and the "Hide
  cut" choice); older saves open unchanged
- Automatic tidy layout, top-down or left-right (toggle in the header);
  sibling order is kept, long titles wrap, and nodes glide to new places
- Multiple trees: the tree's name in the header (click to rename) and a
  menu to switch trees, start a new one, duplicate or delete this one
  (with a confirm); each tree keeps its own undo history for the session
- A keyboard button in the header (or press ?) opens a list of every
  shortcut and mouse gesture, like Boardkit's
- Export and import (the download button in the header): PNG or SVG of the
  whole tree (folded branches unfolded, no buttons or selection, titles
  only, in the current light/dark theme; cut branches greyed out, or left
  out while "Hide cut" is on); copy or download the tree as a
  Mermaid flowchart (labels, colours, direction, notes and status
  included; notes go in `%% notes` comment lines, which Mermaid ignores and
  import reads back; status as `keep` / `maybe` / `cut` classes, read back
  from `class` lines or `A:::cut`); import pasted
  Mermaid as a new tree. Import understands the usual flowchart syntax
  (any node shape, `-->`/`---`/`==>`/`-.->`, `|label|` or `-- label -->`,
  chains, `&`) and refuses, naming the node, what a tree can't hold: two
  parents, loops, several starting points, subgraphs

## What's next

The "sandbox" set (notes, fork, keep/maybe/cut) is done. Ideas, not yet
ordered:
- Filter or jump to nodes by status (e.g. "show only keep")
- Colour as a submenu: the right-click menu is getting long
- Mermaid subgraphs, and nodes with two parents (needs a graph layout)
- Import Mermaid with several starting points as several trees on one board
  (export already writes every tree; import still refuses more than one)
- Drag trees (roots) to reorder them in the row
- Drag several marquee-picked nodes at once
- While dragging, scroll the page when the pointer nears its edge
- A visible notice for repaired saves (see open problems)

## Open problems

- A repaired save is only reported in the browser console; it needs a
  visible notice (and a way to restore the kept original)
- Deleting a node has no confirmation; undo is the safety net, but undo
  history is lost on reload (deleting a whole tree does ask first)
- Two tabs open on the same tree overwrite each other's saves
- The JS bundle is ~590 KB (192 KB gzipped); Vite warns above 500 KB. Fine
  for now; splitting it is an option if load time ever matters
- SVG export embeds the page's CSS and draws text in a foreignObject
  (html-to-image): it looks right in browsers but is heavy (~200 KB) and
  editors like Illustrator may not render the text
- Mermaid graphs where a node has two parents won't fit the tree model as
  is; the model allows it later (edges are separate records), but the
  layout would need a graph algorithm (dagre/elk) for those
