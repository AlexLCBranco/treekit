import { beforeEach, describe, expect, it, vi } from "vitest";

import { serializeTree } from "../domain/persistence";
import { createTree } from "../domain/tree";
import type { TreeDoc, TreeId } from "../domain/types";
import { deleteStoredTree, loadRegistry, loadTree, saveTree } from "./persistTree";

/** A minimal in-memory localStorage: the tests run in Node, which has none. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
  };
}

const doc = (id: string, name: string): TreeDoc => ({ id: id as TreeId, name, state: createTree() });

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("tree storage", () => {
  it("lists saved trees in creation order and follows renames", () => {
    saveTree(doc("one", "First"));
    saveTree(doc("two", "Second"));
    saveTree(doc("one", "First, renamed"));
    expect(loadRegistry()).toEqual([
      { id: "one", name: "First, renamed" },
      { id: "two", name: "Second" },
    ]);
  });

  it("picks up a tree saved before the registry existed (v0.0.2)", () => {
    const old = doc("old", "My tree");
    localStorage.setItem("treekit:tree:old", JSON.stringify(serializeTree(old)));
    localStorage.setItem("treekit:active", "old");
    expect(loadRegistry()).toEqual([{ id: "old", name: "My tree" }]);
    expect(loadTree("old" as TreeId)).toEqual(old);
  });

  it("drops registry entries whose tree is gone", () => {
    saveTree(doc("one", "First"));
    saveTree(doc("two", "Second"));
    localStorage.removeItem("treekit:tree:one");
    expect(loadRegistry()).toEqual([{ id: "two", name: "Second" }]);
  });

  it("deletes a tree and its entry", () => {
    saveTree(doc("one", "First"));
    deleteStoredTree("one" as TreeId);
    expect(loadRegistry()).toEqual([]);
    expect(loadTree("one" as TreeId)).toBeNull();
  });

  it("sets a damaged tree aside before handing back the repair", () => {
    const d = doc("one", "First");
    const data = serializeTree(d) as unknown as { doc: { state: { direction: string } } };
    data.doc.state.direction = "sideways";
    localStorage.setItem("treekit:tree:one", JSON.stringify(data));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(loadTree("one" as TreeId)?.state.direction).toBe("TB");
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
    expect(keys.filter((k) => k?.startsWith("treekit:damaged:one:"))).toHaveLength(1);
  });
});
