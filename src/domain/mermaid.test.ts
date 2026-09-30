import { describe, expect, it } from "vitest";

import { fromMermaid, toMermaid } from "./mermaid";
import {
  addChild,
  childrenOf,
  createTree,
  expandAll,
  setCollapsed,
  setEdgeLabel,
  setNodeColor,
  renameNode,
  setDirection,
} from "./tree";
import type { NodeId, TreeState } from "./types";

function parsed(text: string): TreeState {
  const result = fromMermaid(text);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

function failure(text: string): string {
  const result = fromMermaid(text);
  if (result.ok) throw new Error("expected an error");
  return result.error;
}

const titles = (state: TreeState, ids: readonly NodeId[]) => ids.map((id) => state.nodes[id].title);

describe("toMermaid", () => {
  it("writes direction, nodes, labelled edges and colours", () => {
    let tree = createTree("Start");
    const a = addChild(tree, tree.rootId, "Yes")!;
    tree = a.state;
    tree = setEdgeLabel(tree, tree.childEdges[tree.rootId][0], "if he dies");
    tree = setNodeColor(tree, a.nodeId!, "red");
    tree = setDirection(tree, "LR");
    expect(toMermaid(tree)).toBe(
      [
        "flowchart LR",
        '    n1["Start"]',
        '    n2["Yes"]',
        '    n1 -->|"if he dies"| n2',
        "    style n2 fill:#f8d2d2,stroke:#e03131",
        "",
      ].join("\n"),
    );
  });

  it("includes branches that are folded away", () => {
    let tree = createTree("Root");
    const child = addChild(tree, tree.rootId, "Kid");
    tree = addChild(child.state, child.nodeId!, "Grandkid").state;
    tree = setCollapsed(tree, tree.rootId, true);
    expect(toMermaid(tree)).toContain("Grandkid");
  });
});

describe("round trip", () => {
  it("keeps titles, order, labels, colours and direction", () => {
    let tree = createTree('He said "hi" <b> #1\nsecond line');
    const a = addChild(tree, tree.rootId, "A");
    const b = addChild(a.state, tree.rootId, "B | pipe");
    const c = addChild(b.state, a.nodeId!, "");
    tree = setEdgeLabel(c.state, c.state.childEdges[tree.rootId][1], 'say "no" | never');
    tree = setNodeColor(tree, b.nodeId!, "purple");
    tree = setDirection(tree, "LR");

    const back = parsed(toMermaid(tree));
    expect(back.direction).toBe("LR");
    expect(back.nodes[back.rootId].title).toBe('He said "hi" <b> #1\nsecond line');
    const [a2, b2] = childrenOf(back, back.rootId);
    expect(titles(back, [a2, b2])).toEqual(["A", "B | pipe"]);
    expect(back.nodes[b2].color).toBe("purple");
    expect(back.edges[back.childEdges[back.rootId][1]].label).toBe('say "no" | never');
    expect(titles(back, childrenOf(back, a2))).toEqual([""]);
  });

  it("does not carry folding over", () => {
    let tree = createTree("Root");
    tree = addChild(tree, tree.rootId, "Kid").state;
    tree = setCollapsed(tree, tree.rootId, true);
    const back = parsed(toMermaid(tree));
    expect(Object.values(back.nodes).some((n) => n.collapsed)).toBe(false);
    expect(Object.keys(back.nodes)).toHaveLength(2);
  });
});

describe("fromMermaid", () => {
  it("reads shapes, quotes, chains and link styles", () => {
    const tree = parsed(`
      graph TD;
      %% a comment
      A[Start] --> B(Round) --> C{Choice}
      C -->|yes| D((Circle))
      C -- no --> E["Quoted (text)"]
      E ==> F
      E -.-> G
      E --- H
    `);
    expect(tree.nodes[tree.rootId].title).toBe("Start");
    const [b] = childrenOf(tree, tree.rootId);
    const [c] = childrenOf(tree, b);
    expect(titles(tree, childrenOf(tree, c))).toEqual(["Circle", "Quoted (text)"]);
    expect(tree.edges[tree.childEdges[c][0]].label).toBe("yes");
    expect(tree.edges[tree.childEdges[c][1]].label).toBe("no");
    const e = childrenOf(tree, c)[1];
    expect(titles(tree, childrenOf(tree, e))).toEqual(["F", "G", "H"]);
  });

  it("supports & lists, LR/RL as left-right and a bare id as its own title", () => {
    const tree = parsed("flowchart RL\n  A --> B & C");
    expect(tree.direction).toBe("LR");
    expect(titles(tree, childrenOf(tree, tree.rootId))).toEqual(["B", "C"]);
  });

  it("accepts a single node and front matter", () => {
    const tree = parsed("---\ntitle: Demo\n---\nflowchart TD\n  only[Only]");
    expect(Object.keys(tree.nodes)).toHaveLength(1);
    expect(tree.nodes[tree.rootId].title).toBe("Only");
  });

  it("uses a later definition's text for a node first seen bare", () => {
    const tree = parsed("flowchart TD\n  A --> B\n  B[Better name]");
    expect(titles(tree, childrenOf(tree, tree.rootId))).toEqual(["Better name"]);
  });

  it("ignores styling it does not understand and reads palette strokes", () => {
    const tree = parsed(
      "flowchart TD\n A --> B\n classDef x fill:#f00\n class B x\n linkStyle 0 stroke:red\n style B fill:#fff,stroke:#2F9E44\n style A fill:#fff,stroke:#123456",
    );
    expect(tree.nodes[tree.rootId].color).toBeNull();
    expect(tree.nodes[childrenOf(tree, tree.rootId)[0]].color).toBe("green");
  });

  it("merges duplicate links between the same nodes", () => {
    const tree = parsed("flowchart TD\n A --> B\n A -->|later| B");
    expect(tree.childEdges[tree.rootId]).toHaveLength(1);
    expect(tree.edges[tree.childEdges[tree.rootId][0]].label).toBe("later");
  });

  it("rejects text that is not a flowchart", () => {
    expect(failure("sequenceDiagram\n A->>B: hi")).toMatch(/flowchart/);
    expect(failure("")).toMatch(/flowchart/);
  });

  it("names a node with two parents", () => {
    expect(failure("flowchart TD\n A[Top] --> C[Both]\n B[Other] --> C\n A --> B")).toMatch(
      /“Both” has two parents/,
    );
  });

  it("rejects several starting points, loops and subgraphs", () => {
    expect(failure("flowchart TD\n A --> B\n C --> D")).toMatch(/2 starting points/);
    expect(failure("flowchart TD\n A --> B\n B --> A")).toMatch(/loops/);
    expect(failure("flowchart TD\n A --> B\n C --> D\n D --> C")).toMatch(/loop/);
    expect(failure("flowchart TD\n A --> A")).toMatch(/itself/);
    expect(failure("flowchart TD\n subgraph one\n A --> B\n end")).toMatch(/Subgraphs/);
  });

  it("reports unreadable and unclosed text instead of throwing", () => {
    expect(failure("flowchart TD\n A --> ")).toMatch(/Couldn't read/);
    expect(failure("flowchart TD\n A[oops --> B")).toMatch(/Missing/);
  });
});

describe("expandAll", () => {
  it("unfolds every node without touching anything else", () => {
    let tree = createTree("Root");
    const child = addChild(tree, tree.rootId, "Kid");
    tree = setCollapsed(child.state, tree.rootId, true);
    const open = expandAll(tree);
    expect(open.nodes[tree.rootId].collapsed).toBe(false);
    expect(open.edges).toBe(tree.edges);
    expect(expandAll(open)).toBe(open);
    expect(renameNode(open, tree.rootId, "X")).not.toBe(open);
  });
});
