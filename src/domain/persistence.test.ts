import { describe, expect, it } from "vitest";

import { readTree, serializeTree } from "./persistence";
import { addChild, childrenOf, createTree } from "./tree";
import type { NodeId, TreeDoc, TreeId } from "./types";

function sampleDoc(): { doc: TreeDoc; a: NodeId; b: NodeId } {
  const t0 = createTree("root");
  const a = addChild(t0, t0.rootId, "a");
  const b = addChild(a.state, t0.rootId, "b");
  return {
    doc: { id: "t1" as TreeId, name: "My tree", state: b.state },
    a: a.nodeId!,
    b: b.nodeId!,
  };
}

/** A JSON round trip, like a real save and load. */
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("readTree", () => {
  it("reads back exactly what was saved", () => {
    const { doc } = sampleDoc();
    const read = readTree(roundTrip(serializeTree(doc)));
    expect(read).toEqual({ status: "ok", doc });
  });

  it("rejects data with nothing to salvage", () => {
    expect(readTree(null).status).toBe("unreadable");
    expect(readTree({ version: 2, doc: {} }).status).toBe("unreadable");
    const { doc } = sampleDoc();
    const noRoot = roundTrip(serializeTree(doc));
    noRoot.doc.state.rootId = "missing";
    expect(readTree(noRoot).status).toBe("unreadable");
  });

  it("repairs bad fields, dangling edges and forgotten child order", () => {
    const { doc, a, b } = sampleDoc();
    const data = roundTrip(serializeTree(doc));
    const root = doc.state.rootId;
    data.doc.state.nodes[a].title = 42;
    data.doc.state.nodes[a].color = "neon";
    data.doc.state.edges.bad = { id: "bad", source: root, target: "ghost", label: "" };
    data.doc.state.childEdges[root] = [data.doc.state.childEdges[root][1]]; // lost a

    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status !== "repaired") return;
    const state = read.doc.state;
    expect(state.nodes[a]).toMatchObject({ title: "", color: null });
    expect(state.edges["bad" as never]).toBeUndefined();
    // a is not lost: it goes back in after the children still listed.
    expect(childrenOf(state, root)).toEqual([b, a]);
  });

  it("drops nodes the root can no longer reach", () => {
    const { doc, a } = sampleDoc();
    const data = roundTrip(serializeTree(doc));
    const edgeToA = doc.state.childEdges[doc.state.rootId][0];
    delete data.doc.state.edges[edgeToA];

    const read = readTree(data);
    expect(read.status).toBe("repaired");
    if (read.status === "repaired") expect(read.doc.state.nodes[a]).toBeUndefined();
  });
});
