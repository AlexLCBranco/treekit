import { createEdgeId, createNodeId } from "./ids";
import { PALETTE_COLORS, type EdgeId, type NodeId, type PaletteColor, type TreeState } from "./types";

/**
 * Mermaid `flowchart` <-> tree. Pure text in, text or tree out.
 *
 * Export writes every node (folded branches included, and every tree on the board), the edge labels, the
 * direction, the node colours and the notes. Notes go in `%% notes` comment
 * lines, which Mermaid ignores and import reads back. Import understands the common flowchart
 * subset -- nodes with any bracket shape, `-->` / `---` / `==>` / `-.->`
 * links with `|label|` or `-- label -->` text, chains (`A --> B --> C`) and
 * `&` lists -- and refuses what a tree cannot hold (two parents, loops,
 * several starting points: a board's other trees are exported, but import
 * opens one tree) with a message that names the offending node.
 */

/**
 * Mermaid needs literal colours, so this mirrors `--palette-*` in
 * styles/tokens.css. Import matches a node's `stroke` against these, so the
 * two lists must stay in step.
 */
const PALETTE_HEX: Readonly<Record<PaletteColor, string>> = {
  slate: "#667085",
  red: "#e03131",
  orange: "#e8590c",
  yellow: "#f0b000",
  green: "#2f9e44",
  teal: "#0ca678",
  blue: "#4c6ef5",
  purple: "#9c36b5",
};

