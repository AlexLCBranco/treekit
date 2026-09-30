# Treekit — project summary

_Last updated: 2026-09-30, v0.0.20_

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
as the pan/zoom canvas, a small hand-written tidy-tree layout (no layout
library), CSS Modules + design tokens (copied from Boardkit) for the
canvas, Tailwind v4 + shadcn/ui (Radix) for menus and dialogs, lucide
icons, html-to-image for PNG/SVG export. No backend: saved in the browser's localStorage. Layers:
`app -> features -> components -> store -> domain`; `domain/` is pure
TypeScript (tree model and operations, layout, keyboard navigation, undo history,
save format, Mermaid import/export)
with Vitest tests.

## What works now

- Cursor tools at the bottom of the canvas, like Excalidraw's presentation
  mode: hand (drag pans, even from a node; nothing gets selected), select
  (the default) and laser (drag leaves a fading red trail). Keys H, V, K;
  the tool is not remembered across visits
- Select tool: dragging empty canvas draws a marquee that picks every node
  it touches (middle-drag still pans). With several picked, 1–8 / 0 colour
  them all and Delete removes their branches, each as one undo step; other
  shortcuts (arrows, Tab, rename) work on the last one picked
- Align panel in the header (Excalidraw-style icons): put the whole tree against the page: left / centre / right and top / middle / bottom; remembered across visits
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
- A root node on a pan/zoom canvas with a dot grid and zoom controls; the mouse wheel scrolls the canvas, Ctrl+wheel or the zoom pill (− 100% +; click the % to reset) zoom
- Nodes lift slightly and show an accent ring on hover, like Boardkit cards
- Add a child: the "+" on a node, or select it and press Tab
- Rename inline: double-click, or Enter/F2 on the selected node; a new
  child opens for naming straight away
- Edge labels ("yes", "if he dies"): select a node and press L, or
  double-click a line or its label, to label the line leading into it;
  clearing the text removes the label. Labels sit just before the child
  they describe, the layout makes room for them, and they light up with
  the selected node
- Colours: right-click a node for a menu of 8 fixed colours (or none), or
  select it and press 1–8 (0 clears). The node gets a tint and border in
  that colour; lines stay neutral, and new children start uncoloured
- Collapse/expand a branch: the "−" beside a node's "+", Space on the
  selected node, or the right-click menu. A folded node shows a badge with
  how many nodes it hides (click it to expand); the branch is hidden, not
  deleted, is saved that way, and folding is an undo step. If the selected
  node gets folded away, the selection moves to the folded node; expanding
  grows the branch back out of its node
- Keyboard navigation: arrows move the selection up to the parent, down
  into a child, or along the whole row (crossing to cousins); in a
  left-right tree the arrows turn with it. Going down returns to the child
  you last had selected. With nothing selected, any arrow picks the root
- The camera follows the selection: if a newly selected or new node would
  be off-screen (or right at the edge), the canvas glides just far enough
  to show it, and otherwise stays still
- Delete: Delete/Backspace removes a node and its branch; Shift+Delete
  removes just the node and moves its children up
- Undo/redo: header buttons or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y);
  adding a child and naming it undo as one step
- Auto-save: the tree is saved as you go and comes back on reload; a
  damaged save opens repaired, with the original kept aside
- Automatic tidy layout, top-down or left-right (toggle in the header);
  sibling order is kept, long titles wrap, and nodes glide to new places
- Multiple trees: the tree's name in the header (click to rename) and a
  menu to switch trees, start a new one, duplicate or delete this one
  (with a confirm); each tree keeps its own undo history for the session
- A keyboard button in the header (or press ?) opens a list of every
  shortcut and mouse gesture, like Boardkit's
- Export and import (the download button in the header): PNG or SVG of the
  whole tree (folded branches unfolded, no buttons or selection, in the
  current light/dark theme); copy or download the tree as a Mermaid
  flowchart (labels, colours and direction included); import pasted
  Mermaid as a new tree. Import understands the usual flowchart syntax
  (any node shape, `-->`/`---`/`==>`/`-.->`, `|label|` or `-- label -->`,
  chains, `&`) and refuses, naming the node, what a tree can't hold: two
  parents, loops, several starting points, subgraphs

## What's next

The MVP list is done. Ideas, not yet ordered:
- Mermaid subgraphs, and nodes with two parents (needs a graph layout)
- Import Mermaid with several starting points as several trees on one board
  (export already writes every tree; import still refuses more than one)
- Drag trees to reorder them in the row
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
