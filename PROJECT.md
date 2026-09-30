# Treekit — project summary

_Last updated: 2026-09-29, v0.0.2_

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
canvas, Tailwind v4 wired up for menus and dialogs (shadcn/ui components
get added when the first one is needed), lucide icons. No backend: saved in
the browser's localStorage. Layers:
`app -> features -> components -> store -> domain`; `domain/` is pure
TypeScript (tree model and operations, layout, undo history, save format)
with Vitest tests.

## What works now

- A root node on a pan/zoom canvas with a dot grid and zoom controls
- Add a child: the "+" on a node, or select it and press Tab
- Rename inline: double-click, or Enter/F2 on the selected node; a new
  child opens for naming straight away
- Delete: Delete/Backspace removes a node and its branch; Shift+Delete
  removes just the node and moves its children up
- Undo/redo: header buttons or Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z (or Ctrl+Y);
  adding a child and naming it undo as one step
- Auto-save: the tree is saved as you go and comes back on reload; a
  damaged save opens repaired, with the original kept aside
- Automatic tidy layout, top-down or left-right (toggle in the header);
  sibling order is kept, long titles wrap, and nodes glide to new places
- A shortcut hint in the header that changes with what is selected

## What's next

Rest of the MVP, roughly in this order:
- Multiple trees (the save format already stores each tree separately)
- Edge labels ("yes", "if he dies")
- Per-node colours (the data model and styling hook exist already)
- Collapse/expand a branch (model and layout support it; needs a button)
- Keyboard navigation between nodes; pan to a new node if it lands off-screen
- Export PNG/SVG; Mermaid flowchart import/export

## Open problems

- A repaired save is only reported in the browser console; it needs a
  visible notice (and a way to restore the kept original)
- Delete has no confirmation; undo is the safety net, but undo history is
  lost on reload
- Mermaid graphs where a node has two parents won't fit the tree model as
  is; the model allows it later (edges are separate records), but the
  layout would need a graph algorithm (dagre/elk) for those
