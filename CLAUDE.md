# Treekit — context for Claude

A visual decision-tree builder: one "stone" of the future "gauntlet" canvas,
sibling of Boardkit (`../Projects/boardkit`). Match Boardkit's stack, code
structure and feel. The owner is learning frontend: explain decisions briefly
as you go, and say why when several approaches exist.

## Scope

Out of scope for now: accounts, backend, cloud sync, collaboration, AI
features, mobile. Later (don't design against): discarded branches,
duplicating branches, main vs. draft trees, nodes synced with other stones,
embedding in the gauntlet.

## Rules

- **Layering.** `app -> features -> components -> store -> domain`.
  `domain/` imports no React and no store. Tree operations and the layout
  live there as pure functions with tests.
- **Normalised state.** Nodes and edges in flat `Record<id, …>` maps; child
  order in `childEdges`. Never nest children inside nodes.
- **The store is the source of truth; React Flow only renders.** Positions
  come from `domain/layout.ts`; React Flow's measured node sizes are the only
  thing read back.
- **Subscribe narrowly.** A node component reads only its own node.
- **No hardcoded visual constants.** Everything from `src/styles/tokens.css`.
  Canvas UI is CSS Modules; Tailwind + shadcn/ui only for menus/dialogs.
- **PROJECT.md** is the owner's plain-language snapshot: update it (and its
  "Last updated" line) whenever what's built, what's next or the stack
  changes. Same five sections every time.
- Bump `package.json`'s patch version with every user-visible change (shown
  in the version badge).

## Commands

```bash
npm run dev      # dev server
npm run build    # type-check + production build
npm test         # vitest
npm run lint     # oxlint
```
