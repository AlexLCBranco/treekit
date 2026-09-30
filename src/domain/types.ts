/**
 * The tree's data model. Pure types: no React, no store.
 *
 * Normalised like Boardkit: flat `Record<id, entity>` maps plus separate
 * arrays of ids for ordering. A node never contains its children; an edge
 * never contains its nodes. That keeps lookups O(1), lets one node's
 * component re-render alone, and makes moves and deletes cheap splices.
 *
 * Edges are first-class records (not just a `parentId` on each node) because
 * they carry their own data -- a label like "yes" / "if he dies" -- and
 * because a Mermaid import can produce a node with two parents. For now the
 * domain keeps the tree invariant (every node except the root has exactly
 * one incoming edge); relaxing it later is a rule change, not a reshape.
 */

type Brand<T, B extends string> = T & { readonly __brand: B };

export type TreeId = Brand<string, "TreeId">;
export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;

/** Fixed swatches, mirrored as `--palette-*` in styles/tokens.css. */
export const PALETTE_COLORS = [
  "slate",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
] as const;
export type PaletteColor = (typeof PALETTE_COLORS)[number];

export interface TreeNode {
  readonly id: NodeId;
  readonly title: string;
  /** `null` = the theme's default node style. */
  readonly color: PaletteColor | null;
  /** Children are hidden (not deleted) while collapsed. */
  readonly collapsed: boolean;
}

export interface TreeEdge {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  /** Optional text drawn on the edge; empty string = no label. */
  readonly label: string;
}

/** Which way the tree grows: top-to-bottom or left-to-right. */
export type LayoutDirection = "TB" | "LR";

/** One whole tree: everything that is saved and undone together. */
export interface TreeState {
  readonly rootId: NodeId;
  readonly nodes: Readonly<Record<NodeId, TreeNode>>;
  readonly edges: Readonly<Record<EdgeId, TreeEdge>>;
  /** Outgoing edges of each node, in sibling order. */
  readonly childEdges: Readonly<Record<NodeId, readonly EdgeId[]>>;
  readonly direction: LayoutDirection;
}

/** A saved tree: its content plus the metadata a tree switcher shows. */
export interface TreeDoc {
  readonly id: TreeId;
  readonly name: string;
  readonly state: TreeState;
}