/** `hex` blended over white at `amount` (0-1): a pale fill that keeps text readable. */
function tint(hex: string, amount: number): string {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16);
    return Math.round(value * amount + 255 * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

// ---------------------------------------------------------------- export

/** Text inside quotes: `#` first, so the entities we add are not re-escaped. */
function escapeText(text: string): string {
  return text
    .replace(/#/g, "#35;")
    .replace(/"/g, "#quot;")
    .replace(/</g, "#lt;")
    .replace(/>/g, "#gt;")
    .replace(/\|/g, "#124;")
    .replace(/\r?\n/g, "<br/>");
}

/** The comment line that carries a node's notes: `%% notes n3 "text"`. */
const NOTES_LINE = /^%%\s*notes\s+([\p{L}\p{N}_]+)\s+"(.*)"\s*$/u;

export function toMermaid(state: TreeState): string {
  // Short ids in reading order (depth-first, siblings in order, one root after the other).
  const ids = new Map<NodeId, string>();
  const order: NodeId[] = [];
  const stack: NodeId[] = [...state.roots].reverse();
  let id: NodeId | undefined;
  while ((id = stack.pop()) !== undefined) {
    if (!state.nodes[id]) continue;
    ids.set(id, `n${ids.size + 1}`);
    order.push(id);
    const edges = state.childEdges[id] ?? [];
    for (let i = edges.length - 1; i >= 0; i--) stack.push(state.edges[edges[i]].target);
  }

  const lines = [`flowchart ${state.direction === "TB" ? "TD" : "LR"}`];
  for (const nodeId of order) {
    // A blank title still needs some text: Mermaid rejects empty quotes.
    lines.push(`    ${ids.get(nodeId)}["${escapeText(state.nodes[nodeId].title) || " "}"]`);
  }
  for (const nodeId of order) {
    for (const edgeId of state.childEdges[nodeId] ?? []) {
      const edge = state.edges[edgeId];
      const label = edge.label ? `|"${escapeText(edge.label)}"|` : "";
      lines.push(`    ${ids.get(nodeId)} -->${label} ${ids.get(edge.target)}`);
    }
  }
  for (const nodeId of order) {
    const color = state.nodes[nodeId].color;
    if (!color) continue;
    const hex = PALETTE_HEX[color];
    lines.push(`    style ${ids.get(nodeId)} fill:${tint(hex, 0.22)},stroke:${hex}`);
  }
  for (const nodeId of order) {
    const notes = state.nodes[nodeId].notes;
    if (notes) lines.push(`    %% notes ${ids.get(nodeId)} "${escapeText(notes)}"`);
  }
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------- import

export type MermaidResult =
  | { readonly ok: true; readonly state: TreeState }
  | { readonly ok: false; readonly error: string };

class ImportError extends Error {}

interface Cursor {
  readonly s: string;
  i: number;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };

/** Undoes `escapeText`. Titles and labels are trimmed; notes keep their
    spacing exactly (`trim: false`). */
function decodeText(raw: string, trim = true): string {
  const text = raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/#(\w+);/g, (whole, name: string) => {
      if (/^\d+$/.test(name)) return String.fromCodePoint(Number(name));
      return ENTITIES[name] ?? whole;
    });
  return trim ? text.trim() : text;
}

function unquote(text: string): string {
  const t = text.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/** Bracket pairs for node shapes; longer openers first so `((` beats `(`. */
const SHAPES: readonly (readonly [string, string])[] = [
  ["((", "))"],
  ["([", "])"],
  ["[[", "]]"],
  ["[(", ")]"],
  ["{{", "}}"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  [">", "]"],
];

const NODE_ID = /[\p{L}\p{N}_]+/uy;
const LINK_WITH_TEXT = /(?:--|==)\s+(.+?)\s+(?:-->|---|==>|===)|-\.\s+(.+?)\s+\.->/y;
const LINK_PLAIN = /(?:-\.+->|-{2,}>|={2,}>|-{3,}|={3,})(?:\|([^|]*)\|)?/y;

function skipSpace(c: Cursor) {
  while (c.i < c.s.length && /\s/.test(c.s[c.i])) c.i++;
}

function sticky(re: RegExp, c: Cursor): RegExpExecArray | null {
  re.lastIndex = c.i;
  return re.exec(c.s);
}

/** Parses `id`, `id[text]`, `id("text")`, ... and returns the id and text. */
function parseNode(c: Cursor): { id: string; title: string | null } {
  skipSpace(c);
  const match = sticky(NODE_ID, c);
  if (!match) throw new ImportError(`Couldn't read this part: “${c.s.slice(c.i, c.i + 20)}”`);
  c.i += match[0].length;
  const id = match[0];

  for (const [open, close] of SHAPES) {
    if (!c.s.startsWith(open, c.i)) continue;
    c.i += open.length;
    skipSpace(c);
    let raw: string;
    if (c.s[c.i] === '"') {
      const end = c.s.indexOf('"', c.i + 1);
      if (end < 0) throw new ImportError(`Unclosed quote in the text of “${id}”`);
      raw = c.s.slice(c.i + 1, end);
      c.i = end + 1;
      skipSpace(c);
      if (!c.s.startsWith(close, c.i)) throw new ImportError(`Missing “${close}” after the text of “${id}”`);
    } else {
      const end = c.s.indexOf(close, c.i);
      if (end < 0) throw new ImportError(`Missing “${close}” after the text of “${id}”`);
      raw = c.s.slice(c.i, end);
      c.i = end;
    }
    c.i += close.length;
    return { id, title: decodeText(raw) };
  }
  return { id, title: null };
}

/** One or more nodes joined by `&`. */
function parseNodeList(c: Cursor): { id: string; title: string | null }[] {
  const list = [parseNode(c)];
  for (;;) {
    skipSpace(c);
    if (c.s[c.i] !== "&") return list;
    c.i++;
    list.push(parseNode(c));
  }
}

/** Splits on `;` and newlines, but not inside quotes. */
function splitStatements(text: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of text) {
    if (ch === '"') inQuote = !inQuote;
    if ((ch === "\n" || ch === ";") && !inQuote) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((s) => s.trim()).filter((s) => s && !s.startsWith("%%"));
}

interface Draft {
  readonly titles: Map<string, string>;
  readonly edges: { source: string; target: string; label: string }[];
  readonly colors: Map<string, PaletteColor>;
  readonly notes: Map<string, string>;
}

function parseStatement(statement: string, draft: Draft) {
  const c: Cursor = { s: statement, i: 0 };
  const remember = (nodes: { id: string; title: string | null }[]) => {
    for (const { id, title } of nodes) {
      if (title !== null) draft.titles.set(id, title);
      else if (!draft.titles.has(id)) draft.titles.set(id, id);
    }
  };

  let from = parseNodeList(c);
  remember(from);
  for (;;) {
    skipSpace(c);
    if (c.i >= c.s.length) return;
    let label = "";
    const withText = sticky(LINK_WITH_TEXT, c);
    if (withText) {
      c.i += withText[0].length;
      label = decodeText(unquote(withText[1] ?? withText[2]));
    } else {
      const plain = sticky(LINK_PLAIN, c);
      if (!plain) throw new ImportError(`Couldn't read this part: “${c.s.slice(c.i, c.i + 20)}”`);
      c.i += plain[0].length;
      label = plain[1] ? decodeText(unquote(plain[1])) : "";
    }
    const to = parseNodeList(c);
    remember(to);
    for (const source of from) {
      for (const target of to) draft.edges.push({ source: source.id, target: target.id, label });
    }
    from = to;
  }
}

/** The palette colour whose hex matches the `stroke:` in a `style` line. */
function colorFromStyle(css: string): PaletteColor | null {
  const stroke = /stroke:\s*(#[0-9a-f]{6})/i.exec(css)?.[1].toLowerCase();
  return PALETTE_COLORS.find((name) => PALETTE_HEX[name] === stroke) ?? null;
}

export function fromMermaid(text: string): MermaidResult {
  try {
    return { ok: true, state: parse(text) };
  } catch (error) {
    if (error instanceof ImportError) return { ok: false, error: error.message };
    throw error;
  }
}

function parse(text: string): TreeState {
  // Mermaid Live and docs often start with a `---` front-matter block.
  const body = text.replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, "");
  // Comment lines come out first: they may hold notes, and a stray quote in
  // one must not throw off the quote tracking of the statements after it.
  const notes = new Map<string, string>();
  const code = body
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("%%")) return true;
      const match = NOTES_LINE.exec(trimmed);
      if (match) notes.set(match[1], decodeText(match[2], false));
      return false;
    })
    .join("\n");
  const statements = splitStatements(code);
  const header = /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?$/i.exec(statements[0] ?? "");
  if (!header) {
    throw new ImportError("Only flowcharts are supported: the text should start with “flowchart TD” or “flowchart LR”.");
  }
  const direction = /^(LR|RL)$/i.test(header[1] ?? "") ? "LR" : "TB";

  const draft: Draft = { titles: new Map(), edges: [], colors: new Map(), notes };
  for (const statement of statements.slice(1)) {
    const keyword = /^(\w+)\b/.exec(statement)?.[1]?.toLowerCase();
    if (keyword === "subgraph") throw new ImportError("Subgraphs aren't supported yet.");
    if (keyword === "style") {
      const parts = /^style\s+(\S+)\s+(.+)$/i.exec(statement);
      const color = parts && colorFromStyle(parts[2]);
      if (parts && color) draft.colors.set(parts[1], color);
    } else if (
      keyword &&
      ["classdef", "class", "linkstyle", "click", "direction", "end", "acctitle", "accdescr"].includes(keyword)
    ) {
      continue; // Styling and interaction: nothing a tree keeps.
    } else parseStatement(statement, draft);
  }

  if (draft.titles.size === 0) throw new ImportError("No nodes found.");
  const name = (id: string) => `“${draft.titles.get(id) || id}”`;

  // Fold repeated links between the same two nodes into one.
  const edges: typeof draft.edges = [];
  for (const edge of draft.edges) {
    if (edge.source === edge.target) throw new ImportError(`${name(edge.source)} links to itself; a tree can't loop.`);
    const twin = edges.find((e) => e.source === edge.source && e.target === edge.target);
    if (twin) twin.label ||= edge.label;
    else edges.push({ ...edge });
  }

  const parent = new Map<string, string>();
  for (const { source, target } of edges) {
    const first = parent.get(target);
    if (first !== undefined) {
      throw new ImportError(
        `${name(target)} has two parents (${name(first)} and ${name(source)}). A tree node can only have one.`,
      );
    }
    parent.set(target, source);
  }

  const roots = [...draft.titles.keys()].filter((id) => !parent.has(id));
  if (roots.length === 0) throw new ImportError("Every node has a parent, so the graph loops; a tree needs a starting node.");
  if (roots.length > 1) {
    throw new ImportError(`There are ${roots.length} starting points (${roots.map(name).join(", ")}). A tree needs exactly one.`);
  }

  // Build the state, walking from the root so a loop cut off from it is caught.
  const nodeIds = new Map<string, NodeId>();
  const state = { nodes: {} as Record<NodeId, TreeState["nodes"][NodeId]>, edges: {} as Record<EdgeId, TreeState["edges"][EdgeId]>, childEdges: {} as Record<NodeId, EdgeId[]> };
  const outgoing = new Map<string, typeof edges>();
  for (const edge of edges) outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);

  const visit = (key: string) => {
    const nodeId = createNodeId();
    nodeIds.set(key, nodeId);
    state.nodes[nodeId] = {
      id: nodeId,
      title: draft.titles.get(key) ?? "",
      color: draft.colors.get(key) ?? null,
      collapsed: false,
      notes: draft.notes.get(key) ?? "",
    };
    state.childEdges[nodeId] = [];
    for (const edge of outgoing.get(key) ?? []) {
      const child = visit(edge.target);
      const edgeId = createEdgeId();
      state.edges[edgeId] = { id: edgeId, source: nodeId, target: child, label: edge.label };
      state.childEdges[nodeId].push(edgeId);
    }
    return nodeId;
  };
  const rootId = visit(roots[0]);
  if (nodeIds.size < draft.titles.size) {
    const lost = [...draft.titles.keys()].find((id) => !nodeIds.has(id))!;
    throw new ImportError(`${name(lost)} is part of a loop that never connects to the start; a tree can't loop.`);
  }
  return { roots: [rootId], trash: [], ...state, direction };
}
