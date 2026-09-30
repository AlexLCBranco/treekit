import { describe, expect, it } from "vitest";

import { fromMermaid, toMermaid } from "./mermaid";
import { readTree, serializeTree } from "./persistence";
import { addChild, cloneTree, createTree, setNotes } from "./tree";
import type { TreeDoc, TreeId, TreeState } from "./types";

const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

function parsed(text: string): TreeState {
  const result = fromMermaid(text);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("setNotes", () => {
  it("sets and clears a node's notes, touching only the nodes slice", () => {
    const tree = createTree("Start");
    const root = tree.roots[0];
    expect(tree.nodes[root].notes).toBe("");

    const withNotes = setNotes(tree, root, "He hesitates.\nThen runs.");
    expect(withNotes.nodes[root].notes).toBe("He hesitates.\nThen runs.");
    expect(withNotes.edges).toBe(tree.edges);
    expect(withNotes.childEdges).toBe(tree.childEdges);
    expect(setNotes(withNotes, root, "").nodes[root].notes).toBe("");
  });

  it("returns the same state for no change or a missing node", () => {
    const tree = createTree();
    expect(setNotes(tree, tree.roots[0], "")).toBe(tree);
    expect(setNotes(tree, "ghost" as never, "x")).toBe(tree);
  });

  it("starts new children and new trees without notes, and duplicates keep them", () => {
    const tree = createTree();
    const child = addChild(setNotes(tree, tree.roots[0], "root notes"), tree.roots[0]);
    expect(child.state.nodes[child.nodeId!].notes).toBe("");
    const copy = cloneTree(child.state);
    expect(copy.nodes[copy.roots[0]].notes).toBe("root notes");
  });
});

describe("saving notes", () => {
  it("round-trips notes in the current format", () => {
    const tree = createTree("Start");
    const doc: TreeDoc = { id: "t" as TreeId, name: "T", state: setNotes(tree, tree.roots[0], "a\nb") };
    expect(readTree(roundTrip(serializeTree(doc)))).toEqual({ status: "ok", doc });
  });

  it("opens a version 2 save unchanged, with empty notes and nothing reported as repaired", () => {
    const tree = createTree("Start");
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: tree }));
    data.version = 2;
    for (const node of Object.values(data.doc.state.nodes)) delete (node as { notes?: string }).notes;

    const read = readTree(data);
    expect(read.status).toBe("ok");
    if (read.status === "ok") expect(read.doc.state.nodes[tree.roots[0]].notes).toBe("");
  });

  it("repairs notes of the wrong type", () => {
    const tree = createTree("Start");
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: tree }));
    data.doc.state.nodes[tree.roots[0]].notes = 7;
    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") expect(read.doc.state.nodes[tree.roots[0]].notes).toBe("");
  });

  it("refuses a save from a newer version", () => {
    const data = roundTrip(serializeTree({ id: "t" as TreeId, name: "T", state: createTree() }));
    data.version = 99;
    expect(readTree(data).status).toBe("unreadable");
  });
});

describe("notes in Mermaid", () => {
  it("writes notes as %% comment lines", () => {
    const tree = createTree("Start");
    const text = toMermaid(setNotes(tree, tree.roots[0], 'Line one\nSays "hi" | #1'));
    expect(text).toContain('    %% notes n1 "Line one<br/>Says #quot;hi#quot; #124; #35;1"');
  });

  it("brings notes back on import exactly, spacing and all", () => {
    let tree = createTree("Start");
    const child = addChild(tree, tree.roots[0], "Yes");
    tree = setNotes(child.state, child.nodeId!, "  indented\n\n<br/> literal; and 50% \"quoted\"  ");
    tree = setNotes(tree, tree.roots[0], "root");

    const back = parsed(toMermaid(tree));
    const root = back.roots[0];
    const childId = back.edges[back.childEdges[root][0]].target;
    expect(back.nodes[root].notes).toBe("root");
    expect(back.nodes[childId].notes).toBe(tree.nodes[child.nodeId!].notes);
  });

  it("ignores other comments, even ones with stray quotes, and notes for unknown nodes", () => {
    const back = parsed(['flowchart TD', '%% a "stray quote', "A --> B", '%% notes Z "nobody"'].join("\n"));
    expect(Object.values(back.nodes).map((n) => n.notes)).toEqual(["", ""]);
  });
});
