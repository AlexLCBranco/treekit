# Treekit — project summary

_Last updated: 2026-09-29, v0.0.1_

## What it is

A browser app for building decision / consequence trees visually: click and
type instead of writing Mermaid. A sandbox for trying "what if" branches,
then keeping or discarding them. One "stone" of the future "gauntlet"
canvas; sibling of Boardkit (github.com/AlexLCBranco/boardkit), whose stack,
structure and look it mirrors. Out of scope for now: accounts, backend,
cloud sync, collaboration, AI, mobile.

## Stack

Vite, React 19, TypeScript (strict), Zustand, React Flow (`@xyflow/react`)
as the pan/zoom canvas, a small hand-written tidy-tree layout (no layout
library), CSS Modules + design tokens (copied from Boardkit) for the
canvas, Tailwind v4 wired up for menus and dialogs (shadcn/ui components
get added when the first one is needed). Layers:
`app -> features -> components -> store -> domain`; `domain/` is pure
TypeScript with the tree model, tree operations and the layout. Vitest for
tests.

## What works now

- A root node on a pan/zoom canvas with a dot grid and zoom controls
- Add a child: the "+" on a node, or select it and press Tab
- Rename inline: double-click, or Enter/F2 on the selected node; a new
  child opens for naming straight away
- Automatic tidy layout, top-down or left-right (toggle in the header);
  sibling order is kept, long titles wrap, and nodes glide to new places

## What's next

Rest of the MVP, roughly in this order:
- Delete a node / branch, undo/redo
- Auto-save to localStorage, multiple trees
- Edge labels ("yes", "if he dies")
- Per-node colours (the data model and styling hook exist already)
- Collapse/expand a branch (model and layout support it; needs a button)
- Keyboard navigation between nodes; pan to a new node if it lands off-screen
- Export PNG/SVG; Mermaid flowchart import/export
- Git repo on GitHub + Vercel deploy on push to main

## Open problems

- Not in git yet and not deployed
- Mermaid graphs where a node has two parents won't fit the tree model as
  is; the model allows it later (edges are separate records), but the
  layout would need a graph algorithm (dagre/elk) for those
