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

## Workflow

The owner starts a fresh chat for each feature. Each one:

1. Read `PROJECT.md` (and `git log --oneline | head`) to get oriented.
2. Say briefly what you'll build and why, then build it. New pure logic
   goes in `domain/` with tests.
3. `npm run build`, `npm test` and `npm run lint` must pass.
4. Check it in the browser pane (dev server: `treekit` in
   `.claude/launch.json`, port 5180). Clear any `treekit:*` localStorage
   keys you created while testing.
5. Update `PROJECT.md`, bump the patch version, commit on `main`, push, and
   confirm the Vercel deploy (see below).

## Git and deploy

- Repo: github.com/AlexLCBranco/treekit (public). Work on `main`, one
  commit per coherent change, only after the build passes.
- Vercel project `treekit` (team `alexlcbrancos-projects`) is linked to the
  repo: every push to `main` deploys to https://treekit.vercel.app. The
  Vercel CLI is logged in; run it with `npx -y vercel@latest ...`, e.g.
  `ls treekit` to find the latest deployment and `inspect <url> --wait`
  to wait for it.

## Testing in the browser pane

When the Claude window is behind other windows, the pane stops drawing. In
that state `requestAnimationFrame`, `ResizeObserver` and CSS animations
stall, which looks exactly like an app bug:

- nodes never get measured, so edges don't render;
- the glide animation freezes mid-way (fractional positions);
- a closing menu stays open and keeps focus.

If a screenshot times out or things look frozen, suspect the pane first:
retry the screenshot (a successful one makes the page draw), check the DOM
with JavaScript instead, or inject `*{animation:none!important}` to test
menus. Also, after a broken hot reload the pane can keep serving a stale
module; restart the dev server rather than chasing phantom errors.

## Commands

```bash
npm run dev      # dev server
npm run build    # type-check + production build
npm test         # vitest
npm run lint     # oxlint
```
